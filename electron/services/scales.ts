import log from 'electron-log';

// ─── Типы ──────────────────────────────────────────────────────────────────

export interface ScaleConfig {
  connection_type: 'com' | 'lan';
  // COM
  com_port: string;
  baud_rate: number;
  // LAN
  lan_ip: string;
  lan_port: number;
  // Протокол
  protocol: 'cas' | 'toledo' | 'massak' | 'ocom' | 'raw' | 'auto';
}

export interface WeightReading {
  weight: number;   // вес в кг
  stable: boolean;  // стабильный ли вес
  error?: string;
}

// ─── Глобальный стрим ─────────────────────────────────────────────────────

let activeTcpSocket: any = null;
let activeSerialPort: any = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isConnected = false;
let lastLanWeight = 0;
let stableCount = 0;

export function getScaleConnected() {
  return isConnected;
}

// ─── TCP/LAN стрим ─────────────────────────────────────────────────────────

export function startWeightStreamTCP(
  config: ScaleConfig,
  onWeight: (reading: WeightReading) => void,
  onStatus?: (connected: boolean) => void
): { stop: () => void } {
  const { lan_ip, lan_port, protocol } = config;
  let stopped = false;
  let buffer = '';
  let autoProtocol: Exclude<ScaleConfig['protocol'], 'auto'> | null = protocol === 'auto' ? null : (protocol as any);
  const autoProtocols: Exclude<ScaleConfig['protocol'], 'auto'>[] = ['ocom', 'cas', 'toledo', 'massak', 'raw'];

  function setStatus(c: boolean) {
    isConnected = c;
    onStatus?.(c);
  }

  function connect() {
    if (stopped) return;

    const net = require('net');
    const socket = net.createConnection({ host: lan_ip, port: lan_port, timeout: 5000 });
    activeTcpSocket = socket;

    socket.on('connect', () => {
      log.info(`[Scales TCP] Connected to ${lan_ip}:${lan_port}`);
      setStatus(true);
      buffer = '';

      // OCOM/TM-F66: отправляем запрос веса каждые 300ms
      if (autoProtocol === 'ocom' || protocol === 'auto') {
        const pollInterval = setInterval(() => {
          if (!socket.destroyed) {
            // OCOM TM-F66 команда запроса веса (ASCII 'W\r\n' или hex 0x57 0x0D 0x0A)
            try { socket.write('W\r\n'); } catch (_) { }
          } else {
            clearInterval(pollInterval);
          }
        }, 300);
        socket.once('close', () => clearInterval(pollInterval));
      }
    });

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('binary');
      const lines = buffer.split(/[\r\n]+/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        // Автоопределение протокола
        if (protocol === 'auto' && !autoProtocol) {
          for (const p of autoProtocols) {
            const r = parseWeight(line, p);
            if (r !== null) {
              autoProtocol = p;
              log.info(`[Scales TCP] Auto-detected protocol: ${p}`);
              break;
            }
          }
        }

        const effectiveProtocol = autoProtocol || 'raw';
        const reading = parseWeight(line, effectiveProtocol);
        if (reading !== null) {
          // Стабилизация: если вес меняется менее чем на 5г — считаем стабильным
          const diff = Math.abs(reading.weight - lastLanWeight);
          if (diff < 0.005) {
            stableCount = Math.min(stableCount + 1, 5);
          } else {
            stableCount = 0;
          }
          lastLanWeight = reading.weight;
          reading.stable = reading.stable && stableCount >= 3;
          onWeight(reading);
        }
      }
    });

    socket.on('error', (err: Error) => {
      log.error('[Scales TCP] Error:', err.message);
      setStatus(false);
      onWeight({ weight: 0, stable: false, error: err.message });
    });

    socket.on('close', () => {
      log.warn('[Scales TCP] Connection closed');
      setStatus(false);
      activeTcpSocket = null;
      if (!stopped) {
        reconnectTimer = setTimeout(connect, 5000);
      }
    });

    socket.on('timeout', () => {
      log.warn('[Scales TCP] Connection timeout');
      socket.destroy();
    });
  }

  connect();

  return {
    stop: () => {
      stopped = true;
      isConnected = false;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (activeTcpSocket) { try { activeTcpSocket.destroy(); } catch (_) { } activeTcpSocket = null; }
    }
  };
}

// ─── COM/SerialPort стрим ───────────────────────────────────────────────────

export function startWeightStreamSerial(
  config: ScaleConfig,
  onWeight: (reading: WeightReading) => void,
  onStatus?: (connected: boolean) => void
): { stop: () => void } {
  try {
    const { SerialPort } = require('serialport');

    if (activeSerialPort) {
      try { activeSerialPort.close(); } catch (_) { }
      activeSerialPort = null;
    }

    const port = new SerialPort({
      path: config.com_port,
      baudRate: config.baud_rate || 9600,
      autoOpen: true,
    });

    activeSerialPort = port;
    let buffer = '';

    port.on('open', () => {
      isConnected = true;
      onStatus?.(true);
    });

    port.on('data', (data: Buffer) => {
      buffer += data.toString('ascii');
      const lines = buffer.split(/[\r\n]+/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        const reading = parseWeight(line, config.protocol);
        if (reading !== null) {
          onWeight(reading);
        }
      }
    });

    port.on('error', (err: Error) => {
      log.error('[Scales Serial] Error:', err.message);
      isConnected = false;
      onStatus?.(false);
      onWeight({ weight: 0, stable: false, error: err.message });
    });

    port.on('close', () => {
      isConnected = false;
      onStatus?.(false);
    });

    // Polling по протоколу
    let pollTimer: any = null;
    if (config.protocol === 'cas') {
      pollTimer = setInterval(() => { if (port.isOpen) port.write('W\r\n'); }, 300);
    } else if (config.protocol === 'toledo') {
      pollTimer = setInterval(() => { if (port.isOpen) port.write(Buffer.from([0x05])); }, 300);
    }

    return {
      stop: () => {
        isConnected = false;
        if (pollTimer) clearInterval(pollTimer);
        try { port.close(); } catch (_) { }
        activeSerialPort = null;
      }
    };
  } catch (e: any) {
    log.error('[Scales Serial] Failed to start:', e.message);
    onWeight({ weight: 0, stable: false, error: e.message });
    return { stop: () => { } };
  }
}

// ─── Универсальный запуск ───────────────────────────────────────────────────

export function startWeightStream(
  config: ScaleConfig,
  onWeight: (reading: WeightReading) => void,
  onStatus?: (connected: boolean) => void
): { stop: () => void } {
  lastLanWeight = 0;
  stableCount = 0;

  if (config.connection_type === 'lan') {
    return startWeightStreamTCP(config, onWeight, onStatus);
  } else {
    return startWeightStreamSerial(config, onWeight, onStatus);
  }
}

// ─── Тест подключения ──────────────────────────────────────────────────────

export function testScales(config: ScaleConfig): Promise<boolean> {
  return new Promise((resolve) => {
    if (config.connection_type === 'lan') {
      const net = require('net');
      const socket = net.createConnection({ host: config.lan_ip, port: config.lan_port, timeout: 4000 });
      const timer = setTimeout(() => { socket.destroy(); resolve(false); }, 4000);
      socket.on('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true); });
      socket.on('error', () => { clearTimeout(timer); resolve(false); });
      socket.on('timeout', () => { clearTimeout(timer); resolve(false); });
    } else {
      const stream = startWeightStreamSerial(config, (reading) => {
        stream.stop();
        resolve(!reading.error);
      });
      setTimeout(() => { stream.stop(); resolve(false); }, 4000);
    }
  });
}

// ─── Диагностика — собираем сырые данные 10 секунд ────────────────────────

export function diagnoseScales(config: ScaleConfig): Promise<string[]> {
  return new Promise((resolve) => {
    const rawLines: string[] = [];
    const net = require('net');

    if (config.connection_type !== 'lan') {
      resolve(['Диагностика доступна только для LAN подключения']);
      return;
    }

    const socket = net.createConnection({ host: config.lan_ip, port: config.lan_port, timeout: 5000 });
    let buffer = '';

    socket.on('connect', () => {
      rawLines.push(`✅ Подключено к ${config.lan_ip}:${config.lan_port}`);
      // OCOM/TM-F66: отправить запрос
      try { socket.write('W\r\n'); } catch (_) { }

      const pollInterval = setInterval(() => {
        try { socket.write('W\r\n'); } catch (_) { }
      }, 400);

      setTimeout(() => {
        clearInterval(pollInterval);
        socket.destroy();
        resolve(rawLines);
      }, 10000);
    });

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('binary');
      const lines = buffer.split(/[\r\n]+/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) {
          rawLines.push(`RAW: ${line.replace(/[^\x20-\x7E]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`)}`);
          // Попробовать распарсить
          for (const p of ['ocom', 'cas', 'toledo', 'massak', 'raw'] as ScaleConfig['protocol'][]) {
            const r = parseWeight(line, p);
            if (r !== null) {
              rawLines.push(`  → Протокол ${p.toUpperCase()}: вес=${r.weight.toFixed(3)} кг, стабильный=${r.stable}`);
              break;
            }
          }
        }
      }
    });

    socket.on('error', (err: Error) => {
      rawLines.push(`❌ Ошибка: ${err.message}`);
      resolve(rawLines);
    });

    socket.on('timeout', () => {
      rawLines.push('❌ Таймаут подключения');
      socket.destroy();
      resolve(rawLines);
    });
  });
}

// ─── Парсинг данных от весов ───────────────────────────────────────────────

export function parseWeight(line: string, protocol: string): WeightReading | null {
  try {
    const trimmed = line.trim();
    if (!trimmed) return null;

    if (protocol === 'ocom') {
      // OCOM TM-F66: например "W+001.250S" или "W+001.250U" или " +001.250kg"
      // Формат: признак(W/S), знак(+/-), вес, статус(S=stable, U=unstable)
      const m1 = trimmed.match(/W([+-]?)(\d+\.?\d*)\s*([SU]?)/i);
      if (m1) {
        const weight = parseFloat(m1[2]) * (m1[1] === '-' ? -1 : 1);
        const stable = m1[3].toUpperCase() !== 'U';
        return { weight: Math.max(0, weight), stable };
      }
      // Альтернативный OCOM формат: "  +001.250 kg S"
      const m2 = trimmed.match(/([+-]?\s*\d+\.?\d*)\s*(?:kg)?\s*([SU]?)/i);
      if (m2) {
        const weight = parseFloat(m2[1].replace(/\s/g, ''));
        const stable = m2[2].toUpperCase() !== 'U';
        if (!isNaN(weight)) return { weight: Math.max(0, weight), stable };
      }
    }

    if (protocol === 'cas') {
      // CAS: "ST,GS,  1.250kg" или "US,GS, ..."
      const m = trimmed.match(/([SU][TSN])\s*,\s*([GN][ST])\s*,\s*([+-]?\d+\.?\d*)\s*(?:kg)?/i);
      if (m) {
        const stable = m[1].toUpperCase().startsWith('S');
        const weight = parseFloat(m[3]);
        return { weight: Math.max(0, weight), stable };
      }
      // Короткий CAS: "GS  1.250 kg"
      const m2 = trimmed.match(/(GS|US)\s+([+-]?\d+\.?\d*)\s*(?:kg)?/i);
      if (m2) {
        return { weight: Math.max(0, parseFloat(m2[2])), stable: m2[1].toUpperCase() === 'GS' };
      }
    }

    if (protocol === 'toledo') {
      // Toledo: "  1.250 kg" или "?1.250 kg" (? = нестабильный)
      const m = trimmed.match(/([?!]?)([+-]?\s*\d+\.?\d*)\s*(?:kg|g)?/i);
      if (m) {
        let weight = parseFloat(m[2].replace(/\s/g, ''));
        const stable = !m[1];
        // Если г — переводим
        if (trimmed.toLowerCase().includes(' g') && !trimmed.toLowerCase().includes('kg')) {
          weight = weight / 1000;
        }
        if (!isNaN(weight)) return { weight: Math.max(0, weight), stable };
      }
    }

    if (protocol === 'massak') {
      // Massa-K: "$+  1.250" или "$-  0.000"
      const m = trimmed.match(/\$([+-])\s*(\d+\.?\d*)/);
      if (m) {
        const weight = parseFloat(m[2]);
        return { weight: Math.max(0, weight), stable: true };
      }
    }

    if (protocol === 'raw') {
      // Ищем любое числовое значение с точкой (вероятно вес)
      const m = trimmed.match(/([+-]?\d+\.\d{2,3})/);
      if (m) {
        const weight = Math.abs(parseFloat(m[1]));
        if (!isNaN(weight) && weight < 1000) {
          return { weight, stable: true };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
