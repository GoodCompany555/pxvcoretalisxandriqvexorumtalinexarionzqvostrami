import { registerRpc } from '../services/rpc';
import { db } from '../database';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';

export function setupTransfersHandlers() {
  // Получить все перемещения
  registerRpc('transfers:get-all', async (_event, companyId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const transfers = db.prepare(`
        SELECT t.*, 
               w_from.name as from_warehouse_name,
               w_to.name as to_warehouse_name,
               u.full_name as created_by_name,
               (SELECT COUNT(*) FROM transfer_items WHERE transfer_id = t.id) as items_count,
               (SELECT COALESCE(SUM(quantity), 0) FROM transfer_items WHERE transfer_id = t.id) as total_quantity
        FROM transfers t
        LEFT JOIN warehouses w_from ON t.from_warehouse_id = w_from.id
        LEFT JOIN warehouses w_to ON t.to_warehouse_id = w_to.id
        LEFT JOIN users u ON t.created_by = u.id
        WHERE t.company_id = ?
        ORDER BY t.created_at DESC
      `).all(companyId);
      return { success: true, data: transfers };
    } catch (error: any) {
      log.error('Failed to get transfers:', error);
      return { success: false, error: 'Ошибка загрузки перемещений' };
    }
  });

  // Получить одно перемещение
  registerRpc('transfers:get-one', async (_event, companyId: string, id: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const transfer = db.prepare(`
        SELECT t.*, 
               w_from.name as from_warehouse_name,
               w_to.name as to_warehouse_name,
               u.full_name as created_by_name
        FROM transfers t
        LEFT JOIN warehouses w_from ON t.from_warehouse_id = w_from.id
        LEFT JOIN warehouses w_to ON t.to_warehouse_id = w_to.id
        LEFT JOIN users u ON t.created_by = u.id
        WHERE t.id = ? AND t.company_id = ?
      `).get(id, companyId) as any;

      if (!transfer) return { success: false, error: 'Перемещение не найдено' };

      const items = db.prepare(`
        SELECT ti.*, p.name as product_name, p.barcode as product_barcode, p.measure_unit 
        FROM transfer_items ti
        JOIN products p ON ti.product_id = p.id
        WHERE ti.transfer_id = ?
      `).all(id);

      return { success: true, data: { ...transfer, items } };
    } catch (error: any) {
      log.error('Failed to get transfer:', error);
      return { success: false, error: 'Ошибка загрузки перемещения' };
    }
  });

  // Создать перемещение (черновик)
  registerRpc('transfers:create', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const { companyId, userId, fromWarehouseId, toWarehouseId, docNumber, items } = data;

      if (fromWarehouseId === toWarehouseId) {
        throw new Error('Склад-отправитель и склад-получатель не могут совпадать');
      }

      const transferId = uuidv4();

      const transaction = db.transaction(() => {
        db.prepare(`
          INSERT INTO transfers (id, company_id, doc_number, from_warehouse_id, to_warehouse_id, created_by, status)
          VALUES (?, ?, ?, ?, ?, ?, 'draft')
        `).run(transferId, companyId, docNumber || `TR-${Date.now()}`, fromWarehouseId, toWarehouseId, userId);

        const insertItem = db.prepare(`
          INSERT INTO transfer_items (id, transfer_id, product_id, quantity)
          VALUES (?, ?, ?, ?)
        `);

        for (const item of items) {
          const qty = parseFloat(item.quantity) || 0;
          if (qty > 0) {
            insertItem.run(uuidv4(), transferId, item.productId, qty);
          }
        }
      });

      transaction();
      return { success: true, data: { id: transferId } };
    } catch (error: any) {
      log.error('Failed to create transfer:', error);
      return { success: false, error: error.message || 'Ошибка создания перемещения' };
    }
  });

  // Провести перемещение (изменить остатки)
  registerRpc('transfers:execute', async (_event, companyId: string, id: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      const transaction = db.transaction(() => {
        const transfer = db.prepare('SELECT * FROM transfers WHERE id = ? AND company_id = ?').get(id, companyId) as any;
        if (!transfer) throw new Error('Перемещение не найдено');
        if (transfer.status === 'completed') throw new Error('Перемещение уже проведено');
        if (transfer.status === 'cancelled') throw new Error('Перемещение отменено');

        const items = db.prepare('SELECT * FROM transfer_items WHERE transfer_id = ?').all(id) as any[];

        for (const item of items) {
          // Проверяем остаток на исходном складе
          const sourceInv = db.prepare('SELECT quantity FROM inventory WHERE company_id = ? AND warehouse_id = ? AND product_id = ?').get(companyId, transfer.from_warehouse_id, item.product_id) as any;
          if (!sourceInv || sourceInv.quantity < item.quantity) {
            const product = db.prepare('SELECT name FROM products WHERE id = ?').get(item.product_id) as any;
            throw new Error(`Недостаточно товара "\${product?.name}" на складе-отправителе`);
          }

          // Уменьшаем на исходном
          db.prepare('UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE company_id = ? AND warehouse_id = ? AND product_id = ?')
            .run(item.quantity, companyId, transfer.from_warehouse_id, item.product_id);

          // Увеличиваем на целевом
          const targetInv = db.prepare('SELECT id FROM inventory WHERE company_id = ? AND warehouse_id = ? AND product_id = ?').get(companyId, transfer.to_warehouse_id, item.product_id) as any;
          if (targetInv) {
            db.prepare('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE company_id = ? AND warehouse_id = ? AND product_id = ?')
              .run(item.quantity, companyId, transfer.to_warehouse_id, item.product_id);
          } else {
            db.prepare('INSERT INTO inventory (id, company_id, warehouse_id, product_id, quantity) VALUES (?, ?, ?, ?, ?)')
              .run(uuidv4(), companyId, transfer.to_warehouse_id, item.product_id, item.quantity);
          }
        }

        // Меняем статус
        db.prepare(`
          UPDATE transfers 
          SET status = 'completed', date = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(id);
      });

      transaction();
      return { success: true };
    } catch (error: any) {
      log.error('Failed to execute transfer:', error);
      return { success: false, error: error.message || 'Ошибка проведения перемещения' };
    }
  });

  // Отменить перемещение (если оно draft)
  registerRpc('transfers:cancel', async (_event, companyId: string, id: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      const transfer = db.prepare('SELECT status FROM transfers WHERE id = ? AND company_id = ?').get(id, companyId) as any;
      if (!transfer) throw new Error('Перемещение не найдено');
      if (transfer.status === 'completed') throw new Error('Нельзя отменить проведенное перемещение');

      db.prepare('UPDATE transfers SET status = \'cancelled\' WHERE id = ?').run(id);

      return { success: true };
    } catch (error: any) {
      log.error('Failed to cancel transfer:', error);
      return { success: false, error: error.message || 'Ошибка отмены перемещения' };
    }
  });

  // Получить историю перемещений товара
  registerRpc('transfers:get-product-history', async (_event, companyId: string, productId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const history = db.prepare(`
        SELECT t.*, 
               ti.quantity,
               w_from.name as from_warehouse_name,
               w_to.name as to_warehouse_name,
               u.full_name as created_by_name
        FROM transfer_items ti
        JOIN transfers t ON ti.transfer_id = t.id
        LEFT JOIN warehouses w_from ON t.from_warehouse_id = w_from.id
        LEFT JOIN warehouses w_to ON t.to_warehouse_id = w_to.id
        LEFT JOIN users u ON t.created_by = u.id
        WHERE t.company_id = ? AND ti.product_id = ?
        ORDER BY t.date DESC, t.created_at DESC
      `).all(companyId, productId);

      return { success: true, data: history };
    } catch (error: any) {
      log.error('Failed to get product transfer history:', error);
      return { success: false, error: 'Ошибка загрузки истории перемещений' };
    }
  });
}
