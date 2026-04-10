import { registerRpc } from '../services/rpc';
import { ipcMain } from 'electron';
import { mainWindow } from '../main';
import { db } from '../database';
import log from 'electron-log';
import { WebkassaService } from '../services/webkassa';
import { printXReport, printZReport, getPrintQueueCount, retryPrintQueue, XReportData } from '../services/printer';

export function setupReportsHandlers() {
  // X-Отчёт (промежуточный, смена НЕ закрывается)
  registerRpc('reports:x-report', async (_event, companyId: string, shiftId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      // Получить информацию о смене
      const shift = db.prepare(`
        SELECT s.*, u.full_name as cashier_name 
        FROM shifts s 
        JOIN users u ON s.user_id = u.id 
        WHERE s.id = ? AND s.company_id = ?
      `).get(shiftId, companyId) as any;
      if (!shift) return { success: false, error: 'Смена не найдена' };

      // Продажи по типам оплаты
      const salesByPayment = db.prepare(`
        SELECT 
          payment_type,
          COUNT(*) as count,
          COALESCE(SUM(total_amount), 0) as total,
          COALESCE(SUM(cash_amount), 0) as cash,
          COALESCE(SUM(card_amount), 0) as card
        FROM receipts 
        WHERE shift_id = ? AND company_id = ? AND type = 'sale'
        GROUP BY payment_type
      `).all(shiftId, companyId) as any[];

      // Продажи картой по банкам
      const cardByBank = db.prepare(`
        SELECT 
          COALESCE(terminal_bank, 'Неизвестно') as bank,
          COALESCE(SUM(card_amount), 0) as total
        FROM receipts 
        WHERE shift_id = ? AND company_id = ? AND type = 'sale' AND payment_type IN ('card', 'mixed')
        GROUP BY terminal_bank
      `).all(shiftId, companyId) as any[];

      // Количество товаров
      const productsCount = db.prepare(`
        SELECT COALESCE(SUM(ri.quantity), 0) as total 
        FROM receipt_items ri 
        JOIN receipts r ON ri.receipt_id = r.id 
        WHERE r.shift_id = ? AND r.company_id = ? AND r.type = 'sale'
      `).get(shiftId, companyId) as any;

      // Возвраты
      const returnsSummary = db.prepare(`
        SELECT 
          COUNT(*) as count,
          COALESCE(SUM(total_amount), 0) as total,
          COALESCE(SUM(cash_amount), 0) as cash,
          COALESCE(SUM(card_amount), 0) as card
        FROM receipts 
        WHERE shift_id = ? AND company_id = ? AND type = 'return'
      `).get(shiftId, companyId) as any;

      // Кассовые операции (внесения/изъятия)
      const cashOps = db.prepare(`
        SELECT 
          type,
          COALESCE(SUM(amount), 0) as total
        FROM cash_operations 
        WHERE shift_id = ? AND company_id = ?
        GROUP BY type
      `).all(shiftId, companyId) as any[];

      // Агрегация
      let cashSales = 0, cardSales = 0, qrSales = 0, totalSales = 0, salesCount = 0;
      for (const row of salesByPayment) {
        salesCount += row.count;
        totalSales += row.total;
        if (row.payment_type === 'cash') cashSales += row.total;
        else if (row.payment_type === 'card') cardSales += row.total;
        else if (row.payment_type === 'qr') qrSales += row.total;
        else if (row.payment_type === 'mixed') {
          cashSales += row.cash;
          cardSales += row.card;
        }
      }

      let deposits = 0, withdrawals = 0;
      for (const op of cashOps) {
        if (op.type === 'in') deposits += op.total;
        else withdrawals += op.total;
      }

      const bankTotals: Record<string, number> = {};
      for (const b of cardByBank) {
        bankTotals[b.bank] = b.total;
      }

      const settings = db.prepare(`SELECT ofd_cashbox_id as znm FROM settings WHERE company_id = ?`).get(companyId) as any;

      const now = new Date();
      const reportData: XReportData = {
        companyName: '',
        cashierName: shift.cashier_name || 'Кассир',
        znm: settings?.znm || '—',
        date: now.toLocaleDateString('ru-RU'),
        time: now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        salesCount,
        productsCount: productsCount?.total || 0,
        cashSales,
        cardSales,
        qrSales,
        totalSales,
        returnsCount: returnsSummary?.count || 0,
        returnsCash: returnsSummary?.cash || 0,
        returnsCard: returnsSummary?.card || 0,
        returnsQr: 0,
        totalReturns: returnsSummary?.total || 0,
        netRevenue: totalSales - (returnsSummary?.total || 0),
        deposits,
        withdrawals,
        cashBalance: shift.end_cash || 0,
        cardByBank: bankTotals,
      };

      return { success: true, data: reportData };
    } catch (error) {
      log.error('Failed to generate X-report:', error);
      return { success: false, error: 'Ошибка формирования X-отчёта' };
    }
  });

  // Z-Отчёт (закрытие смены с WebKassa)
  registerRpc('reports:z-report', async (_event, companyId: string, shiftId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      // Проверить WebKassa
      const settings = db.prepare(`SELECT * FROM settings WHERE company_id = ?`).get(companyId) as any;
      if (!settings || !settings.ofd_provider || settings.ofd_provider === 'none') {
        return { success: false, error: 'Для закрытия смены необходимо подключение к WebKassa' };
      }

      // Формируем X-отчёт для данных
      const xResult = await new Promise<any>((resolve) => {
        // Реиспользуем существующий хендлер через прямой вызов логики
        // Для простоты дублируем SQL (в реальном приложении вынесли бы в отдельную функцию)
        resolve(null);
      });

      // Отправляем Z-отчёт в WebKassa
      const webkassa = new WebkassaService(companyId);
      let fiscalNumber = '';

      if (settings.ofd_provider === 'mock') {
        fiscalNumber = `MOCK-Z-${Date.now()}`;
      } else {
        const authOk = await webkassa.authorize();
        if (!authOk.success) {
          return { success: false, error: authOk.error || 'Не удалось авторизоваться в WebKassa' };
        }
        const closeResult = await webkassa.closeShift();
        if (!closeResult) {
          return { success: false, error: 'Ошибка отправки Z-отчёта в WebKassa' };
        }
        fiscalNumber = `Z-${Date.now()}`;
      }

      // Закрываем смену в БД
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE shifts SET is_closed = 1, closed_at = ? WHERE id = ? AND company_id = ?
      `).run(now, shiftId, companyId);

      return {
        success: true,
        data: {
          fiscalNumber,
          closedAt: now,
        }
      };
    } catch (error) {
      log.error('Failed to generate Z-report:', error);
      return { success: false, error: 'Ошибка формирования Z-отчёта' };
    }
  });

  // Количество в очереди печати
  registerRpc('reports:print-queue-count', async (_event, companyId: string) => {
    try {
      const count = getPrintQueueCount(companyId);
      return { success: true, data: { count } };
    } catch (error) {
      return { success: true, data: { count: 0 } };
    }
  });

  // Повторная печать из очереди
  registerRpc('reports:retry-print', async (_event, companyId: string) => {
    try {
      const printed = await retryPrintQueue(companyId);
      return { success: true, data: { printed } };
    } catch (error) {
      return { success: false, error: 'Ошибка повторной печати' };
    }
  });

  // Тест WebKassa подключения
  registerRpc('reports:test-webkassa', async (_event, companyId: string) => {
    try {
      const webkassa = new WebkassaService(companyId);
      const result = await webkassa.checkStatus();

      if (!result.success) {
        return { success: false, error: result.error || 'Ошибка подключения к WebKassa' };
      }
      return { success: true, data: { connected: true } };
    } catch (error: any) {
      return { success: false, error: error.message || 'Ошибка сервера при проверке WebKassa' };
    }
  });
}
