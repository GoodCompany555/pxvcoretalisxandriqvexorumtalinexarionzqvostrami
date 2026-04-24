import { registerRpc } from '../services/rpc';
import { ipcMain } from 'electron';
import { mainWindow } from '../main';
import { db } from '../database';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';

export function setupPurchasesHandlers() {
  // ==========================================
  // ПОСТАВЩИКИ
  // ==========================================

  registerRpc('suppliers:get-all', async (_event, companyId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const suppliers = db.prepare('SELECT * FROM suppliers WHERE company_id = ? ORDER BY name ASC').all(companyId);
      return { success: true, data: suppliers };
    } catch (error: any) {
      log.error('Failed to get suppliers:', error);
      return { success: false, error: 'Ошибка загрузки поставщиков' };
    }
  });

  registerRpc('suppliers:create', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const { companyId, name, bin, phone, email, address } = data;
      const id = uuidv4();

      db.prepare(`
        INSERT INTO suppliers (id, company_id, name, bin, phone, email, address)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, companyId, name, bin || null, phone || null, email || null, address || null);

      return { success: true, data: { id } };
    } catch (error: any) {
      log.error('Failed to create supplier:', error);
      return { success: false, error: 'Ошибка создания поставщика' };
    }
  });

  registerRpc('suppliers:update', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const { id, companyId, name, bin, phone, email, address } = data;

      db.prepare(`
        UPDATE suppliers 
        SET name = ?, bin = ?, phone = ?, email = ?, address = ?
        WHERE id = ? AND company_id = ?
      `).run(name, bin || null, phone || null, email || null, address || null, id, companyId);

      return { success: true };
    } catch (error: any) {
      log.error('Failed to update supplier:', error);
      return { success: false, error: 'Ошибка обновления поставщика' };
    }
  });

  registerRpc('suppliers:delete', async (_event, companyId: string, id: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      // Check if supplier has purchases
      const hasPurchases = db.prepare('SELECT id FROM purchases WHERE supplier_id = ? LIMIT 1').get(id);
      if (hasPurchases) {
        return { success: false, error: 'Нельзя удалить поставщика, у которого есть приходные накладные' };
      }

      db.prepare('DELETE FROM suppliers WHERE id = ? AND company_id = ?').run(id, companyId);
      return { success: true };
    } catch (error: any) {
      log.error('Failed to delete supplier:', error);
      return { success: false, error: 'Ошибка удаления поставщика' };
    }
  });

  // ==========================================
  // ЗАКУПКИ (ПРИХОДНЫЕ НАКЛАДНЫЕ)
  // ==========================================

  registerRpc('purchases:get-all', async (_event, companyId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const purchases = db.prepare(`
        SELECT p.*, s.name as supplier_name, u.full_name as user_name,
               (SELECT COUNT(id) FROM purchase_items WHERE purchase_id = p.id) as items_count
        FROM purchases p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.company_id = ?
        ORDER BY p.created_at DESC
      `).all(companyId);
      return { success: true, data: purchases };
    } catch (error: any) {
      log.error('Failed to get purchases:', error);
      return { success: false, error: 'Ошибка загрузки закупок' };
    }
  });

  registerRpc('purchases:get-one', async (_event, companyId: string, id: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const purchase = db.prepare(`
        SELECT p.*, s.name as supplier_name 
        FROM purchases p 
        LEFT JOIN suppliers s ON p.supplier_id = s.id 
        WHERE p.id = ? AND p.company_id = ?
      `).get(id, companyId) as any;

      if (!purchase) return { success: false, error: 'Закупка не найдена' };

      const items = db.prepare(`
        SELECT pi.*, pr.name as product_name, pr.barcode, pr.measure_unit 
        FROM purchase_items pi
        JOIN products pr ON pi.product_id = pr.id
        WHERE pi.purchase_id = ?
      `).all(id);

      return { success: true, data: { ...purchase, items } };
    } catch (error: any) {
      log.error('Failed to get purchase:', error);
      return { success: false, error: 'Ошибка загрузки закупки' };
    }
  });

  registerRpc('purchases:create', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const { companyId, supplierId, userId, notes, items } = data;
      // items array format: { productId, quantity, price }

      const purchaseId = uuidv4();
      let totalAmount = 0;

      const transaction = db.transaction(() => {
        // Create purchase
        db.prepare(`
          INSERT INTO purchases (id, company_id, supplier_id, user_id, notes, status)
          VALUES (?, ?, ?, ?, ?, 'draft')
        `).run(purchaseId, companyId, supplierId, userId, notes || null);

        // Add items
        const itemStmt = db.prepare(`
          INSERT INTO purchase_items (id, purchase_id, product_id, quantity, price, total)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const item of items) {
          const qty = parseFloat(item.quantity) || 0;
          const prc = parseFloat(item.price) || 0;
          const tot = qty * prc;
          totalAmount += tot;
          itemStmt.run(uuidv4(), purchaseId, item.productId, qty, prc, tot);
        }

        // Update purchase total
        db.prepare('UPDATE purchases SET total_amount = ? WHERE id = ?').run(totalAmount, purchaseId);
      });

      transaction();
      return { success: true, data: { id: purchaseId } };
    } catch (error: any) {
      log.error('Failed to create purchase:', error);
      return { success: false, error: 'Ошибка создания закупки' };
    }
  });

  registerRpc('purchases:complete', async (_event, companyId: string, id: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      const transaction = db.transaction(() => {
        const purchase = db.prepare('SELECT status FROM purchases WHERE id = ? AND company_id = ?').get(id, companyId) as { status: string };
        if (!purchase) throw new Error('Закупка не найдена');
        if (purchase.status === 'completed') throw new Error('Закупка уже проведена');

        // Mark as completed
        db.prepare(`
          UPDATE purchases 
          SET status = 'completed', completed_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(id);

        // Update inventory and optionally update product purchase price
        const items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(id) as any[];

        const mainWarehouse = db.prepare('SELECT id FROM warehouses WHERE company_id = ? AND is_main = 1').get(companyId) as { id: string };
        const warehouseId = mainWarehouse?.id;
        if (!warehouseId) throw new Error('Основной склад не найден');

        for (const item of items) {
          const currentInv = db.prepare('SELECT quantity FROM inventory WHERE company_id = ? AND warehouse_id = ? AND product_id = ?').get(companyId, warehouseId, item.product_id) as { quantity: number } | undefined;

          if (!currentInv) {
            db.prepare(`
              INSERT INTO inventory (id, company_id, warehouse_id, product_id, quantity) VALUES (?, ?, ?, ?, ?)
            `).run(uuidv4(), companyId, warehouseId, item.product_id, item.quantity);
          } else {
            db.prepare(`
              UPDATE inventory SET quantity = MAX(0, quantity + ?), updated_at = CURRENT_TIMESTAMP WHERE company_id = ? AND warehouse_id = ? AND product_id = ?
            `).run(item.quantity, companyId, warehouseId, item.product_id);
          }

          // Update product's last purchase price automatically
          db.prepare('UPDATE products SET price_purchase = ? WHERE id = ? AND company_id = ?').run(item.price, item.product_id, companyId);
        }
      });

      transaction();
      return { success: true };
    } catch (error: any) {
      log.error('Failed to complete purchase:', error);
      return { success: false, error: error.message || 'Ошибка проведения закупки' };
    }
  });

  registerRpc('purchases:delete', async (_event, companyId: string, id: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      const transaction = db.transaction(() => {
        const purchase = db.prepare('SELECT status FROM purchases WHERE id = ? AND company_id = ?').get(id, companyId) as { status: string };
        if (!purchase) throw new Error('Закупка не найдена');
        if (purchase.status === 'completed') throw new Error('Проведенную закупку нельзя удалить. Сделайте отмену/возврат.');

        db.prepare('DELETE FROM purchases WHERE id = ? AND company_id = ?').run(id, companyId);
      });

      transaction();
      return { success: true };
    } catch (error: any) {
      log.error('Failed to delete purchase:', error);
      return { success: false, error: error.message || 'Ошибка удаления закупки' };
    }
  });

}
