import { registerRpc } from '../services/rpc';
import { db } from '../database';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';

export function setupWarehousesHandlers() {
  // Получить все склады
  registerRpc('warehouses:get-all', async (_event, companyId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const warehouses = db.prepare('SELECT * FROM warehouses WHERE company_id = ? ORDER BY is_main DESC, name ASC').all(companyId);
      return { success: true, data: warehouses };
    } catch (error: any) {
      log.error('Failed to get warehouses:', error);
      return { success: false, error: 'Ошибка загрузки складов' };
    }
  });

  // Создать склад
  registerRpc('warehouses:create', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const { companyId, name, address } = data;
      const id = uuidv4();

      db.prepare(`
        INSERT INTO warehouses (id, company_id, name, is_main, address)
        VALUES (?, ?, ?, 0, ?)
      `).run(id, companyId, name, address || null);

      return { success: true, data: { id } };
    } catch (error: any) {
      log.error('Failed to create warehouse:', error);
      return { success: false, error: 'Ошибка создания склада' };
    }
  });
}
