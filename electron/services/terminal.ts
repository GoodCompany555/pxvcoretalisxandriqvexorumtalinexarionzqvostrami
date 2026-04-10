import log from 'electron-log';
import net from 'net';

// UPOS Protocol commands
const UPOS_PURCHASE = Buffer.from([0x02, 0x00, 0x01]); // STX + Operation Purchase

export interface TerminalConfig {
  id: string;
  bank_name: string;
  model: string;
  connection_type: 'tcp' | 'com';
  address: string;
  port: number;
  baud_rate: number;
}

export interface PaymentResult {
  success: boolean;
  rrn?: string;            // Reference Retrieval Number
  authCode?: string;       // Authorization code
  cardMask?: string;       // Last 4 digits
  terminalId?: string;
  error?: string;
}

/**
 * Пинг терминала — проверка доступности
 */
export function pingTerminal(config: TerminalConfig): Promise<boolean> {
  return new Promise((resolve) => {
    if (config.connection_type === 'tcp') {
      const client = new net.Socket();
      const timeout = setTimeout(() => {
        client.destroy();
        resolve(false);
      }, 3000);

      client.connect(config.port, config.address, () => {
        clearTimeout(timeout);
        client.destroy();
        resolve(true);
      });

      client.on('error', () => {
        clearTimeout(timeout);
        client.destroy();
        resolve(false);
      });
    } else {
      // COM-порт: пробуем открыть и закрыть
      try {
        const { SerialPort } = require('serialport');
        const port = new SerialPort({
          path: config.address,
          baudRate: config.baud_rate || 9600,
          autoOpen: false,
        });
        port.open((err: any) => {
          if (err) {
            resolve(false);
          } else {
            port.close();
            resolve(true);
          }
        });
      } catch (e) {
        resolve(false);
      }
    }
  });
}

/**
 * Отправить сумму на POS-терминал для оплаты (UPOS PURCHASE)
 * Сумма в тиынах (1500 тг = 150000)
 */
export function sendPurchase(
  config: TerminalConfig,
  amountTiyn: number,
  timeoutMs: number = 120000
): Promise<PaymentResult> {
  return new Promise((resolve) => {
    // Формируем UPOS-пакет PURCHASE
    // Формат: STX(0x02) + LEN(2b) + CMD(0x01=Purchase) + AMOUNT(12b ASCII) + ETX(0x03) + LRC
    const amountStr = String(amountTiyn).padStart(12, '0');
    const cmdBuf = Buffer.from(`\x02${String.fromCharCode(amountStr.length + 1)}\x01${amountStr}\x03`, 'binary');

    log.info(`Terminal PURCHASE: ${amountTiyn} tiyn to ${config.bank_name} (${config.address}:${config.port})`);

    if (config.connection_type === 'tcp') {
      const client = new net.Socket();
      let responseData = Buffer.alloc(0);

      const timer = setTimeout(() => {
        log.warn('Terminal payment timeout');
        client.destroy();
        resolve({ success: false, error: 'Таймаут (клиент не оплатил за 120 сек)' });
      }, timeoutMs);

      client.connect(config.port, config.address, () => {
        log.info('Connected to terminal, sending PURCHASE...');
        client.write(cmdBuf);
      });

      client.on('data', (data: Buffer) => {
        responseData = Buffer.concat([responseData, data]);
        // Пробуем парсить ответ UPOS
        const result = parseUposResponse(responseData);
        if (result) {
          clearTimeout(timer);
          client.destroy();
          resolve(result);
        }
      });

      client.on('error', (err: Error) => {
        clearTimeout(timer);
        client.destroy();
        log.error('Terminal TCP error:', err.message);
        resolve({ success: false, error: `Ошибка связи: ${err.message}` });
      });

      client.on('close', () => {
        clearTimeout(timer);
      });
    } else {
      // COM-порт через serialport
      try {
        const { SerialPort } = require('serialport');
        const port = new SerialPort({
          path: config.address,
          baudRate: config.baud_rate || 9600,
        });
        let responseData = Buffer.alloc(0);

        const timer = setTimeout(() => {
          port.close();
          resolve({ success: false, error: 'Таймаут (клиент не оплатил за 120 сек)' });
        }, timeoutMs);

        port.on('open', () => {
          port.write(cmdBuf);
        });

        port.on('data', (data: Buffer) => {
          responseData = Buffer.concat([responseData, data]);
          const result = parseUposResponse(responseData);
          if (result) {
            clearTimeout(timer);
            port.close();
            resolve(result);
          }
        });

        port.on('error', (err: Error) => {
          clearTimeout(timer);
          log.error('Terminal COM error:', err.message);
          resolve({ success: false, error: `Ошибка связи: ${err.message}` });
        });
      } catch (e: any) {
        resolve({ success: false, error: e.message });
      }
    }
  });
}

/**
 * Отмена текущей транзакции на терминале
 */
export function cancelTransaction(config: TerminalConfig): Promise<boolean> {
  return new Promise((resolve) => {
    const cancelBuf = Buffer.from('\x02\x01\x06\x03', 'binary'); // UPOS CANCEL
    if (config.connection_type === 'tcp') {
      const client = new net.Socket();
      const timer = setTimeout(() => { client.destroy(); resolve(false); }, 5000);
      client.connect(config.port, config.address, () => {
        client.write(cancelBuf);
        clearTimeout(timer);
        client.destroy();
        resolve(true);
      });
      client.on('error', () => { clearTimeout(timer); resolve(false); });
    } else {
      try {
        const { SerialPort } = require('serialport');
        const port = new SerialPort({ path: config.address, baudRate: config.baud_rate || 9600 });
        port.on('open', () => { port.write(cancelBuf); port.close(); resolve(true); });
        port.on('error', () => resolve(false));
      } catch { resolve(false); }
    }
  });
}

/**
 * Парсинг ответа UPOS терминала
 */
function parseUposResponse(data: Buffer): PaymentResult | null {
  // Минимальная длина ответа UPOS — 20 байт
  if (data.length < 10) return null;

  // Ищем STX (0x02) и ETX (0x03)
  const stxIdx = data.indexOf(0x02);
  const etxIdx = data.indexOf(0x03, stxIdx);
  if (stxIdx === -1 || etxIdx === -1) return null;

  const payload = data.slice(stxIdx + 1, etxIdx).toString('ascii');

  // Response Code: первые 2 символа, "00" = success
  const responseCode = payload.substring(0, 2);
  const success = responseCode === '00';

  if (success) {
    // RRN: 12 символов с позиции 2
    const rrn = payload.substring(2, 14).trim();
    // Auth code: 6 символов с позиции 14
    const authCode = payload.substring(14, 20).trim();
    // Card mask: 4 последних цифры карты с позиции 20
    const cardMask = payload.substring(20, 24).trim();

    return {
      success: true,
      rrn: rrn || `RRN-${Date.now()}`,
      authCode: authCode || `AUTH-${Math.random().toString(36).substring(2, 8)}`,
      cardMask: cardMask || '****',
    };
  } else {
    // Код ошибки
    const errorText = payload.substring(2).trim() || `Отказ (код: ${responseCode})`;
    return { success: false, error: errorText };
  }
}
