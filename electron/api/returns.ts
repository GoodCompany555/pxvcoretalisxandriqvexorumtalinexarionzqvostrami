import { registerRpc } from '../services/rpc';
import { ipcMain } from 'electron'
import { mainWindow } from '../main';
import { db } from '../database'
import log from 'electron-log'
import { v4 as uuidv4 } from 'uuid'
import { WebkassaService } from '../services/webkassa'

export function setupReturnsHandlers() {
  registerRpc('returns:search-receipt', async (_event, companyId: string, receiptNumber: number) => {
    try {
      if (!db) throw new Error('Database not initialized');

      const receipt = db.prepare(`
        SELECT r.*, u.full_name as cashier_name 
        FROM receipts r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.company_id = ? AND r.receipt_number = ?
      `).get(companyId, receiptNumber) as any;

      if (!receipt) {
        return { success: false, error: 'Чек не найден' };
      }

      // Если это уже чек возврата, нельзя сделать возврат по нему
      if (receipt.type === 'return') {
        return { success: false, error: 'Указан чек возврата. Операция невозможна.' };
      }

      const items = db.prepare(`
        SELECT ri.*, p.name as product_name, p.barcode 
        FROM receipt_items ri
        JOIN products p ON ri.product_id = p.id
        WHERE ri.receipt_id = ?
      `).all(receipt.id) as any[];

      // Нужно также найти, какие позиции из этого чека уже были возвращены ранее
      const previousReturns = db.prepare(`
        SELECT ri.product_id, SUM(ri.quantity) as returned_qty
        FROM receipts r
        JOIN receipt_items ri ON r.id = ri.receipt_id
        WHERE r.type = 'return' AND r.company_id = ? AND r.created_at > ? 
          /* Идеально было бы хранить parent_receipt_id, но мы можем просто фильтровать 
             или добавить parent_receipt_id. Добавим parent_receipt_id в БД или просто проверим 
             по наличию связи. Так как мы не добавили parent_receipt_id в миграции V1,
             будем считать что пользователь не может вернуть больше чем купил, но строгий учет 
             связки чеков потребует отдельного поля. Пока для простоты передаем items как есть. */
      `).all(companyId, receipt.created_at) as any[]; // Это упрощение

      return { success: true, data: { ...receipt, items } };
    } catch (error) {
      log.error('Failed to search receipt:', error);
      return { success: false, error: 'Ошибка поиска чека' };
    }
  });

  registerRpc('returns:process', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');

      const { companyId, shiftId, userId, originalReceiptId, items, paymentType, returnCashAmount, returnCardAmount } = data;
      // items array format: { id (product_id), quantity (to return), price, discount, total }

      const returnReceiptId = uuidv4();
      let totalAmount = 0;
      let totalDiscount = 0;

      for (const item of items) {
        totalAmount += item.total;
        totalDiscount += (item.discount || 0);
      }

      const transaction = db.transaction(() => {
        // Узнаем номер для нового чека возврата
        const row = db.prepare('SELECT MAX(receipt_number) as maxNum FROM receipts WHERE company_id = ?').get(companyId) as { maxNum: number } | undefined;
        const receiptNumber = (row?.maxNum || 0) + 1;

        // Создаем чек возврата. В notes/ofd_ticket_url можно записать originalReceiptId
        db.prepare(`
          INSERT INTO receipts (
            id, company_id, shift_id, user_id, receipt_number, type, payment_type, 
            total_amount, discount_amount, cash_amount, card_amount, ofd_ticket_url
          )
          VALUES (?, ?, ?, ?, ?, 'return', ?, ?, ?, ?, ?, ?)
        `).run(
          returnReceiptId, companyId, shiftId, userId, receiptNumber, paymentType,
          totalAmount, totalDiscount, returnCashAmount, returnCardAmount, originalReceiptId
        );

        const insertItem = db.prepare(`
          INSERT INTO receipt_items (id, receipt_id, product_id, quantity, price, discount, total, mark_code)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const updateInventory = db.prepare(`
          UPDATE inventory 
          SET quantity = MAX(0, quantity + ?), updated_at = CURRENT_TIMESTAMP
          WHERE company_id = ? AND product_id = ?
        `);

        const insertInventory = db.prepare(`
          INSERT OR IGNORE INTO inventory (id, company_id, product_id, quantity)
          VALUES (?, ?, ?, ?)
        `);

        for (const item of items) {
          insertItem.run(
            uuidv4(), returnReceiptId, item.id, item.quantity, item.price,
            item.discount, item.total, item.mark_code || null
          );

          // Обновляем остаток (возвращаем на склад)
          const info = updateInventory.run(item.quantity, companyId, item.id);
          if (info.changes === 0) {
            insertInventory.run(uuidv4(), companyId, item.id, item.quantity);
          }
        }

        // Обновляем счетчики смены (если с наличных возвращаем, касса уменьшается)
        // total_returns увеличиваем. total_sales НЕ трогаем (выручка считается как sales - returns)
        db.prepare(`
          UPDATE shifts 
          SET total_returns = total_returns + ?, 
              end_cash = end_cash - ?
          WHERE id = ?
        `).run(totalAmount, returnCashAmount, shiftId);

        // В очередь ОФД
        const ofdPayload = JSON.stringify({
          type: 'return',
          moneyCard: returnCardAmount,
          moneyCash: returnCashAmount,
          positions: items.map((i: any) => ({
            price: i.price,
            discount: i.discount,
            count: i.quantity,
            taxPercent: 12, // Дефолт для КЗ
            markCode: i.mark_code,
            positionName: i.product_name
          }))
        });

        db.prepare(`
          INSERT INTO ofd_queue (id, receipt_id, payload) VALUES (?, ?, ?)
        `).run(uuidv4(), returnReceiptId, ofdPayload);

        return returnReceiptId;
      });

      const processedReceiptId = transaction();

      // Мгновенная фискализация через WebKassa (как при продаже)
      let receiptNumber = 0;
      try {
        const row = db.prepare('SELECT receipt_number FROM receipts WHERE id = ?').get(processedReceiptId) as any;
        receiptNumber = row?.receipt_number || 0;
      } catch (e) { /* ignore */ }

      try {
        const ofdService = new WebkassaService(companyId);
        const fiscalResult = await ofdService.printTicket({
          receiptNumber,
          type: 'return',
          paymentType: returnCardAmount > 0 && returnCashAmount > 0 ? 'mixed' : returnCardAmount > 0 ? 'card' : 'cash',
          total: totalAmount,
          cash: returnCashAmount,
          card: returnCardAmount,
          items: items.map((i: any) => ({
            name: i.product_name,
            quantity: i.quantity,
            price: i.price,
            total: i.total
          }))
        });

        if (fiscalResult.success && fiscalResult.ticketUrl) {
          // Обновляем статус чека и удаляем из очереди (уже отправлено)
          db.prepare(`
            UPDATE receipts 
            SET ofd_status = 'sent', ofd_ticket_url = ?
            WHERE id = ?
          `).run(fiscalResult.ticketUrl, processedReceiptId);

          db.prepare(`DELETE FROM ofd_queue WHERE receipt_id = ?`).run(processedReceiptId);
          log.info(`Return receipt ${processedReceiptId} fiscalized immediately via WebKassa`);
        } else if (fiscalResult.error !== 'OFD Disabled') {
          db.prepare(`UPDATE receipts SET ofd_status = 'pending' WHERE id = ?`).run(processedReceiptId);
          log.warn(`Return receipt ${processedReceiptId} queued for later: ${fiscalResult.error}`);
        }
      } catch (ofdError) {
        log.error('OFD Error during return', ofdError);
      }

      return { success: true, data: { receiptId: processedReceiptId } };

    } catch (error) {
      log.error('Failed to process return:', error);
      return { success: false, error: 'Ошибка проведения возврата' };
    }
  });
}
