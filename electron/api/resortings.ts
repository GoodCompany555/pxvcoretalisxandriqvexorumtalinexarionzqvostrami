import { registerRpc } from '../services/rpc';
import { db } from '../database';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';

export function setupResortingsHandlers() {
  // Получить все акты пересортицы
  registerRpc('resortings:get-all', async (_event, companyId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      const resortings = db.prepare(`
        SELECT 
          r.id, r.quantity, r.source_price, r.target_price, r.price_diff,
          r.reason, r.status, r.created_at,
          sp.name as source_product_name, sp.barcode as source_barcode,
          tp.name as target_product_name, tp.barcode as target_barcode,
          u.full_name as user_name
        FROM resortings r
        JOIN products sp ON sp.id = r.source_product_id
        JOIN products tp ON tp.id = r.target_product_id
        JOIN users u ON u.id = r.user_id
        WHERE r.company_id = ?
        ORDER BY r.created_at DESC
      `).all(companyId);

      return { success: true, data: resortings };
    } catch (error) {
      log.error('Failed to get resortings:', error);
      return { success: false, error: 'Ошибка загрузки актов пересортицы' };
    }
  });

  // Создать акт пересортицы
  registerRpc('resortings:create', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');

      const { companyId, userId, sourceProductId, targetProductId, quantity, reason } = data;

      if (!sourceProductId || !targetProductId) throw new Error('Укажите оба товара');
      if (sourceProductId === targetProductId) throw new Error('Товар-источник и товар-получатель не могут совпадать');
      if (!quantity || quantity <= 0) throw new Error('Некорректное количество');

      const resortingId = uuidv4();

      const transaction = db.transaction(() => {
        // Получаем цены обоих товаров
        const source = db.prepare('SELECT price_retail FROM products WHERE id = ? AND company_id = ?').get(sourceProductId, companyId) as any;
        const target = db.prepare('SELECT price_retail FROM products WHERE id = ? AND company_id = ?').get(targetProductId, companyId) as any;

        if (!source || !target) throw new Error('Один из товаров не найден');

        const sourcePrice = source.price_retail || 0;
        const targetPrice = target.price_retail || 0;
        const priceDiff = (targetPrice - sourcePrice) * quantity;

        const mainWarehouse = db.prepare('SELECT id FROM warehouses WHERE company_id = ? AND is_main = 1').get(companyId) as { id: string };
        const warehouseId = mainWarehouse?.id;
        if (!warehouseId) throw new Error('Основной склад не найден');

        // Уменьшаем остаток товара-источника (списание)
        const sourceInv = db.prepare('SELECT quantity FROM inventory WHERE company_id = ? AND warehouse_id = ? AND product_id = ?').get(companyId, warehouseId, sourceProductId) as any;
        if (!sourceInv || sourceInv.quantity < quantity) {
          throw new Error('Недостаточно остатков товара-источника на складе');
        }
        db.prepare('UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE company_id = ? AND warehouse_id = ? AND product_id = ?')
          .run(quantity, companyId, warehouseId, sourceProductId);

        // Увеличиваем остаток товара-получателя (оприходование)
        const targetInv = db.prepare('SELECT id FROM inventory WHERE company_id = ? AND warehouse_id = ? AND product_id = ?').get(companyId, warehouseId, targetProductId) as any;
        if (targetInv) {
          db.prepare('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE company_id = ? AND warehouse_id = ? AND product_id = ?')
            .run(quantity, companyId, warehouseId, targetProductId);
        } else {
          db.prepare('INSERT INTO inventory (id, company_id, warehouse_id, product_id, quantity) VALUES (?, ?, ?, ?, ?)')
            .run(uuidv4(), companyId, warehouseId, targetProductId, quantity);
        }

        // Создаем запись акта пересортицы
        db.prepare(`
          INSERT INTO resortings (id, company_id, user_id, source_product_id, target_product_id, quantity, source_price, target_price, price_diff, reason, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
        `).run(resortingId, companyId, userId, sourceProductId, targetProductId, quantity, sourcePrice, targetPrice, priceDiff, reason || null);
      });

      transaction();
      return { success: true, data: { id: resortingId } };
    } catch (error: any) {
      log.error('Failed to create resorting:', error);
      return { success: false, error: error.message || 'Ошибка создания акта пересортицы' };
    }
  });
}
