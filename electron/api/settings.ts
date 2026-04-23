import { ipcMain } from 'electron'
import { mainWindow, encryptData, decryptData } from '../main';
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
          ofd_login as ofdLogin,
          ofd_password as ofdPassword,
          ofd_cashbox_id as ofdCashboxId,
          is_vat_payer as isVatPayer,
          vat_certificate_series as vatCertificateSeries,
          vat_certificate_number as vatCertificateNumber,
          vat_registered_at as vatRegisteredAt,
          vat_certificate_issued_at as vatCertificateIssuedAt,
          tax_regime as taxRegime,
          is_kpn_payer as isKpnPayer,
          is_excise_payer as isExcisePayer,
          accounting_policy_start_date as accountingPolicyStartDate
        FROM settings
        WHERE company_id = ?
      `).get(companyId) as any;

      // Дешифруем пароль ОФД перед отправкой на клиент
      if (settings && settings.ofdPassword) {
        settings.ofdPassword = decryptData(settings.ofdPassword);
      }

      // Возвращаем комбинированный объект
      return {
        success: true,
        data: {
          ...company,
          ...(settings || {
            ofdProvider: 'none',
            ofdLogin: '',
            ofdPassword: '',
            ofdCashboxId: '',
            isVatPayer: false,
            vatCertificateSeries: '',
            vatCertificateNumber: '',
            vatRegisteredAt: null,
            vatCertificateIssuedAt: null,
            taxRegime: 'СНР',
            isKpnPayer: false,
            isExcisePayer: false,
            accountingPolicyStartDate: null
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
        // Шифруем пароль перед сохранением в БД
        const safePassword = data.ofdPassword ? encryptData(data.ofdPassword) : '';

        db.prepare(`
          INSERT OR REPLACE INTO settings (
            company_id, 
            ofd_provider, 
            ofd_login, 
            ofd_password, 
            ofd_cashbox_id,
            is_vat_payer,
            vat_certificate_series,
            vat_certificate_number,
            vat_registered_at,
            vat_certificate_issued_at,
            tax_regime,
            is_kpn_payer,
            is_excise_payer,
            accounting_policy_start_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          data.companyId,
          data.ofdProvider,
          data.ofdLogin,
          safePassword,
          data.ofdCashboxId,
          data.isVatPayer ? 1 : 0,
          data.vatCertificateSeries,
          data.vatCertificateNumber,
          data.vatRegisteredAt,
          data.vatCertificateIssuedAt,
          data.taxRegime,
          data.isKpnPayer ? 1 : 0,
          data.isExcisePayer ? 1 : 0,
          data.accountingPolicyStartDate
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
