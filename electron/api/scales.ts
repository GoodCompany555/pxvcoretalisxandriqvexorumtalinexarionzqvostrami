import { registerRpc } from '../services/rpc';
import { mainWindow } from '../main';
import { db } from '../database';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';
import {
  testScales,
  startWeightStream,
  diagnoseScales,
  getScaleConnected,
  ScaleConfig
} from '../services/scales';

let activeStream: { stop: () => void } | null = null;
let currentWeight = 0;
let currentStable = false;

export function setupScalesHandlers() {

  // ─── Получить настройки весов ─────────────────────────────────────────
  registerRpc('scales:get-settings', async (_event, companyId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const settings = db.prepare(`SELECT * FROM scale_settings WHERE company_id = ?`).get(companyId);
      return { success: true, data: settings || null };
    } catch (error) {
      log.error('Failed to get scale settings:', error);
      return { success: false, error: 'Ошибка загрузки настроек весов' };
    }
  });

  // ─── Сохранить настройки весов ────────────────────────────────────────
  registerRpc('scales:save-settings', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const existing = db.prepare(`SELECT id FROM scale_settings WHERE company_id = ?`).get(data.companyId) as any;

      if (existing) {
        db.prepare(`
          UPDATE scale_settings 
          SET com_port = ?, baud_rate = ?, protocol = ?, is_active = ?,
              connection_type = ?, lan_ip = ?, lan_port = ?
          WHERE company_id = ?
        `).run(
          data.comPort,
          data.baudRate || 9600,
          data.protocol || 'cas',
          data.isActive ? 1 : 0,
          data.connectionType || 'com',
          data.lanIp || '192.168.1.100',
          data.lanPort || 4196,
          data.companyId
        );
      } else {
        db.prepare(`
          INSERT INTO scale_settings 
            (id, company_id, com_port, baud_rate, protocol, is_active, connection_type, lan_ip, lan_port)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          uuidv4(),
          data.companyId,
          data.comPort,
          data.baudRate || 9600,
          data.protocol || 'cas',
          data.isActive ? 1 : 0,
          data.connectionType || 'com',
          data.lanIp || '192.168.1.100',
          data.lanPort || 4196
        );
      }

      return { success: true };
    } catch (error) {
      log.error('Failed to save scale settings:', error);
      return { success: false, error: 'Ошибка сохранения настроек весов' };
    }
  });

  // ─── Тест подключения ─────────────────────────────────────────────────
  registerRpc('scales:test', async (_event, companyId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const settings = db.prepare(`SELECT * FROM scale_settings WHERE company_id = ?`).get(companyId) as any;
      if (!settings) return { success: false, error: 'Весы не настроены' };

      const config: ScaleConfig = {
        connection_type: settings.connection_type || 'com',
        com_port: settings.com_port,
        baud_rate: settings.baud_rate,
        protocol: settings.protocol || 'cas',
        lan_ip: settings.lan_ip || '192.168.1.100',
        lan_port: settings.lan_port || 4196,
      };

      const ok = await testScales(config);
      return { success: true, data: { connected: ok } };
    } catch (error) {
      log.error('Failed to test scales:', error);
      return { success: false, error: 'Ошибка тестирования весов' };
    }
  });

  // ─── Диагностика — возвращает сырые данные 10 сек ───────────────────
  registerRpc('scales:diagnose', async (_event, companyId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const settings = db.prepare(`SELECT * FROM scale_settings WHERE company_id = ?`).get(companyId) as any;
      if (!settings) return { success: false, error: 'Весы не настроены' };

      const config: ScaleConfig = {
        connection_type: settings.connection_type || 'com',
        com_port: settings.com_port,
        baud_rate: settings.baud_rate,
        protocol: settings.protocol || 'cas',
        lan_ip: settings.lan_ip || '192.168.1.100',
        lan_port: settings.lan_port || 4196,
      };

      const lines = await diagnoseScales(config);
      return { success: true, data: { lines } };
    } catch (error: any) {
      log.error('Failed to diagnose scales:', error);
      return { success: false, error: error.message || 'Ошибка диагностики' };
    }
  });

  // ─── Получить текущий статус весов ───────────────────────────────────
  registerRpc('scales:get-status', async (_event, _companyId: string) => {
    return {
      success: true,
      data: {
        connected: getScaleConnected(),
        weight: currentWeight,
        stable: currentStable,
      }
    };
  });

  // ─── Начать стриминг веса ─────────────────────────────────────────────
  registerRpc('scales:start-stream', async (event, companyId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const settings = db.prepare(`SELECT * FROM scale_settings WHERE company_id = ?`).get(companyId) as any;
      if (!settings || !settings.is_active) return { success: false, error: 'Весы не настроены или отключены' };

      // Остановить предыдущий стрим
      if (activeStream) {
        activeStream.stop();
        activeStream = null;
      }

      const config: ScaleConfig = {
        connection_type: settings.connection_type || 'com',
        com_port: settings.com_port,
        baud_rate: settings.baud_rate,
        protocol: settings.protocol || 'cas',
        lan_ip: settings.lan_ip || '192.168.1.100',
        lan_port: settings.lan_port || 4196,
      };

      activeStream = startWeightStream(
        config,
        (reading) => {
          currentWeight = reading.weight;
          currentStable = reading.stable;
          try {
            event.sender.send('scales:weight-update', reading);
          } catch { /* window closed */ }
        },
        (connected) => {
          try {
            event.sender.send('scales:status-update', { connected });
          } catch { /* window closed */ }
        }
      );

      return { success: true };
    } catch (error) {
      log.error('Failed to start weight stream:', error);
      return { success: false, error: 'Ошибка запуска весов' };
    }
  });

  // ─── Остановить стриминг ──────────────────────────────────────────────
  registerRpc('scales:stop-stream', async () => {
    if (activeStream) {
      activeStream.stop();
      activeStream = null;
    }
    currentWeight = 0;
    currentStable = false;
    return { success: true };
  });
}
