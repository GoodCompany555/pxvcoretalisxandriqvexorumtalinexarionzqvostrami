import * as http from 'http';
import * as os from 'os';
import log from 'electron-log';
import { getHandler } from './rpc';

const PORT = 8765;
let server: http.Server | null = null;

// Виртуальные адаптеры которые нужно пропускать
const VIRTUAL_ADAPTERS = ['vEthernet', 'WSL', 'Docker', 'VirtualBox', 'VMware', 'Hyper-V', 'vboxnet', 'br-', 'virbr'];

// Получить основной IP адрес в локальной сети
export function getLocalIP(): string {
  const allIPs = getAllLocalIPs();
  // Приоритет: 192.168.x.x > 10.x.x.x > остальные
  const preferred = allIPs.find(ip => ip.startsWith('192.168.'))
    || allIPs.find(ip => ip.startsWith('10.'))
    || allIPs[0];
  return preferred || '127.0.0.1';
}

// Получить все IP адреса (для отображения пользователю)
export function getAllLocalIPs(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];

  for (const name of Object.keys(interfaces)) {
    // Пропускаем виртуальные адаптеры
    if (VIRTUAL_ADAPTERS.some(v => name.toLowerCase().includes(v.toLowerCase()))) continue;

    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }

  return ips;
}

export function startNetworkServer(): Promise<{ success: boolean; ip?: string; port?: number; error?: string }> {
  return new Promise((resolve) => {
    if (server) {
      resolve({ success: true, ip: getLocalIP(), port: PORT });
      return;
    }

    server = http.createServer(async (req, res) => {
      // CORS для безопасности в локалке
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Health check — для кнопки "Проверить соединение"
      if (req.method === 'GET' && req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', app: 'EasyKassa', version: '1.0.0' }));
        return;
      }

      // Основной RPC маршрут
      if (req.method === 'POST' && req.url === '/api/rpc') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
          try {
            const { channel, args } = JSON.parse(body);

            if (!channel) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Missing channel' }));
              return;
            }

            const handler = getHandler(channel);
            if (!handler) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: `Unknown channel: ${channel}` }));
              return;
            }

            // Вызываем обработчик (event = null, т.к. запрос по сети)
            const result = await handler(null as any, ...(args || []));

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (error: any) {
            log.error('Network RPC handler error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: error.message }));
          }
        });
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.on('error', (err: any) => {
      log.error('Network server error:', err);
      server = null;
      resolve({ success: false, error: `Ошибка запуска сервера: ${err.message}` });
    });

    server.listen(PORT, '0.0.0.0', () => {
      const ip = getLocalIP();
      log.info(`Network server started on ${ip}:${PORT}`);
      resolve({ success: true, ip, port: PORT });
    });
  });
}

export function stopNetworkServer(): void {
  if (server) {
    server.close();
    server = null;
    log.info('Network server stopped');
  }
}

export function isServerRunning(): boolean {
  return server !== null;
}
