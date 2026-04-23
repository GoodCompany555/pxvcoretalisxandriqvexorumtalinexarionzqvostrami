import { registerRpc } from '../services/rpc';
import { ipcMain } from 'electron';
import { mainWindow } from '../main';
import { db } from '../database';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';
import { pingTerminal, sendPurchase, cancelTransaction, TerminalConfig } from '../services/terminal';

export function setupTerminalsHandlers() {
  // Получить все терминалы компании
  registerRpc('terminals:get-all', async (_event, companyId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const terminals = db.prepare(`
        SELECT * FROM pos_terminals WHERE company_id = ? ORDER BY created_at DESC
      `).all(companyId);
      return { success: true, data: terminals };
    } catch (error) {
      log.error('Failed to get terminals:', error);
      return { success: false, error: 'Ошибка загрузки терминалов' };
    }
  });

  // Создать терминал
  registerRpc('terminals:create', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const id = uuidv4();
      db.prepare(`
        INSERT INTO pos_terminals (id, company_id, bank_name, model, connection_type, address, port, baud_rate, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(id, data.companyId, data.bankName, data.model || '', data.connectionType, data.address, data.port || 0, data.baudRate || 9600);
      return { success: true, data: { id } };
    } catch (error) {
      log.error('Failed to create terminal:', error);
      return { success: false, error: 'Ошибка добавления терминала' };
    }
  });

  // Удалить терминал
  registerRpc('terminals:delete', async (_event, companyId: string, id: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      db.prepare(`DELETE FROM pos_terminals WHERE id = ? AND company_id = ?`).run(id, companyId);
      return { success: true };
    } catch (error) {
      log.error('Failed to delete terminal:', error);
      return { success: false, error: 'Ошибка удаления терминала' };
    }
  });

  // Пинг терминала
  registerRpc('terminals:ping', async (_event, companyId: string, terminalId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const terminal = db.prepare(`SELECT * FROM pos_terminals WHERE id = ? AND company_id = ?`).get(terminalId, companyId) as any;
      if (!terminal) return { success: false, error: 'Терминал не найден' };

      const config: TerminalConfig = {
        id: terminal.id,
        bank_name: terminal.bank_name,
        model: terminal.model,
        connection_type: terminal.connection_type,
        address: terminal.address,
        port: terminal.port,
        baud_rate: terminal.baud_rate,
      };

      const online = await pingTerminal(config);
      return { success: true, data: { online } };
    } catch (error) {
      log.error('Failed to ping terminal:', error);
      return { success: false, error: 'Ошибка проверки соединения' };
    }
  });

  // Отправить оплату на терминал
  registerRpc('terminals:purchase', async (_event, companyId: string, terminalId: string, amountTenge: number) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const terminal = db.prepare(`SELECT * FROM pos_terminals WHERE id = ? AND company_id = ?`).get(terminalId, companyId) as any;
      if (!terminal) return { success: false, error: 'Терминал не найден' };

      const config: TerminalConfig = {
        id: terminal.id,
        bank_name: terminal.bank_name,
        model: terminal.model,
        connection_type: terminal.connection_type,
        address: terminal.address,
        port: terminal.port,
        baud_rate: terminal.baud_rate,
      };

      // Конвертация в тиыны (×100)
      const amountTiyn = Math.round(amountTenge * 100);
      const result = await sendPurchase(config, amountTiyn);

      return { success: true, data: result };
    } catch (error) {
      log.error('Failed to process terminal payment:', error);
      return { success: false, error: 'Ошибка оплаты через терминал' };
    }
  });

  // Отмена транзакции
  registerRpc('terminals:cancel', async (_event, companyId: string, terminalId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const terminal = db.prepare(`SELECT * FROM pos_terminals WHERE id = ? AND company_id = ?`).get(terminalId, companyId) as any;
      if (!terminal) return { success: false };

      const config: TerminalConfig = {
        id: terminal.id,
        bank_name: terminal.bank_name,
        model: terminal.model,
        connection_type: terminal.connection_type,
        address: terminal.address,
        port: terminal.port,
        baud_rate: terminal.baud_rate,
      };

      const cancelled = await cancelTransaction(config);
      return { success: cancelled };
    } catch (error) {
      return { success: false };
    }
  });
}
