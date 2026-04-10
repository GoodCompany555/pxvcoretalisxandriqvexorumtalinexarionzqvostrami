import log from 'electron-log';

export interface ScaleConfig {
  com_port: string;
  baud_rate: number;
  protocol: 'cas' | 'toledo' | 'massak';
}

export interface WeightReading {
  weight: number;      // вес в кг
  stable: boolean;     // стабильный ли вес
  error?: string;
}

let activePort: any = null;
let lastWeight = 0;
let lastStable = false;

/**
 * Начать чтение данных с весов (стриминг)
 */
export function startWeightStream(
  config: ScaleConfig,
  onWeight: (reading: WeightReading) => void
): { stop: () => void } {
  try {
    const { SerialPort } = require('serialport');

    if (activePort) {
      try { activePort.close(); } catch (_) { }
      activePort = null;
    }

    const port = new SerialPort({
      path: config.com_port,
      baudRate: config.baud_rate || 9600,
      autoOpen: true,
    });

    activePort = port;
    let buffer = '';

    port.on('data', (data: Buffer) => {
      buffer += data.toString('ascii');

      // Парсим по протоколу
      const lines = buffer.split(/[\r\n]+/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        const reading = parseWeight(line, config.protocol);
        if (reading) {
          // Стабилизация: если вес прыгает более чем на 5г — нестабильно
          const diff = Math.abs(reading.weight - lastWeight);
          reading.stable = diff < 0.005;
          lastWeight = reading.weight;
          lastStable = reading.stable;
          onWeight(reading);
        }
      }
    });

    port.on('error', (err: Error) => {
      log.error('Scales error:', err.message);
      onWeight({ weight: 0, stable: false, error: err.message });
    });

    // Для протокола CAS/Toledo нужно периодически отправлять запрос веса
    let pollTimer: any = null;
    if (config.protocol === 'cas') {
      // CAS: отправляем запрос "W" каждые 300мс
      pollTimer = setInterval(() => {
        if (port.isOpen) {
          port.write('W\r\n');
        }
      }, 300);
    } else if (config.protocol === 'toledo') {
      // Toledo: отправляем ENQ (0x05) каждые 300мс
      pollTimer = setInterval(() => {
        if (port.isOpen) {
          port.write(Buffer.from([0x05]));
        }
      }, 300);
    } else if (config.protocol === 'massak') {
      // Massa-K: непрерывный поток, ничего не отправляем
    }

    return {
      stop: () => {
        if (pollTimer) clearInterval(pollTimer);
        try { port.close(); } catch (_) { }
        activePort = null;
      }
    };
  } catch (e: any) {
    log.error('Failed to start weight stream:', e.message);
    onWeight({ weight: 0, stable: false, error: e.message });
    return { stop: () => { } };
  }
}

/**
 * Одноразовое чтение веса (для теста)
 */
export function readWeightOnce(config: ScaleConfig): Promise<WeightReading> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      stream.stop();
      resolve({ weight: 0, stable: false, error: 'Таймаут чтения весов' });
    }, 5000);

    const stream = startWeightStream(config, (reading) => {
      clearTimeout(timeout);
      stream.stop();
      resolve(reading);
    });
  });
}

/**
 * Тест подключения весов
 */
export function testScales(config: ScaleConfig): Promise<boolean> {
  return new Promise(async (resolve) => {
    try {
      const reading = await readWeightOnce(config);
      resolve(!reading.error);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Парсинг строки веса по протоколу
 */
function parseWeight(line: string, protocol: string): WeightReading | null {
  try {
    if (protocol === 'cas') {
      // CAS: формат "ST,GS,  0.000kg" или "ST,NT,  1.250kg"
      // или "US,GS,  0.000kg" (US = unstable)
      const match = line.match(/([SU][TSN]),([GN][ST]),\s*([\d.]+)\s*kg/i);
      if (match) {
        const stable = match[1].startsWith('S');
        const weight = parseFloat(match[3]);
        return { weight, stable };
      }
    } else if (protocol === 'toledo') {
      // Toledo IND: формат как "  1.250 kg"
      // Стабильность определяется наличием пробела в начале vs символ '?'
      const match = line.match(/\s*([\d.]+)\s*kg/i);
      if (match) {
        const weight = parseFloat(match[1]);
        const stable = !line.includes('?');
        return { weight, stable };
      }
    } else if (protocol === 'massak') {
      // Massa-K: формат "$+  1.250\r"
      const match = line.match(/\$[+-]\s*([\d.]+)/);
      if (match) {
        const weight = parseFloat(match[1]);
        return { weight, stable: true };
      }
    }

    // Fallback: попробуем любое числ
    const numMatch = line.match(/([\d.]+)/);
    if (numMatch) {
      return { weight: parseFloat(numMatch[1]), stable: true };
    }

    return null;
  } catch {
    return null;
  }
}
