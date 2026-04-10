import { ipcMain } from 'electron'
import { mainWindow } from '../main';
import { db } from '../database'
import log from 'electron-log'

export function setupSettingsHandlers() {
  // Получить настройки (компания + ОФД)
  ipcMain.handle('settings:get', async (_, companyId: string) => {
    try {
      if (!db) throw new Error('Database not initialized')

      // Получаем реквизиты компании
      const company = db.prepare(`
        SELECT name as companyName, bin, address
        FROM companies
        WHERE id = ?
      `).get(companyId) as any;

      if (!company) {
        throw new Error('Компаний не найдена');
      }

      // Получаем настройки ОФД (терминалы в будущем)
      let settings = db.prepare(`
        SELECT 
          ofd_provider as ofdProvider,
          ofd_token as ofdApiKey,
          ofd_login as ofdLogin,
          ofd_password as ofdPassword,
          ofd_cashbox_id as ofdCashboxId
        FROM settings
        WHERE company_id = ?
      `).get(companyId) as any;

      // Возвращаем комбинированный объект
      return {
        success: true,
        data: {
          ...company,
          ...(settings || {
            ofdProvider: 'none',
            ofdApiKey: '',
            ofdLogin: '',
            ofdPassword: '',
            ofdCashboxId: ''
          })
        }
      }
    } catch (error) {
      log.error('Failed to get settings:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Сохранить настройки
  ipcMain.handle('settings:save', async (_, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized')

      log.info('Saving settings for company:', data.companyId);

      const updateTx = db.transaction(() => {
        // Обновляем реквизиты компании
        db.prepare(`
          UPDATE companies 
          SET name = ?, bin = ?, address = ?
          WHERE id = ?
        `).run(data.companyName, data.bin, data.address, data.companyId);

        // Обновляем настройки
        // Если настроек еще нет, они должны были создаться при миграции V1 (seed), 
        // но на всякий случай используем INSERT OR REPLACE
        db.prepare(`
          INSERT OR REPLACE INTO settings (
            company_id, 
            ofd_provider, 
            ofd_token, 
            ofd_login, 
            ofd_password, 
            ofd_cashbox_id
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          data.companyId,
          data.ofdProvider,
          data.ofdApiKey,
          data.ofdLogin,
          data.ofdPassword,
          data.ofdCashboxId
        );
      });

      updateTx();

      return { success: true }
    } catch (error) {
      log.error('Failed to save settings:', error)
      return { success: false, error: (error as Error).message }
    }
  })
}
