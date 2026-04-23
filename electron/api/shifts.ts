import { registerRpc } from '../services/rpc';
import { ipcMain } from 'electron'
import { mainWindow } from '../main';
import { db } from '../database'
import log from 'electron-log'
import { v4 as uuidv4 } from 'uuid'
import { WebkassaService } from '../services/webkassa'

export function setupShiftHandlers() {
  // Получить текущую открытую смену пользователя
  registerRpc('shifts:get-current', async (_event, companyId: string, userId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      const shift = db.prepare(`
        SELECT * FROM shifts 
        WHERE company_id = ? AND is_closed = 0
        ORDER BY opened_at DESC LIMIT 1
      `).get(companyId) as any;

      if (shift) {
        const openedAt = new Date(shift.opened_at).getTime();
        const now = Date.now();
        const hoursPassed = (now - openedAt) / (1000 * 60 * 60);
        shift.isExpired = hoursPassed >= 24;
        shift.hoursRemaining = Math.max(0, 24 - hoursPassed);
      }

      return { success: true, data: shift || null };
    } catch (error) {
      log.error('Failed to get current shift:', error);
      return { success: false, error: 'Ошибка получения смены' };
    }
  });

  // Открыть смену
  registerRpc('shifts:open', async (_event, companyId: string, userId: string, startCash: number) => {
    try {
      if (!db) throw new Error('Database not initialized');

      // Проверяем нет ли уже открытой
      const openShift = db.prepare('SELECT id FROM shifts WHERE company_id = ? AND is_closed = 0').get(companyId);
      if (openShift) {
        return { success: false, error: 'У вас уже есть открытая смена' };
      }

      const shiftId = uuidv4();

      db.prepare(`
        INSERT INTO shifts (id, company_id, user_id, start_cash, end_cash)
        VALUES (?, ?, ?, ?, ?)
      `).run(shiftId, companyId, userId, startCash, startCash); // Изначально end_cash = start_cash

      return { success: true, data: { id: shiftId } };
    } catch (error) {
      log.error('Failed to open shift:', error);
      return { success: false, error: 'Ошибка открытия смены' };
    }
  });

  // Закрыть смену (Z-отчет)
  registerRpc('shifts:close', async (_event, companyId: string, shiftId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      const transaction = db.transaction(() => {
        const shift = db.prepare('SELECT * FROM shifts WHERE id = ? AND company_id = ? AND is_closed = 0').get(shiftId, companyId) as any;
        if (!shift) throw new Error('Смена не найдена или уже закрыта');

        // В реальном мире тут происходит автоматическая сверка с ОФД (Z-отчет)
        db.prepare(`
          UPDATE shifts 
          SET is_closed = 1, closed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(shiftId);

        return shift;
      });

      const closedShift = transaction();
      return { success: true, data: closedShift };
    } catch (error: any) {
      log.error('Failed to close shift:', error);
      return { success: false, error: error.message || 'Ошибка закрытия смены' };
    }
  });

  // Внесение / Изъятие денег (Служебная операция)
  registerRpc('shifts:cash-operation', async (_event, companyId: string, shiftId: string, type: 'in' | 'out', amount: number) => {
    try {
      if (!db) throw new Error('Database not initialized');

      // 1. Отправляем в ОФД первую очередь, чтобы в случае ошибки ОФД локальная БД не изменилась
      const settings = db.prepare('SELECT ofd_provider FROM settings WHERE company_id = ?').get(companyId) as any;

      let ofdTicketUrl = '';

      const operationId = uuidv4();
      if (settings && settings.ofd_provider && settings.ofd_provider !== 'none') {
        const webkassa = new WebkassaService(companyId);

        const ofdStatus = await webkassa.cashOperation(type, amount, operationId);
        if (!ofdStatus.success && ofdStatus.error !== 'OFD Disabled') {
          throw new Error(ofdStatus.error || 'Ошибка ОФД WebKassa при служебной операции');
        }
        ofdTicketUrl = ofdStatus.ticketUrl || '';
      }

      // 2. Обновляем локальную базу данных
      const transaction = db.transaction(() => {
        const shift = db.prepare('SELECT user_id, end_cash FROM shifts WHERE id = ? AND company_id = ? AND is_closed = 0').get(shiftId, companyId) as { user_id: string, end_cash: number };
        if (!shift) throw new Error('Смена не найдена или закрыта');

        let newCash = shift.end_cash;
        if (type === 'in') newCash += amount;
        else if (type === 'out') {
          if (shift.end_cash < amount) throw new Error('В кассе недостаточно наличных');
          newCash -= amount;
        }

        db.prepare('UPDATE shifts SET end_cash = ? WHERE id = ?').run(newCash, shiftId);

        // Запись операции в таблицу cash_operations
        db.prepare(`
          INSERT INTO cash_operations (id, company_id, shift_id, user_id, type, amount, ofd_ticket_url)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(operationId, companyId, shiftId, shift.user_id, type, amount, ofdTicketUrl);
      });

      transaction();
      return { success: true, data: { ticketUrl: ofdTicketUrl } };
    } catch (error: any) {
      log.error('Failed to perform cash operation:', error);
      return { success: false, error: error.message || 'Ошибка выполнения служебной операции' };
    }
  });

  // История смен (для отчетов)
  registerRpc('shifts:get-history', async (_event, companyId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      const shifts = db.prepare(`
        SELECT s.*, u.full_name as cashier_name 
        FROM shifts s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.company_id = ?
        ORDER BY s.opened_at DESC
      `).all(companyId);

      return { success: true, data: shifts };
    } catch (error) {
      log.error('Failed to get shifts history:', error);
      return { success: false, error: 'Ошибка получения истории смен' };
    }
  });
}
