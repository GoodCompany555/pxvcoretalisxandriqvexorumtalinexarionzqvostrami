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
        SELECT ri.*, p.name as product_name, p.name_kk, p.barcode, p.vat_rate 
        FROM receipt_items ri
        JOIN products p ON ri.product_id = p.id
        WHERE ri.receipt_id = ?
      `).all(receipt.id) as any[];

      // Находим, какие позиции из этого чека уже были возвращены ранее
      const previousReturns = db.prepare(`
        SELECT ri.product_id, SUM(ri.quantity) as returned_qty
        FROM receipts r
        JOIN receipt_items ri ON r.id = ri.receipt_id
        WHERE r.type = 'return' AND r.company_id = ? AND r.parent_receipt_id = ?
        GROUP BY ri.product_id
      `).all(companyId, receipt.id) as any[];

      // Строгое правило: возврат по чеку можно сделать только 1 раз
      if (previousReturns.length > 0) {
        return { success: false, error: 'По данному чеку уже был оформлен возврат. Повторный возврат запрещен.' };
      }

      // Добавляем availableQty к каждой позиции (будет равно quantity, так как возвратов еще не было)
      const itemsWithAvailable = items.map((item: any) => ({
        ...item,
        returned_qty: 0,
        available_qty: item.quantity
      }));

      return { success: true, data: { ...receipt, items: itemsWithAvailable } };
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

        // Создаем чек возврата.
        db.prepare(`
          INSERT INTO receipts (
            id, company_id, shift_id, user_id, receipt_number, type, payment_type, 
            total_amount, discount_amount, cash_amount, card_amount, parent_receipt_id
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

        const mainWarehouse = db.prepare('SELECT id FROM warehouses WHERE company_id = ? AND is_main = 1').get(companyId) as { id: string };
        const warehouseId = mainWarehouse?.id;
        if (!warehouseId) throw new Error('Основной склад не найден');

        for (const item of items) {
          insertItem.run(
            uuidv4(), returnReceiptId, item.id, item.quantity, item.price,
            item.discount, item.total, item.mark_code || null
          );

          // Возвращаем на склад
          const currentInv = db.prepare('SELECT id FROM inventory WHERE company_id = ? AND warehouse_id = ? AND product_id = ?').get(companyId, warehouseId, item.id);
          if (currentInv) {
            db.prepare(`
              UPDATE inventory 
              SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
              WHERE company_id = ? AND warehouse_id = ? AND product_id = ?
            `).run(item.quantity, companyId, warehouseId, item.id);
          } else {
            db.prepare(`
              INSERT INTO inventory (id, company_id, warehouse_id, product_id, quantity)
              VALUES (?, ?, ?, ?, ?)
            `).run(uuidv4(), companyId, warehouseId, item.id, item.quantity);
          }
        }

        db.prepare(`
          UPDATE shifts 
          SET total_returns = total_returns + ?, 
              end_cash = end_cash - ?
          WHERE id = ?
        `).run(totalAmount, returnCashAmount, shiftId);

        // Расчет данных для печати (заранее)
        const companyInfo = db.prepare(`SELECT name, bin, address FROM companies WHERE id = ?`).get(companyId) as any;
        const cashier = db.prepare(`SELECT full_name FROM users WHERE id = ?`).get(userId) as any;
        const companySettings = db.prepare('SELECT is_vat_payer, tax_regime FROM settings WHERE company_id = ?').get(companyId) as any;

        let calculatedVatTotal = 0;
        if (companySettings?.is_vat_payer) {
          items.forEach((i: any) => {
            const rate = parseFloat(i.vat_rate || '0');
            if (rate > 0) {
              calculatedVatTotal += Math.round(i.total * (rate / (100 + rate)));
            }
          });
        }

        const printData = {
          companyName: companyInfo?.name || '',
          companyBin: companyInfo?.bin || '',
          companyAddress: companyInfo?.address || '',
          cashierName: cashier?.full_name || 'Кассир',
          receiptNumber,
          items: items.map((i: any) => ({
            name: i.product_name,
            name_kk: i.name_kk,
            quantity: i.quantity,
            price: i.price,
            total: i.total,
            vat_rate: i.vat_rate,
          })),
          totalAmount,
          vatAmount: calculatedVatTotal,
          cashAmount: returnCashAmount,
          cardAmount: returnCardAmount,
          paymentType,
          taxRegime: companySettings?.tax_regime || 'СНР',
          date: new Date().toLocaleString('ru-RU'),
          type: 'return'
        };

        const origRow = db.prepare('SELECT receipt_number, ofd_fiscal_number, ofd_datetime, ofd_registration_number, total_amount FROM receipts WHERE id = ?').get(originalReceiptId) as any;

        // Формируем ReturnBasisDetails для оффлайн очереди
        let queueReturnBasis: any = undefined;
        if (origRow?.ofd_fiscal_number && origRow?.ofd_datetime && origRow?.ofd_registration_number) {
          let isoDateTime = origRow.ofd_datetime;
          const dtMatch = isoDateTime.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2}:\d{2})/);
          if (dtMatch) {
            isoDateTime = `${dtMatch[3]}-${dtMatch[2]}-${dtMatch[1]}T${dtMatch[4]}.000Z`;
          }
          queueReturnBasis = {
            CheckNumber: origRow.ofd_fiscal_number,
            DateTime: isoDateTime,
            RegistrationNumber: origRow.ofd_registration_number,
            Total: origRow.total_amount,
            IsOffline: false
          };
        }

        // В очередь ОФД
        const ofdPayload = JSON.stringify({
          type: 'return',
          moneyCard: returnCardAmount,
          moneyCash: returnCashAmount,
          returnBasisDetails: queueReturnBasis,
          positions: items.map((i: any) => ({
            price: i.price,
            discount: i.discount,
            count: i.quantity,
            taxPercent: i.vat_rate || 0,
            markCode: i.mark_code,
            positionName: i.product_name
          }))
        });

        db.prepare(`
          INSERT INTO ofd_queue (id, receipt_id, payload) VALUES (?, ?, ?)
        `).run(uuidv4(), returnReceiptId, ofdPayload);

        return { returnReceiptId, receiptNumber, printData };
      });

      const { returnReceiptId: newId, receiptNumber, printData } = transaction();

      // Фискализация
      let ofdTicketUrl = '';
      let ofdStatus = 'none';
      try {
        // Находим все данные оригинального чека для ReturnBasisDetails (протокол ОФД 2.0.3+)
        const originalReceipt = db.prepare(
          'SELECT ofd_fiscal_number, ofd_datetime, ofd_registration_number, total_amount, receipt_number FROM receipts WHERE id = ?'
        ).get(originalReceiptId) as any;

        log.info(`Original receipt lookup. ID: ${originalReceiptId}, FiscalNumber: ${originalReceipt?.ofd_fiscal_number}, DateTime: ${originalReceipt?.ofd_datetime}, RegNumber: ${originalReceipt?.ofd_registration_number}, Total: ${originalReceipt?.total_amount}`);

        // Формируем ReturnBasisDetails — обязательный объект для возврата
        let returnBasisDetails: any = undefined;
        if (originalReceipt?.ofd_fiscal_number && originalReceipt?.ofd_datetime && originalReceipt?.ofd_registration_number) {
          // Конвертируем DateTime из формата "20.04.2026 09:57:40" в ISO формат "2026-04-20T09:57:40.000Z"
          let isoDateTime = originalReceipt.ofd_datetime;
          const match = isoDateTime.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2}:\d{2})/);
          if (match) {
            isoDateTime = `${match[3]}-${match[2]}-${match[1]}T${match[4]}.000Z`;
          }

          returnBasisDetails = {
            CheckNumber: originalReceipt.ofd_fiscal_number,
            DateTime: isoDateTime,
            RegistrationNumber: originalReceipt.ofd_registration_number,
            Total: originalReceipt.total_amount,
            IsOffline: false
          };
          log.info('ReturnBasisDetails:', JSON.stringify(returnBasisDetails));
        } else {
          log.warn('WARNING: Original receipt is missing OFD data for ReturnBasisDetails. Return will likely fail.');
        }

        const ofdService = new WebkassaService(companyId);
        const fiscalItems = items.map((i: any) => ({
          name: i.product_name,
          quantity: i.quantity,
          price: i.price,
          total: Math.round((i.total) * 100) / 100,
          discount: i.discount || 0,
          markCode: i.mark_code,
          vatRate: i.vat_rate
        }));

        log.info('Webkassa Return Request Items:', JSON.stringify(fiscalItems));

        const fiscalResult = await ofdService.printTicket({
          id: returnReceiptId,
          receiptNumber,
          type: 'return',
          paymentType: paymentType,
          total: totalAmount,
          cash: returnCashAmount,
          card: returnCardAmount,
          returnBasisDetails: returnBasisDetails,
          items: fiscalItems
        });

        log.info('Webkassa Return Result:', JSON.stringify(fiscalResult));

        if (fiscalResult.success && fiscalResult.ticketUrl) {
          ofdStatus = 'sent';
          ofdTicketUrl = fiscalResult.ticketUrl;
          const ofdFiscalNumber = fiscalResult.ticketNumber || '';

          db.prepare(`
            UPDATE receipts 
            SET ofd_status = 'sent', ofd_ticket_url = ?, ofd_fiscal_number = ?
            WHERE id = ?
          `).run(ofdTicketUrl, ofdFiscalNumber, returnReceiptId);
          db.prepare(`DELETE FROM ofd_queue WHERE receipt_id = ?`).run(returnReceiptId);
        } else if (fiscalResult.error !== 'OFD Disabled') {
          ofdStatus = 'pending';
          db.prepare(`UPDATE receipts SET ofd_status = 'pending' WHERE id = ?`).run(returnReceiptId);
        }
      } catch (e) {
        log.error('Return Fiscalization Error', e);
      }

      return {
        success: true,
        data: {
          receiptId: returnReceiptId,
          ofdStatus,
          ofdTicketUrl,
          printData: { ...printData, ofdTicketUrl }
        }
      };

    } catch (error) {
      log.error('Failed to process return:', error);
      return { success: false, error: 'Ошибка проведения возврата' };
    }
  });
}
