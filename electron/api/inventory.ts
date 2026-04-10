import { registerRpc } from '../services/rpc';
import { ipcMain } from 'electron';
import { mainWindow } from '../main';
import { db } from '../database';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';

export function setupInventoryHandlers() {
  // Получить список товаров с остатками
  registerRpc('inventory:get-products', async (_event, companyId: string, search?: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      let query = `
        SELECT 
          p.id, p.barcode, p.name, p.name_kk, p.price_purchase, p.price_retail, 
          p.measure_unit, p.is_weighable, p.is_marked, p.is_alcohol, p.alcohol_abv, p.alcohol_volume,
          c.name as category_name,
          COALESCE(i.quantity, 0) as stock_quantity
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN inventory i ON p.id = i.product_id AND i.company_id = p.company_id
        WHERE p.company_id = ? AND p.is_deleted = 0
      `;

      const params: any[] = [companyId];

      if (search && search.trim() !== '') {
        query += ` AND (p.name LIKE ? OR p.barcode LIKE ?)`;
        const searchLike = `%${search}%`;
        params.push(searchLike, searchLike);
      }

      query += ' ORDER BY p.name ASC';

      const products = db.prepare(query).all(...params);
      return { success: true, data: products };
    } catch (error) {
      log.error('Failed to get products:', error);
      return { success: false, error: 'Ошибка получения списка товаров' };
    }
  });

  // Создать товар
  registerRpc('inventory:create-product', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const { companyId, barcode, name, name_kk, price_purchase, price_retail, measure_unit, is_weighable, is_marked, is_alcohol, alcohol_abv, alcohol_volume, initial_stock } = data;

      const productId = uuidv4();

      const transaction = db.transaction(() => {
        // Проверка на уникальность штрихкода в рамках компании (среди не удаленных)
        const existing = db.prepare('SELECT id FROM products WHERE company_id = ? AND barcode = ? AND is_deleted = 0').get(companyId, barcode);
        if (existing) {
          throw new Error('Товар с таким штрихкодом уже существует');
        }

        db.prepare(`
          INSERT INTO products(id, company_id, barcode, name, name_kk, price_purchase, price_retail, measure_unit, is_weighable, is_marked, is_alcohol, alcohol_abv, alcohol_volume, is_deleted)
          VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run(productId, companyId, barcode, name, name_kk || null, price_purchase, price_retail, measure_unit, is_weighable ? 1 : 0, is_marked ? 1 : 0, is_alcohol ? 1 : 0, alcohol_abv || null, alcohol_volume || null);

        if (initial_stock && parseFloat(initial_stock) > 0) {
          const invId = uuidv4();
          db.prepare(`
            INSERT INTO inventory(id, company_id, product_id, quantity)
            VALUES(?, ?, ?, ?)
          `).run(invId, companyId, productId, parseFloat(initial_stock));
        }
      });

      transaction();
      return { success: true, data: { id: productId } };
    } catch (error: any) {
      log.error('Failed to create product:', error);
      return { success: false, error: error.message || 'Ошибка создания товара' };
    }
  });

  // Удалить товар
  registerRpc('inventory:delete-product', async (_event, companyId: string, productId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      const transaction = db.transaction(() => {
        // Пытаемся удалить из inventory
        db.prepare('DELETE FROM inventory WHERE company_id = ? AND product_id = ?').run(companyId, productId);
        // Пытаемся удалить продукт
        db.prepare('DELETE FROM products WHERE company_id = ? AND id = ?').run(companyId, productId);
      });

      try {
        transaction();
      } catch (sqlErr: any) {
        // Если база не дает удалить из-за истории (FOREIGN KEY) – делаем Soft Delete
        if (sqlErr.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || sqlErr.message.includes('FOREIGN KEY')) {
          log.warn(`Soft deleting product ${productId} due to FK constraints.`);
          db.prepare('UPDATE products SET is_deleted = 1 WHERE company_id = ? AND id = ?').run(companyId, productId);
          // Убираем товар с остатков (если нужно) или просто прячем.
        } else {
          throw sqlErr;
        }
      }

      return { success: true };
    } catch (error) {
      log.error('Failed to delete product:', error);
      return { success: false, error: 'Ошибка удаления товара' };
    }
  });

  // Обновить товар
  registerRpc('inventory:update-product', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const { companyId, productId, barcode, name, name_kk, price_purchase, price_retail, measure_unit, is_weighable, is_marked, is_alcohol, alcohol_abv, alcohol_volume } = data;

      // Проверка уникальности штрихкода (кроме текущего товара)
      const existing = db.prepare('SELECT id FROM products WHERE company_id = ? AND barcode = ? AND id != ?').get(companyId, barcode, productId) as any;
      if (existing) {
        return { success: false, error: 'Другой товар с таким штрихкодом уже существует' };
      }

      db.prepare(`
        UPDATE products
        SET barcode = ?, name = ?, name_kk = ?, price_purchase = ?, price_retail = ?,
            measure_unit = ?, is_weighable = ?, is_marked = ?, is_alcohol = ?, alcohol_abv = ?, alcohol_volume = ?
        WHERE id = ? AND company_id = ?
      `).run(barcode, name, name_kk || null, price_purchase, price_retail, measure_unit, is_weighable ? 1 : 0, is_marked ? 1 : 0, is_alcohol ? 1 : 0, alcohol_abv || null, alcohol_volume || null, productId, companyId);

      return { success: true };
    } catch (error: any) {
      log.error('Failed to update product:', error);
      return { success: false, error: error.message || 'Ошибка обновления товара' };
    }
  });


  // Обновление остатков (Списание, Оприходование, Инвентаризация)
  registerRpc('inventory:update-stock', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const { companyId, productId, type, quantity, reason } = data;
      // type: 'add' (Оприходование), 'remove' (Списание), 'set' (Инвентаризация/Установка точного значения)

      const transaction = db.transaction(() => {
        // Проверяем существует ли запись в инвентаре
        const current = db.prepare('SELECT quantity FROM inventory WHERE company_id = ? AND product_id = ?').get(companyId, productId) as { quantity: number } | undefined;

        let newQuantity = 0;

        if (!current) {
          // Если записи нет, создаем
          if (type === 'set' || type === 'add') newQuantity = parseFloat(quantity);
          if (type === 'remove') newQuantity = -parseFloat(quantity);

          db.prepare(`
            INSERT INTO inventory (id, company_id, product_id, quantity)
            VALUES (?, ?, ?, ?)
          `).run(uuidv4(), companyId, productId, newQuantity);
        } else {
          if (type === 'set') newQuantity = parseFloat(quantity);
          if (type === 'add') newQuantity = current.quantity + parseFloat(quantity);
          if (type === 'remove') newQuantity = current.quantity - parseFloat(quantity);

          newQuantity = Math.max(0, newQuantity);

          db.prepare(`
            UPDATE inventory 
            SET quantity = ?, updated_at = CURRENT_TIMESTAMP
            WHERE company_id = ? AND product_id = ?
          `).run(newQuantity, companyId, productId);
        }

        // TODO: В идеале тут еще нужно писать лог движения товаров (таблица stock_movements)
        // пока просто обновляем количество
      });

      transaction();
      return { success: true };
    } catch (error: any) {
      log.error('Failed to update stock:', error);
      return { success: false, error: error.message || 'Ошибка обновления остатков' };
    }
  });
}
