import { registerRpc } from '../services/rpc';
import { ipcMain } from 'electron';
import { mainWindow } from '../main';
import { db } from '../database';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';

export function setupClientsHandlers() {
  registerRpc('clients:get-all', async (_event, companyId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const clients = db.prepare(`
        SELECT * FROM clients 
        WHERE company_id = ? 
        ORDER BY name ASC
      `).all(companyId);
      return { success: true, data: clients };
    } catch (error) {
      log.error('Failed to get clients:', error);
      return { success: false, error: 'Ошибка загрузки контрагентов' };
    }
  });

  registerRpc('clients:create', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const id = uuidv4();
      db.prepare(`
        INSERT INTO clients (id, company_id, name, bin, address, phone, email)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, data.companyId, data.name, data.bin || null,
        data.address || null, data.phone || null, data.email || null
      );
      return { success: true, data: { id } };
    } catch (error) {
      log.error('Failed to create client:', error);
      return { success: false, error: 'Ошибка добавления клиента' };
    }
  });

  registerRpc('clients:update', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');
      db.prepare(`
        UPDATE clients 
        SET name = ?, bin = ?, address = ?, phone = ?, email = ?
        WHERE id = ? AND company_id = ?
      `).run(
        data.name, data.bin || null, data.address || null,
        data.phone || null, data.email || null, data.id, data.companyId
      );
      return { success: true };
    } catch (error) {
      log.error('Failed to update client:', error);
      return { success: false, error: 'Ошибка обновления клиента' };
    }
  });

  registerRpc('clients:delete', async (_event, companyId: string, id: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      // В идеале: проверка, не привязан ли клиент к существующим документам или чекам
      db.prepare(`DELETE FROM clients WHERE id = ? AND company_id = ?`).run(id, companyId);
      return { success: true };
    } catch (error) {
      log.error('Failed to delete client:', error);
      return { success: false, error: 'Ошибка удаления клиента' };
    }
  });
}
