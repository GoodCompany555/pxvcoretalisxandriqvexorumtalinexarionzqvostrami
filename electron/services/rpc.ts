import { ipcMain } from 'electron';
import log from 'electron-log';
import axios from 'axios';

// Хранилище обработчиков для серверного режима
const handlers = new Map<string, (event: any, ...args: any[]) => Promise<any>>();

// Режим работы: standalone (по умолчанию), server, client
let networkMode: 'standalone' | 'server' | 'client' = 'standalone';
let serverUrl = '';

export function setNetworkMode(mode: 'standalone' | 'server' | 'client', url?: string) {
  networkMode = mode;
  serverUrl = url || '';
  log.info(`Network mode set to: ${mode}${url ? ` (${url})` : ''}`);
}

export function getNetworkMode() {
  return { mode: networkMode, serverUrl };
}

export function getHandler(channel: string) {
  return handlers.get(channel);
}

export function getAllChannels(): string[] {
  return Array.from(handlers.keys());
}

import { app } from 'electron';

export function registerRpc(channel: string, listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any) {
  // Сохраняем обработчик для серверного режима
  handlers.set(channel, listener);

  ipcMain.handle(channel, async (event, ...args) => {
    // Безопасность: блокируем левые вызовы (RCE protection)
    if (app.isPackaged) {
      const url = event.senderFrame?.url || '';
      if (!url.startsWith('file://')) {
        log.warn(`[SECURITY] Blocked IPC call to ${channel} from unauthorized URL: ${url}`);
        return { success: false, error: 'Unauthorized IPC origin' };
      }
    }

    try {
      // Если мы клиент — перенаправляем запрос на сервер
      if (networkMode === 'client' && !channel.startsWith('network:') && !channel.startsWith('backup:') && channel !== 'app-version' && channel !== 'reset-printer') {
        try {
          const response = await axios.post(`http://${serverUrl}/api/rpc`, {
            channel,
            args
          }, { timeout: 15000 });
          return response.data;
        } catch (netError: any) {
          log.error(`Network RPC error (${channel}):`, netError.message);
          return { success: false, error: 'Нет связи с сервером. Проверьте подключение.' };
        }
      }

      // Иначе — выполняем локально
      return await listener(event, ...args);
    } catch (error: any) {
      log.error(`Error in RPC ${channel}:`, error);
      return { success: false, error: error.message || 'Internal Server Error' };
    }
  });
}
