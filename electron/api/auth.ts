import { registerRpc } from '../services/rpc';
import { ipcMain } from 'electron'
import { mainWindow } from '../main';
import { db } from '../database'
import bcrypt from 'bcryptjs'
import log from 'electron-log'
import { v4 as uuidv4 } from 'uuid'

function generateRecoveryKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Без O, 0, I, 1 для исключения путаницы
  let key = 'EK-';
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (i < 2) key += '-';
  }
  return key;
}

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

  // Проверить, прошла ли первоначальная настройка
  registerRpc('auth:check-setup', async () => {
    try {
      if (!db) throw new Error('Database not initialized');
      const company = db.prepare('SELECT is_setup_complete FROM companies LIMIT 1').get() as any;
      return { success: true, data: { isSetupComplete: company?.is_setup_complete === 1 } };
    } catch (error) {
      log.error('Failed to check setup:', error);
      return { success: true, data: { isSetupComplete: true } }; // fallback: не блокировать
    }
  });

  // Завершить первоначальную настройку (регистрация админа)
  registerRpc('auth:complete-setup', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const { companyName, adminName, password } = data;

      if (!companyName || !adminName || !password) {
        return { success: false, error: 'Заполните все поля' };
      }
      if (password.length < 6) {
        return { success: false, error: 'Пароль должен содержать минимум 6 символов' };
      }

      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(password, salt);

      const transaction = db.transaction(() => {
        // Обновляем название компании и ставим флаг настройки (берём первую попавшуюся компанию в MVP)
        const company = db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: string };
        if (company) {
          db.prepare('UPDATE companies SET name = ?, is_setup_complete = 1 WHERE id = ?').run(companyName, company.id);
        } else {
          // Если компании нет (хотя она создается при сиде), создаем новую
          const newId = uuidv4();
          db.prepare('INSERT INTO companies (id, name, is_setup_complete) VALUES (?, ?, 1)').run(newId, companyName);
        }

        // Обновляем имя и пароль админа
        db.prepare("UPDATE users SET full_name = ?, password_hash = ? WHERE role = 'admin'").run(adminName, hash);

        // Генерируем ключ восстановления
        const recoveryKey = generateRecoveryKey();
        const recoveryKeyHash = bcrypt.hashSync(recoveryKey, salt);

        // Сохраняем хеш ключа в компанию (берём ту же первую компанию)
        db.prepare('UPDATE companies SET recovery_key_hash = ? WHERE id = ?').run(recoveryKeyHash, company?.id || db.prepare('SELECT id FROM companies LIMIT 1').get().id);

        return recoveryKey;
      });

      const recoveryKey = transaction();

      log.info('Initial setup completed successfully');
      return { success: true, data: { recoveryKey } };
    } catch (error) {
      log.error('Failed to complete setup:', error);
      return { success: false, error: 'Ошибка сохранения настроек' };
    }
  });

  // Проверка ключа восстановления
  registerRpc('auth:verify-recovery-key', async (_event, key: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const company = db.prepare('SELECT recovery_key_hash FROM companies LIMIT 1').get() as any;

      if (!company || !company.recovery_key_hash) {
        return { success: false, error: 'Ключ восстановления не настроен' };
      }

      const isValid = bcrypt.compareSync(key.toUpperCase(), company.recovery_key_hash);
      return { success: isValid };
    } catch (error) {
      log.error('Failed to verify recovery key:', error);
      return { success: false, error: 'Ошибка проверки ключа' };
    }
  });

  // Сброс пароля админа через ключ восстановления
  registerRpc('auth:reset-admin-password', async (_event, key: string, newPassword: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      if (newPassword.length < 6) {
        return { success: false, error: 'Пароль слишком короткий' };
      }

      const company = db.prepare('SELECT recovery_key_hash FROM companies LIMIT 1').get() as any;
      if (!company || !company.recovery_key_hash) {
        return { success: false, error: 'Ключ восстановления не настроен' };
      }

      const isValid = bcrypt.compareSync(key.toUpperCase(), company.recovery_key_hash);
      if (!isValid) {
        return { success: false, error: 'Неверный ключ восстановления' };
      }

      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(newPassword, salt);

      db.prepare("UPDATE users SET password_hash = ? WHERE role = 'admin'").run(hash);

      log.info('Admin password reset successful via recovery key');
      return { success: true };
    } catch (error) {
      log.error('Failed to reset admin password:', error);
      return { success: false, error: 'Ошибка сброса пароля' };
    }
  });
}
