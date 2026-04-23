import { registerRpc } from '../services/rpc';
import { setNetworkMode, getNetworkMode } from '../services/rpc';
import { startNetworkServer, stopNetworkServer, getLocalIP, getAllLocalIPs, isServerRunning } from '../services/networkServer';
import axios from 'axios';
import log from 'electron-log';
import Store from 'electron-store';

const store = new Store();
const PORT = 8765;

export function setupNetworkHandlers() {
  // Получить текущий статус сети
  registerRpc('network:status', async () => {
    const { mode, serverUrl } = getNetworkMode();
    return {
      success: true,
      data: {
        mode,
        serverUrl,
        localIP: getLocalIP(),
        allIPs: getAllLocalIPs(),
        isServerRunning: isServerRunning(),
        port: PORT,
      }
    };
  });

  // Включить режим сервера
  registerRpc('network:start-server', async () => {
    try {
      const result = await startNetworkServer();
      if (result.success) {
        setNetworkMode('server');
        store.set('networkMode', 'server');
      }
      return result;
    } catch (error: any) {
      log.error('Failed to start server:', error);
      return { success: false, error: error.message };
    }
  });

  // Выключить режим сервера
  registerRpc('network:stop-server', async () => {
    try {
      stopNetworkServer();
      setNetworkMode('standalone');
      store.set('networkMode', 'standalone');
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Подключиться к серверу (режим клиента)
  registerRpc('network:connect', async (_event, serverIP: string) => {
    try {
      const url = `${serverIP}:${PORT}`;

      // Проверяем доступность сервера
      const response = await axios.get(`http://${url}/api/health`, { timeout: 5000 });
      if (response.data?.status !== 'ok' || response.data?.app !== 'EasyKassa') {
        return { success: false, error: 'Это не сервер EasyKassa' };
      }

      setNetworkMode('client', url);
      store.set('networkMode', 'client');
      store.set('serverIP', serverIP);
      log.info(`Connected to server: ${url}`);

      return { success: true, data: { serverUrl: url } };
    } catch (error: any) {
      log.error('Failed to connect:', error.message);
      return { success: false, error: 'Не удалось подключиться. Проверьте IP адрес и убедитесь что сервер включён.' };
    }
  });

  // Отключиться от сервера
  registerRpc('network:disconnect', async () => {
    setNetworkMode('standalone');
    store.set('networkMode', 'standalone');
    store.delete('serverIP' as any);
    return { success: true };
  });

  // Проверить соединение с сервером
  registerRpc('network:test', async (_event, serverIP?: string) => {
    try {
      const { mode, serverUrl } = getNetworkMode();
      const ip = serverIP || serverUrl;
      if (!ip) return { success: false, error: 'IP адрес не указан' };

      const url = ip.includes(':') ? ip : `${ip}:${PORT}`;
      const response = await axios.get(`http://${url}/api/health`, { timeout: 5000 });

      if (response.data?.status === 'ok' && response.data?.app === 'EasyKassa') {
        return { success: true, data: { connected: true } };
      }
      return { success: false, error: 'Сервер не отвечает корректно' };
    } catch (error: any) {
      return { success: false, error: 'Нет связи с сервером' };
    }
  });
}

// Автовосстановление режима при запуске
export function restoreNetworkMode() {
  const savedMode = store.get('networkMode') as string;
  const savedIP = store.get('serverIP') as string;

  if (savedMode === 'server') {
    startNetworkServer().then((res) => {
      if (res.success) {
        setNetworkMode('server');
        log.info('Auto-restored server mode');
      }
    });
  } else if (savedMode === 'client' && savedIP) {
    setNetworkMode('client', `${savedIP}:${PORT}`);
    log.info(`Auto-restored client mode: ${savedIP}:${PORT}`);
  }
}
