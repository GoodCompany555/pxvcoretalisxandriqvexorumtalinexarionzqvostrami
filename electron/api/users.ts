import { registerRpc } from '../services/rpc';
import { ipcMain } from 'electron';
import { mainWindow } from '../main';
import { db } from '../database';
import log from 'electron-log';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export function setupUsersHandlers() {
  // Получить всех пользователей компании (кроме скрытых/системных, если нужно)
  registerRpc('users:get-all', async (_event, companyId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      // Исключаем хэш пароля из выдачи
      const users = db.prepare(`
        SELECT id, username, full_name, role, iin, pin_code, is_active, created_at, permissions
        FROM users 
        WHERE company_id = ?
        ORDER BY created_at DESC
      `).all(companyId);

      // Парсим permissions из JSON
      const formattedUsers = users.map((u: any) => ({
        ...u,
        permissions: u.permissions ? JSON.parse(u.permissions) : {}
      }));

      return { success: true, data: formattedUsers };
    } catch (error) {
      log.error('Failed to get users:', error);
      return { success: false, error: 'Ошибка получения списка сотрудников' };
    }
  });

  // Создать пользователя
  registerRpc('users:create', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');

      // Проверка на уникальность username в рамках всех компаний или одной
      const existing = db.prepare(`SELECT id FROM users WHERE username = ?`).get(data.username);
      if (existing) {
        return { success: false, error: 'Пользователь с таким логином уже существует' };
      }

      const id = uuidv4();
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(data.password, salt);

      db.prepare(`
        INSERT INTO users (id, company_id, username, password_hash, full_name, role, iin, pin_code, is_active, permissions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, data.companyId, data.username, hash, data.fullName,
        data.role, data.iin || null, data.pinCode || null, 1,
        JSON.stringify(data.permissions || {})
      );

      return { success: true, data: { id } };
    } catch (error) {
      log.error('Failed to create user:', error);
      return { success: false, error: 'Ошибка создания сотрудника' };
    }
  });

  // Обновить пользователя
  registerRpc('users:update', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');

      if (data.password) {
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(data.password, salt);

        db.prepare(`
          UPDATE users 
          SET username = ?, password_hash = ?, full_name = ?, role = ?, iin = ?, pin_code = ?, is_active = ?, permissions = ?
          WHERE id = ? AND company_id = ?
        `).run(
          data.username, hash, data.fullName, data.role,
          data.iin || null, data.pinCode || null, data.isActive ? 1 : 0,
          JSON.stringify(data.permissions || {}),
          data.id, data.companyId
        );
      } else {
        // Обновление без изменения пароля
        db.prepare(`
          UPDATE users 
          SET username = ?, full_name = ?, role = ?, iin = ?, pin_code = ?, is_active = ?, permissions = ?
          WHERE id = ? AND company_id = ?
        `).run(
          data.username, data.fullName, data.role,
          data.iin || null, data.pinCode || null, data.isActive ? 1 : 0,
          JSON.stringify(data.permissions || {}),
          data.id, data.companyId
        );
      }

      return { success: true };
    } catch (error) {
      log.error('Failed to update user:', error);
      return { success: false, error: 'Ошибка обновления сотрудника' };
    }
  });

  // Деактивация пользователя (мягкое удаление)
  registerRpc('users:toggle-status', async (_event, companyId: string, id: string, isActive: boolean) => {
    try {
      if (!db) throw new Error('Database not initialized');
      db.prepare(`UPDATE users SET is_active = ? WHERE id = ? AND company_id = ?`).run(isActive ? 1 : 0, id, companyId);
      return { success: true };
    } catch (error) {
      log.error('Failed to toggle user status:', error);
      return { success: false, error: 'Ошибка изменения статуса' };
    }
  });
}
