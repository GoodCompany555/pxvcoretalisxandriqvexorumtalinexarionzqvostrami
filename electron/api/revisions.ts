import { registerRpc } from '../services/rpc';
import { ipcMain } from 'electron';
import { mainWindow } from '../main';
import { db } from '../database';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';

export function setupRevisionsHandlers() {

  // Получить все ревизии
  registerRpc('revisions:get-all', async (_event, companyId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const revisions = db.prepare(`
        SELECT r.*, u.full_name as user_name
        FROM revisions r
        LEFT JOIN users u ON r.responsible_user_id = u.id
        WHERE r.company_id = ?
        ORDER BY r.created_at DESC
      `).all(companyId);
      return { success: true, data: revisions };
    } catch (error: any) {
      log.error('Failed to get revisions:', error);
      return { success: false, error: 'Ошибка загрузки ревизий' };
    }
  });

  // Получить одну ревизию с её товарами
  registerRpc('revisions:get-one', async (_event, companyId: string, id: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const revision = db.prepare(`
        SELECT r.*, u.full_name as user_name
        FROM revisions r
        LEFT JOIN users u ON r.responsible_user_id = u.id
        WHERE r.id = ? AND r.company_id = ?
      `).get(id, companyId) as any;

      if (!revision) return { success: false, error: 'Ревизия не найдена' };

      const items = db.prepare(`
        SELECT ri.*, p.name as product_name, p.barcode as product_barcode, p.measure_unit 
        FROM revision_items ri
        JOIN products p ON ri.product_id = p.id
        WHERE ri.revision_id = ?
      `).all(id);

      return { success: true, data: { ...revision, items } };
    } catch (error: any) {
      log.error('Failed to get revision:', error);
      return { success: false, error: 'Ошибка загрузки ревизии' };
    }
  });

  // Создать новую ревизию (снимок остатков)
  registerRpc('revisions:create', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const { companyId, userId, type, categoryId } = data; // type: 'full', 'category'

      const revisionId = uuidv4();

      const transaction = db.transaction(() => {
        // Создаем заголовок ревизии
        db.prepare(`
          INSERT INTO revisions (id, company_id, revision_type, responsible_user_id, started_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(revisionId, companyId, type, userId);

        const mainWarehouse = db.prepare('SELECT id FROM warehouses WHERE company_id = ? AND is_main = 1').get(companyId) as { id: string };
        const warehouseId = mainWarehouse?.id;
        if (!warehouseId) throw new Error('Основной склад не найден');

        let query = `
          SELECT p.id as product_id, p.price_purchase, IFNULL(i.quantity, 0) as quantity
          FROM products p
          LEFT JOIN inventory i ON p.id = i.product_id AND i.company_id = p.company_id AND i.warehouse_id = ?
          WHERE p.company_id = ? AND p.is_deleted = 0
        `;
        const params: any[] = [warehouseId, companyId];

        if (type === 'category' && categoryId) {
          query += ` AND p.category_id = ?`;
          params.push(categoryId);
        } else if (type === 'supplier' && data.supplierId) {
          query += ` AND p.supplier_id = ?`;
          params.push(data.supplierId);
        }

        const products = db.prepare(query).all(...params) as any[];

        const insertItem = db.prepare(`
          INSERT INTO revision_items (id, revision_id, product_id, system_quantity, unit_price)
          VALUES (?, ?, ?, ?, ?)
        `);

        for (const prod of products) {
          insertItem.run(
            uuidv4(),
            revisionId,
            prod.product_id,
            prod.quantity,
            prod.price_purchase || 0
          );
        }

        // Обновляем общее количество позиций в ревизии
        db.prepare('UPDATE revisions SET total_items = ? WHERE id = ?').run(
          products.length,
          revisionId
        );
      });

      transaction();
      return { success: true, data: { id: revisionId } };
    } catch (error: any) {
      log.error('Failed to create revision:', error);
      return { success: false, error: `Ошибка создания ревизии: ${error.message}` };
    }
  });

  // Обновить фактическое количество товара в ревизии
  registerRpc('revisions:update-item', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const { itemId, revisionId, actualQuantity } = data;

      const item = db.prepare('SELECT system_quantity, unit_price FROM revision_items WHERE id = ?').get(itemId) as any;
      if (!item) throw new Error('Позиция не найдена');

      const diff = actualQuantity - item.system_quantity;
      const diffAmount = diff * item.unit_price;

      db.prepare(`
        UPDATE revision_items 
        SET actual_quantity = ?, difference = ?, difference_amount = ?, status = 'counted'
        WHERE id = ?
      `).run(actualQuantity, diff, diffAmount, itemId);

      return { success: true };
    } catch (error: any) {
      log.error('Failed to update revision item:', error);
      return { success: false, error: 'Ошибка сохранения факта' };
    }
  });

  // Завершить ревизию (применить результаты к складу)
  registerRpc('revisions:complete', async (_event, companyId: string, id: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      const transaction = db.transaction(() => {
        const rev = db.prepare('SELECT status FROM revisions WHERE id = ? AND company_id = ?').get(id, companyId) as any;
        if (!rev || rev.status !== 'draft') throw new Error('Ревизия уже завершена или не найдена');

        // Считаем итоги
        const totals = db.prepare(`
          SELECT 
            SUM(CASE WHEN difference < 0 THEN difference_amount ELSE 0 END) as shortage_amount,
            SUM(CASE WHEN difference > 0 THEN difference_amount ELSE 0 END) as surplus_amount,
            COUNT(CASE WHEN difference = 0 THEN 1 END) as matched_items
          FROM revision_items
          WHERE revision_id = ? AND status = 'counted'
        `).get(id) as any;

        // Помечаем ревизию как завершенную
        db.prepare(`
          UPDATE revisions 
          SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
              shortage_amount = ABS(?), surplus_amount = ?, matched_items = ?
          WHERE id = ?
        `).run(totals.shortage_amount || 0, totals.surplus_amount || 0, totals.matched_items || 0, id);

        // Обновляем остатки на складе
        const items = db.prepare('SELECT * FROM revision_items WHERE revision_id = ? AND status = \'counted\'').all(id) as any[];

        const mainWarehouse = db.prepare('SELECT id FROM warehouses WHERE company_id = ? AND is_main = 1').get(companyId) as { id: string };
        const warehouseId = mainWarehouse?.id;
        if (!warehouseId) throw new Error('Основной склад не найден');

        for (const item of items) {
          if (item.difference === 0) continue; // Нет изменений

          const currentInv = db.prepare('SELECT quantity FROM inventory WHERE company_id = ? AND warehouse_id = ? AND product_id = ?').get(companyId, warehouseId, item.product_id) as any;
          const qty = Math.max(0, item.actual_quantity);
          if (!currentInv) {
            db.prepare('INSERT INTO inventory (id, company_id, warehouse_id, product_id, quantity) VALUES (?, ?, ?, ?, ?)')
              .run(uuidv4(), companyId, warehouseId, item.product_id, qty);
          } else {
            db.prepare('UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE company_id = ? AND warehouse_id = ? AND product_id = ?')
              .run(qty, companyId, warehouseId, item.product_id);
          }
        }
      });

      transaction();
      return { success: true };
    } catch (error: any) {
      log.error('Failed to complete revision:', error);
      return { success: false, error: error.message || 'Ошибка применения результатов ревизии' };
    }
  });

  registerRpc('cancel-revision', async (_, revisionId: string) => {
    try {
      console.log('main: отмена ревизии', revisionId)

      const revision = db.prepare('SELECT * FROM revisions WHERE id = ?').get(revisionId) as any
      console.log('Найдена ревизия:', revision)

      if (!revision) {
        return { success: false, message: 'Ревизия не найдена' }
      }

      if (revision.status === 'completed') {
        return { success: false, message: 'Нельзя отменить завершённую ревизию' }
      }

      if (revision.status === 'cancelled') {
        return { success: false, message: 'Ревизия уже отменена' }
      }

      db.prepare(`
        UPDATE revisions 
        SET status = 'cancelled', completed_at = datetime('now')
        WHERE id = ?
      `).run(revisionId)

      return { success: true }

    } catch (error: any) {
      log.error('Ошибка в main при отмене ревизии:', error)
      return { success: false, message: error.message }
    }
  });

  registerRpc('print-revision-act', async (_, revisionData: any) => {
    try {
      const { BrowserWindow } = require('electron');
      const html = generateRevisionActHTML(revisionData);

      const printWindow = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        }
      });

      // Используем файл для больших документов, чтобы избежать проблем с длиной data-url
      const path = require('path');
      const fs = require('fs');
      const os = require('os');
      const tempPath = path.join(os.tmpdir(), `revision_act_${Date.now()}.html`);
      fs.writeFileSync(tempPath, html);

      await printWindow.loadFile(tempPath);

      // Ждём полной отрисовки (особенно если есть таблицы или шрифты)
      await new Promise(resolve => setTimeout(resolve, 1000));

      printWindow.webContents.print(
        {
          silent: false, // Оставляем false, чтобы пользователь мог выбрать принтер
          printBackground: true,
          deviceName: '',
        },
        (success, errorType) => {
          if (!success) {
            log.error('Ошибка печати:', errorType);
          }
          // Удаляем временный файл
          try { fs.unlinkSync(tempPath); } catch (e) { }
          printWindow.destroy();
        }
      );

    } catch (error: any) {
      log.error('Ошибка печати акта:', error);
      throw error;
    }
  });

}

function generateRevisionActHTML(revision: any): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Акт ревизии</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 12px; padding: 10mm; color: #000; background: #fff; }
    .header { text-align: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #000; }
    .header h1 { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
    .info { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px; padding: 10px; border: 1px solid #eee; background: #f9f9f9; }
    .info-row { margin-bottom: 4px; }
    .info-row label { font-weight: bold; color: #666; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 10px; }
    th { background: #f0f0f0; border: 1px solid #000; padding: 6px 4px; text-align: left; }
    td { border: 1px solid #ccc; padding: 4px; vertical-align: top; }
    .neg { color: #dc2626; font-weight: bold; }
    .pos { color: #16a34a; font-weight: bold; }
    .totals { border: 2px solid #000; padding: 10px; margin-bottom: 25px; background: #fff; }
    .total-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #eee; }
    .total-row:last-child { border-bottom: none; }
    .total-row.bold { font-weight: bold; font-size: 14px; border-top: 1px solid #000; padding-top: 8px; margin-top: 4px; }
    .signs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 40px; }
    .sign-block { text-align: center; }
    .sign-line { border-bottom: 1px solid #000; height: 30px; margin-bottom: 4px; }
    .sign-label { font-size: 9px; color: #666; }
    @media print { 
      body { padding: 0; }
      @page { margin: 10mm; } 
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>АКТ РЕВИЗИИ № ${revision.id.slice?.(0, 8).toUpperCase() || revision.id}</h1>
    <p>Дата: ${new Date(revision.started_at).toLocaleDateString('ru-RU')}</p>
  </div>
  <div class="info">
    <div class="info-row"><label>Склад: </label>${revision.warehouse_name ?? 'Основной'}</div>
    <div class="info-row"><label>Ответственный: </label>${revision.user_name ?? '—'}</div>
    <div class="info-row"><label>Начало: </label>${new Date(revision.started_at).toLocaleString('ru-RU')}</div>
    <div class="info-row"><label>Окончание: </label>${revision.completed_at ? new Date(revision.completed_at).toLocaleString('ru-RU') : '—'}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>№</th><th>Штрихкод</th><th>Наименование</th>
        <th>По системе</th><th>Факт</th><th>Разница</th>
        <th>Цена, ₸</th><th>Сумма, ₸</th>
      </tr>
    </thead>
    <tbody>
      ${(revision.items ?? []).map((item: any, i: number) => `
        <tr>
          <td>${i + 1}</td>
          <td>${item.product_barcode ?? '—'}</td>
          <td>${item.product_name}</td>
          <td>${item.system_quantity}</td>
          <td>${item.actual_quantity ?? '—'}</td>
          <td class="${(item.difference ?? 0) < 0 ? 'neg' : (item.difference ?? 0) > 0 ? 'pos' : ''}">
            ${(item.difference ?? 0) > 0 ? '+' : ''}${item.difference ?? 0}
          </td>
          <td>${item.unit_price?.toLocaleString() ?? '—'}</td>
          <td class="${(item.difference_amount ?? 0) < 0 ? 'neg' : 'pos'}">
            ${item.difference_amount?.toLocaleString() ?? '—'}
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div class="totals">
    <div class="total-row"><span>Позиций проверено:</span><span>${revision.total_items ?? 0}</span></div>
    <div class="total-row neg"><span>Недостача:</span><span>${(revision.shortage_amount ?? 0).toLocaleString('ru-RU')} ₸</span></div>
    <div class="total-row pos"><span>Излишек:</span><span>${(revision.surplus_amount ?? 0).toLocaleString('ru-RU')} ₸</span></div>
    <div class="total-row bold"><span>Итого разница:</span><span>${((revision.surplus_amount ?? 0) - (revision.shortage_amount ?? 0)).toLocaleString('ru-RU')} ₸</span></div>
  </div>
  <div class="signs">
    <div class="sign-block"><div class="sign-line"></div><p>Проводил ревизию</p><p class="sign-label">подпись / ФИО</p></div>
    <div class="sign-block"><div class="sign-line"></div><p>Мат-ответственный</p><p class="sign-label">подпись / ФИО</p></div>
    <div class="sign-block"><div class="sign-line"></div><p>Руководитель</p><p class="sign-label">подпись / ФИО</p></div>
  </div>
</body>
</html>`;
}
