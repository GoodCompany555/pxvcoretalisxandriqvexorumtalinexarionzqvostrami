import { registerRpc } from '../services/rpc';
import { ipcMain } from 'electron';
import { mainWindow } from '../main';
import { LicenseService } from '../services/license';
import log from 'electron-log';

export function setupLicenseHandlers() {

  registerRpc('license:get-hwid', async () => {
    try {
      return await LicenseService.getHWID();
    } catch (e) {
      log.error('Failed to get HWID via IPC', e);
      return 'UNKNOWN';
    }
  });

  registerRpc('license:check', async () => {
    try {
      return await LicenseService.verifyLicense();
    } catch (error) {
      log.error('Failed to verify license:', error);
      return { valid: false, reason: 'api_error' };
    }
  });

  registerRpc('license:activate', async (_event, key: string) => {
    try {
      return await LicenseService.activateLicense(key);
    } catch (error) {
      log.error('Failed to activate license:', error);
      return { success: false, message: 'Внутренняя ошибка активации' };
    }
  });

}
