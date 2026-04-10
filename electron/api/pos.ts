import { registerRpc } from '../services/rpc';
import { ipcMain } from 'electron'
import { mainWindow } from '../main';
import { db } from '../database'
import log from 'electron-log'
import { v4 as uuidv4 } from 'uuid'
import { WebkassaService } from '../services/webkassa'
import { printReceipt } from '../services/printer'

export function setupPosHandlers() {
  // Поиск товара (по штрихкоду или названию)
  registerRpc('pos:search-product', async (_event, companyId: string, query: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      // Сначала ищем точное совпадение по штрихкоду
      let product = db.prepare(`
        SELECT id, barcode, name, price_retail, measure_unit, is_weighable, is_marked
        FROM products 
        WHERE company_id = ? AND barcode = ? AND is_deleted = 0
      `).get(companyId, query);

      // Если по штрихкоду не нашли — ищем по названию
      if (!product) {
        const products = db.prepare(`
          SELECT id, barcode, name, price_retail, measure_unit, is_weighable, is_marked
          FROM products 
          WHERE company_id = ? AND name LIKE ? AND is_deleted = 0
          LIMIT 10
        `).all(companyId, `%${query}%`);

        return { success: true, data: products, type: 'list' };
      }

      return { success: true, data: product, type: 'exact' };
    } catch (error) {
      log.error('Failed to search product:', error);
      return { success: false, error: 'Ошибка поиска товара' };
    }
  });

  // Валидация кода маркировки (DataMatrix / GS1)
  registerRpc('pos:validate-mark-code', async (_event, companyId: string, markCode: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      // Проверяем, использовался ли код ранее
      const existing = db.prepare(`
        SELECT ri.id, r.receipt_number, r.created_at 
        FROM receipt_items ri
        JOIN receipts r ON r.id = ri.receipt_id
        WHERE ri.mark_code = ? AND r.company_id = ? AND r.type = 'sale'
      `).get(markCode, companyId) as any;

      if (existing) {
        return {
          success: true,
          valid: false,
          error: `Код уже использован в чеке #${existing.receipt_number} от ${existing.created_at}`
        };
      }

      return { success: true, valid: true };
    } catch (error) {
      log.error('Failed to validate mark code:', error);
      return { success: false, error: 'Ошибка проверки кода маркировки' };
    }
  });

  // Проведение продажи
  registerRpc('pos:process-sale', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');

      const { companyId, shiftId, userId, paymentType, items, globalDiscount, cashAmount, cardAmount } = data;

      // Проверка: все маркированные товары должны иметь mark_code
      for (const item of items) {
        if (item.is_marked && !item.mark_code) {
          return { success: false, error: `Товар "${item.name}" является маркированным, но не имеет кода маркировки (DataMatrix)` };
        }
      }
      const receiptId = uuidv4();

      // Вычисляем итоговую сумму
      let totalAmount = 0;
      for (const item of items) {
        totalAmount += item.subtotal;
      }
      totalAmount = Math.max(0, totalAmount - globalDiscount);

      let receiptNumber = 0;

      const transaction = db.transaction(() => {
        const row = db.prepare('SELECT MAX(receipt_number) as maxNum FROM receipts WHERE company_id = ?').get(companyId) as { maxNum: number } | undefined;
        receiptNumber = (row?.maxNum || 0) + 1;

        db.prepare(`
          INSERT INTO receipts (
            id, company_id, shift_id, user_id, receipt_number, type, payment_type, 
            total_amount, discount_amount, cash_amount, card_amount
          )
          VALUES (?, ?, ?, ?, ?, 'sale', ?, ?, ?, ?, ?)
        `).run(
          receiptId, companyId, shiftId, userId, receiptNumber, paymentType,
          totalAmount, globalDiscount, cashAmount, cardAmount
        );

        const insertItem = db.prepare(`
          INSERT INTO receipt_items (id, receipt_id, product_id, quantity, price, discount, total, mark_code)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const updateInventory = db.prepare(`
          UPDATE inventory 
          SET quantity = MAX(0, quantity - ?), updated_at = CURRENT_TIMESTAMP
          WHERE company_id = ? AND product_id = ?
        `);

        const insertInventory = db.prepare(`
          INSERT OR IGNORE INTO inventory (id, company_id, product_id, quantity)
          VALUES (?, ?, ?, ?)
        `);

        for (const item of items) {
          const itemId = uuidv4();
          insertItem.run(
            itemId, receiptId, item.id, item.quantity, item.price_retail,
            item.discount, item.subtotal, item.mark_code || null
          );

          const info = updateInventory.run(item.quantity, companyId, item.id);
          if (info.changes === 0) {
            insertInventory.run(uuidv4(), companyId, item.id, -item.quantity);
          }
        }

        db.prepare(`
          UPDATE shifts 
          SET total_sales = total_sales + ?, 
              end_cash = end_cash + ?
          WHERE id = ?
        `).run(totalAmount, cashAmount, shiftId);

        return receiptId;
      });

      const processedReceiptId = transaction();

      // 5. Фискализация чека через ОФД (WebKassa)
      let ofdStatus = 'none';
      let ofdTicketUrl = '';

      try {
        const ofdService = new WebkassaService(companyId);
        const fiscalResult = await ofdService.printTicket({
          receiptNumber,
          type: 'sale',
          paymentType: paymentType,
          total: totalAmount,
          cash: cashAmount,
          card: cardAmount,
          items: items.map((i: any) => ({
            name: i.name,
            quantity: i.quantity,
            price: i.price_retail,
            total: i.subtotal
          }))
        });

        if (fiscalResult.success && fiscalResult.ticketUrl) {
          ofdStatus = 'sent';
          ofdTicketUrl = fiscalResult.ticketUrl;

          db.prepare(`
            UPDATE receipts 
            SET ofd_status = ?, ofd_ticket_url = ?
            WHERE id = ?
          `).run(ofdStatus, ofdTicketUrl, processedReceiptId);

        } else {
          if (fiscalResult.error !== 'OFD Disabled') {
            ofdStatus = 'pending';
            db.prepare(`UPDATE receipts SET ofd_status = ? WHERE id = ?`).run(ofdStatus, processedReceiptId);
          }
        }
      } catch (ofdError) {
        log.error('OFD Error during sale', ofdError);
      }

      // 6. Получение данных для печати (чтобы вернуть на фронт для ручной или автопечати)
      let printData = null;
      try {
        const companyInfo = db.prepare(`
          SELECT c.name, c.bin, c.address 
          FROM companies c 
          WHERE c.id = ?
        `).get(companyId) as any;

        const cashier = db.prepare(`SELECT full_name FROM users WHERE id = ?`).get(userId) as any;

        printData = {
          companyName: companyInfo?.name || 'Магазин',
          companyBin: companyInfo?.bin || '',
          companyAddress: companyInfo?.address || '',
          cashierName: cashier?.full_name || 'Кассир',
          receiptNumber,
          items: items.map((i: any) => ({
            name: i.name,
            name_kk: i.name_kk,
            quantity: i.quantity,
            price: i.price_retail,
            total: i.subtotal,
          })),
          totalAmount,
          vatAmount: Math.round(totalAmount * 12 / 112),
          cashAmount: cashAmount || 0,
          cardAmount: cardAmount || 0,
          paymentType,
          ofdTicketUrl: ofdTicketUrl || undefined,
          date: new Date().toLocaleString('ru-RU'),
        };
      } catch (err) {
        log.error('Failed to prepare print data:', err);
      }

      return {
        success: true,
        data: {
          receiptId: processedReceiptId,
          ofdStatus,
          ofdTicketUrl,
          printData
        }
      };

    } catch (error) {
      log.error('Failed to process sale:', error);
      return { success: false, error: 'Ошибка проведения продажи' };
    }
  });

  // Получить историю чеков (последние 200)
  registerRpc('pos:get-receipts', async (_event, companyId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const receipts = db.prepare(`
        SELECT r.*, u.full_name as cashier_name
        FROM receipts r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.company_id = ?
        ORDER BY r.created_at DESC
        LIMIT 200
      `).all(companyId);
      return { success: true, data: receipts };
    } catch (error) {
      log.error('Failed to get receipts:', error);
      return { success: false, error: 'Ошибка загрузки чеков' };
    }
  });

  // Получить детали чека (с товарами)
  registerRpc('pos:get-receipt-details', async (_event, companyId: string, receiptId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const receipt = db.prepare(`
        SELECT r.*, u.full_name as cashier_name
        FROM receipts r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.id = ? AND r.company_id = ?
      `).get(receiptId, companyId) as any;
      if (!receipt) return { success: false, error: 'Чек не найден' };

      const items = db.prepare(`
        SELECT ri.*, p.name, p.barcode, p.measure_unit
        FROM receipt_items ri
        LEFT JOIN products p ON ri.product_id = p.id
        WHERE ri.receipt_id = ?
      `).all(receiptId);

      return { success: true, data: { ...receipt, items } };
    } catch (error) {
      log.error('Failed to get receipt details:', error);
      return { success: false, error: 'Ошибка загрузки деталей чека' };
    }
  });

  // Повторная печать чека (дубликат)
  registerRpc('pos:reprint-receipt', async (_event, companyId: string, receiptId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      // Просто возвращаем данные чека для печати на frontend
      const receipt = db.prepare(`
        SELECT r.*, u.full_name as cashier_name
        FROM receipts r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.id = ? AND r.company_id = ?
      `).get(receiptId, companyId) as any;
      if (!receipt) return { success: false, error: 'Чек не найден' };

      const items = db.prepare(`
        SELECT ri.*, p.name, p.barcode, p.measure_unit
        FROM receipt_items ri
        LEFT JOIN products p ON ri.product_id = p.id
        WHERE ri.receipt_id = ?
      `).all(receiptId);

      return { success: true, data: { ...receipt, items } };
    } catch (error) {
      log.error('Failed to reprint receipt:', error);
      return { success: false, error: 'Ошибка печати дубликата' };
    }
  });
}
