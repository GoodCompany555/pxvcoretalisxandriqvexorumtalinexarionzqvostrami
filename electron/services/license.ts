import { machineId } from 'node-machine-id';
import https from 'https';
import log from 'electron-log';
import { db } from '../database';

// Ссылка на Google Apps Script пользователя
const LICENSE_API_URL = 'https://script.google.com/macros/s/AKfycbzGOHZpPeFvorBuQ_Q8j4auOGlkf3KNSvTbYUn_JsUTWriYa9kgq2BhRVxoFKlxzgK3/exec';

// 24 часа кэш лицензии в оффлайне
const OFFLINE_CACHE_DURATION = 24 * 60 * 60 * 1000;

/**
 * Выполнить GET запрос с автоматическим следованием редиректам (до 5).
 * Google Apps Script ВСЕГДА отвечает 302 редиректом, axios в production Electron
 * иногда не следует за ними (из-за asar/net interceptors).
 * Поэтому используем нативный https модуль Node.js.
 */
function httpsGetJson(url: string, maxRedirects = 5): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Таймаут запроса (15с)')), 15000);

    const doRequest = (reqUrl: string, redirectsLeft: number) => {
      log.info(`[License] GET ${reqUrl}`);

      https.get(reqUrl, (res) => {
        // Следуем за редиректами (302, 301, 307, 308)
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) {
            clearTimeout(timeout);
            return reject(new Error('Слишком много редиректов'));
          }
          log.info(`[License] Redirect ${res.statusCode} -> ${res.headers.location}`);
          return doRequest(res.headers.location, redirectsLeft - 1);
        }

        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          clearTimeout(timeout);
          log.info(`[License] Response status: ${res.statusCode}, body: ${body.substring(0, 500)}`);
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error(`Невалидный JSON ответ: ${body.substring(0, 200)}`));
          }
        });
      }).on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    };

    doRequest(url, maxRedirects);
  });
}

export class LicenseService {

  // Получить уникальный Hardware ID компьютера
  static async getHWID(): Promise<string> {
    try {
      const id = await machineId();
      log.info(`[License] HWID: ${id}`);
      return id;
    } catch (e) {
      log.error('[License] Failed to get HWID:', e);
      return 'UNKNOWN_HWID';
    }
  }

  // Активация ключа / Проверка
  static async activateLicense(key: string): Promise<{ success: boolean; message?: string }> {
    try {
      const hwid = await this.getHWID();
      const url = `${LICENSE_API_URL}?key=${encodeURIComponent(key)}&hwid=${encodeURIComponent(hwid)}`;

      log.info(`[License] Активация ключа: ${key}, HWID: ${hwid}`);

      const data = await httpsGetJson(url);

      log.info(`[License] Ответ сервера:`, JSON.stringify(data));

      // В Google Apps Script если ключ найден и привязан
      if (data && (data.success === true || data.status === 'success' || data.status === 'active')) {
        log.info('[License] Ключ успешно активирован:', key);
        this.saveOfflineCache(key);
        return { success: true };
      }

      return { success: false, message: data?.message || 'Ключ не найден или недействителен' };
    } catch (error: any) {
      log.error('[License] Ошибка активации:', error.message);
      return { success: false, message: `Ошибка сети: ${error.message}. Проверьте интернет.` };
    }
  }

  // Ежедневная проверка лицензии при старте
  static async verifyLicense(): Promise<{ valid: boolean; reason?: string }> {
    try {
      if (!db) return { valid: false, reason: 'Ожидание БД' };

      const settings = db.prepare(`SELECT license_key, last_license_check FROM companies LIMIT 1`).get() as any;

      if (!settings || !settings.license_key) {
        return { valid: false, reason: 'not_activated' };
      }

      const key = settings.license_key;
      const lastCheck = settings.last_license_check ? new Date(settings.last_license_check).getTime() : 0;
      const hwid = await this.getHWID();

      try {
        const url = `${LICENSE_API_URL}?key=${encodeURIComponent(key)}&hwid=${encodeURIComponent(hwid)}`;
        const data = await httpsGetJson(url);

        log.info('[License] Проверка ответ:', JSON.stringify(data));

        const statusStr = String(data?.status || data?.state || '').toLowerCase();

        // Явно проверяем блокировку
        if (statusStr === 'blocked' || statusStr === 'expired' || statusStr === 'revoked') {
          this.clearOfflineCache();
          return { valid: false, reason: data.message || `Лицензия: ${statusStr}` };
        }

        if (data && (data.success === true || statusStr === 'success' || statusStr === 'active')) {
          this.saveOfflineCache(key);
          return { valid: true };
        } else {
          this.clearOfflineCache();
          return { valid: false, reason: data?.message || 'Лицензия недействительна' };
        }
      } catch (networkError: any) {
        log.warn('[License] Сервер недоступен:', networkError.message);

        // Офлайн режим: проверка кэша
        const now = Date.now();
        if (now - lastCheck < OFFLINE_CACHE_DURATION) {
          log.info('[License] Используем кэш (24ч)');
          return { valid: true };
        } else {
          return { valid: false, reason: 'offline_expired' };
        }
      }

    } catch (e) {
      log.error('[License] Критическая ошибка:', e);
      return { valid: false, reason: 'system_error' };
    }
  }

  // Обновляем время последней успешной проверки
  private static saveOfflineCache(key: string) {
    if (!db) return;
    try {
      const companyCount = db.prepare(`SELECT count(*) as count FROM companies`).get() as { count: number };
      if (companyCount.count === 0) {
        db.prepare(`
          INSERT INTO companies (id, name, license_key, last_license_check) 
          VALUES ('local-client', 'EasyKassa Client', ?, CURRENT_TIMESTAMP)
        `).run(key);
      } else {
        db.prepare(`
          UPDATE companies 
          SET license_key = ?, last_license_check = CURRENT_TIMESTAMP
        `).run(key);
      }
    } catch (e) {
      log.error('[License] Ошибка сохранения кэша:', e);
    }
  }

  // Очищаем кэш если лицензия заблокирована
  private static clearOfflineCache() {
    if (!db) return;
    try {
      db.prepare(`
        UPDATE companies 
        SET last_license_check = NULL
      `).run();
    } catch (e) {
      log.error('[License] Ошибка очистки кэша:', e);
    }
  }
}
