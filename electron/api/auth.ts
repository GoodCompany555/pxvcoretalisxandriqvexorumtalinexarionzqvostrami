import { registerRpc } from '../services/rpc';
import { ipcMain } from 'electron'
import { mainWindow } from '../main';
import { db } from '../database'
import bcrypt from 'bcryptjs'
import log from 'electron-log'

export function setupAuthHandlers() {
  // Получить список пользователей для экрана входа
  registerRpc('auth:get-users', async (_event, companyId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      const users = db.prepare(`
        SELECT id, username, full_name, role 
        FROM users 
        WHERE company_id = ? AND is_active = 1
      `).all(companyId);

      return { success: true, data: users };
    } catch (error) {
      log.error('Failed to get users:', error);
      return { success: false, error: 'Ошибка загрузки пользователей' };
    }
  });

  // Авторизация по паролю
  registerRpc('auth:login', async (_event, userId: string, password: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      const user = db.prepare(`
        SELECT id, company_id, username, password_hash, full_name, role, permissions 
        FROM users 
        WHERE id = ? AND is_active = 1
      `).get(userId) as any;

      if (!user) {
        return { success: false, error: 'Пользователь не найден' };
      }

      const isValid = bcrypt.compareSync(password, user.password_hash);

      if (!isValid) {
        return { success: false, error: 'Неверный пароль' };
      }

      // Не возвращаем хэш пароля на клиент
      delete user.password_hash;

      // Парсим права доступа
      user.permissions = user.permissions ? JSON.parse(user.permissions) : {};

      return { success: true, data: user };
    } catch (error) {
      log.error('Login error:', error);
      return { success: false, error: 'Системная ошибка при входе' };
    }
  });

  // Получить первую компанию (для упрощения MVP, где будет одна компания по умолчанию)
  registerRpc('auth:get-default-company', async () => {
    try {
      if (!db) throw new Error('Database not initialized');
      const company = db.prepare('SELECT id, name FROM companies LIMIT 1').get();
      return { success: true, data: company };
    } catch (error) {
      log.error('Failed to get default company:', error);
      return { success: false, error: 'Ошибка загрузки компании' };
    }
  });
}
