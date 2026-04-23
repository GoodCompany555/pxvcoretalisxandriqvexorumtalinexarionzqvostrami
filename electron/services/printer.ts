import log from 'electron-log';
import { db } from '../database';
import { v4 as uuidv4 } from 'uuid';

export interface ReceiptPrintData {
  companyName: string;
  companyBin: string;
  companyAddress: string;
  cashierName: string;
  receiptNumber: number;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    total: number;
    vat_rate?: number;
  }>;
  totalAmount: number;
  vatAmount: number;
  cashAmount: number;
  cardAmount: number;
  paymentType: string;
  terminalBank?: string;
  ofdTicketUrl?: string;
  date: string;
  taxRegime?: string;
}

export interface XReportData {
  companyName: string;
  cashierName: string;
  znm: string;
  date: string;
  time: string;
  salesCount: number;
  productsCount: number;
  cashSales: number;
  cardSales: number;
  qrSales: number;
  totalSales: number;
  returnsCount: number;
  returnsCash: number;
  returnsCard: number;
  returnsQr: number;
  totalReturns: number;
  netRevenue: number;
  deposits: number;
  withdrawals: number;
  cashBalance: number;
  cardByBank: Record<string, number>;
  vatAmount?: number;
  ofdTicketUrl?: string;
}

/**
 * Печать кассового чека на термопринтере
 * Использует node-thermal-printer
 * При ошибке — сохраняет в очередь печати
 */
export async function printReceipt(data: ReceiptPrintData, companyId: string): Promise<boolean> {
  try {
    const ThermalPrinter = require('node-thermal-printer');
    const printer = new ThermalPrinter.printer({
      type: ThermalPrinter.types.EPSON,
      interface: 'tcp://localhost:9100',
      options: { timeout: 3000 }
    });

    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      throw new Error('Printer not connected');
    }

    // Заголовок
    printer.alignCenter();
    printer.bold(true);
    printer.println(data.companyName);
    printer.bold(false);
    printer.println(`БИН: ${data.companyBin}`);
    printer.println(data.companyAddress);
    if (data.taxRegime) {
      printer.println(`Режим НП: ${data.taxRegime}`);
    }
    printer.drawLine();

    // Чек
    printer.alignLeft();
    printer.println(`Чек №${data.receiptNumber}`);
    printer.println(`Дата: ${data.date}`);
    printer.println(`Кассир: ${data.cashierName}`);
    printer.drawLine();

    // Товары
    for (const item of data.items) {
      printer.println(item.name);
      printer.tableCustom([
        { text: `${item.quantity} x ${item.price}`, align: 'LEFT', width: 0.5 },
        { text: `${item.total} ₸`, align: 'RIGHT', width: 0.5 },
      ]);
    }

    printer.drawLine();

    // Итого
    printer.bold(true);
    printer.tableCustom([
      { text: 'ИТОГО:', align: 'LEFT', width: 0.5 },
      { text: `${data.totalAmount} ₸`, align: 'RIGHT', width: 0.5 },
    ]);
    printer.bold(false);

    if (data.vatAmount > 0) {
      printer.tableCustom([
        { text: 'В т.ч. НДС:', align: 'LEFT', width: 0.5 },
        { text: `${Math.round(data.vatAmount)} ₸`, align: 'RIGHT', width: 0.5 },
      ]);
    }

    printer.drawLine();

    // Способ оплаты
    if (data.cashAmount > 0) {
      printer.println(`Наличные: ${data.cashAmount} ₸`);
    }
    if (data.cardAmount > 0) {
      printer.println(`Карта${data.terminalBank ? ` (${data.terminalBank})` : ''}: ${data.cardAmount} ₸`);
    }

    // QR-код фискализации
    if (data.ofdTicketUrl) {
      printer.newLine();
      printer.alignCenter();
      printer.printQR(data.ofdTicketUrl, { cellSize: 6, correction: 'M' });
      printer.println('Проверить чек:');
      printer.println(data.ofdTicketUrl);
    }

    printer.newLine();
    printer.alignCenter();
    printer.println('Спасибо за покупку!');
    printer.cut();

    await printer.execute();
    log.info(`Receipt #${data.receiptNumber} printed`);
    return true;
  } catch (err: any) {
    log.error('Print failed:', err.message);
    // Сохраняем в очередь печати
    await saveToPrintQueue(companyId, 'receipt', data);
    return false;
  }
}

/**
 * Печать X-отчёта
 */
export async function printXReport(data: XReportData, companyId: string): Promise<boolean> {
  try {
    const ThermalPrinter = require('node-thermal-printer');
    const printer = new ThermalPrinter.printer({
      type: ThermalPrinter.types.EPSON,
      interface: 'tcp://localhost:9100',
      options: { timeout: 3000 }
    });

    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) throw new Error('Printer not connected');

    printer.alignCenter();
    printer.bold(true);
    printer.println('═══════════════════════════');
    printer.println('X-ОТЧЁТ / X-ЕСЕП');
    printer.println(`Дата: ${data.date}`);
    printer.println(`Время: ${data.time}`);
    printer.println(`Кассир: ${data.cashierName}`);
    printer.println(`Касса: ${data.znm}`);
    printer.println('═══════════════════════════');
    printer.bold(false);

    printer.alignLeft();
    printer.println('ПРОДАЖИ:');
    printer.println(`  Кол-во чеков: ${data.salesCount}`);
    printer.println(`  Кол-во товаров: ${data.productsCount}`);
    printer.println(`  Наличные: ${data.cashSales} ₸`);
    printer.println(`  Карта: ${data.cardSales} ₸`);

    // Разбивка по банкам
    for (const [bank, amount] of Object.entries(data.cardByBank)) {
      printer.println(`    ${bank}: ${amount} ₸`);
    }

    printer.println(`  QR-оплата: ${data.qrSales} ₸`);
    printer.drawLine();
    printer.bold(true);
    printer.println(`  ИТОГО продажи: ${data.totalSales} ₸`);
    printer.bold(false);

    printer.newLine();
    printer.println('ВОЗВРАТЫ:');
    printer.println(`  Кол-во: ${data.returnsCount}`);
    printer.println(`  Наличные: ${data.returnsCash} ₸`);
    printer.println(`  Карта: ${data.returnsCard} ₸`);
    printer.println(`  QR: ${data.returnsQr} ₸`);
    printer.drawLine();
    printer.println(`  ИТОГО возвраты: ${data.totalReturns} ₸`);

    printer.newLine();
    printer.bold(true);
    printer.println('═══════════════════════════');
    printer.println(`ЧИСТАЯ ВЫРУЧКА: ${data.netRevenue} ₸`);
    printer.println('═══════════════════════════');
    printer.bold(false);

    printer.println(`  Внесения: ${data.deposits} ₸`);
    printer.println(`  Изъятия: ${data.withdrawals} ₸`);
    printer.println(`  Наличных в кассе: ${data.cashBalance} ₸`);

    printer.cut();
    await printer.execute();
    log.info('X-Report printed');
    return true;
  } catch (err: any) {
    log.error('X-Report print failed:', err.message);
    await saveToPrintQueue(companyId, 'x_report', data);
    return false;
  }
}

/**
 * Печать Z-отчёта (аналогично X-отчёту + фискальный номер)
 */
export async function printZReport(data: XReportData & { fiscalNumber?: string; openedAt?: string; closedAt?: string; ofdTicketUrl?: string }, companyId: string): Promise<boolean> {
  try {
    const ThermalPrinter = require('node-thermal-printer');
    const printer = new ThermalPrinter.printer({
      type: ThermalPrinter.types.EPSON,
      interface: 'tcp://localhost:9100',
      options: { timeout: 3000 }
    });

    printer.alignCenter();
    printer.bold(true);
    printer.println('═══════════════════════════');
    printer.println('Z-ОТЧЁТ / Z-ЕСЕП');
    printer.println('ЗАКРЫТИЕ СМЕНЫ');
    if (data.openedAt) printer.println(`Открытие: ${data.openedAt}`);
    if (data.closedAt) printer.println(`Закрытие: ${data.closedAt}`);
    printer.println(`Кассир: ${data.cashierName}`);
    printer.println(`ЗНМ: ${data.znm}`);
    if (data.fiscalNumber) printer.println(`Фискальный №: ${data.fiscalNumber}`);
    printer.println('═══════════════════════════');
    printer.bold(false);

    // Продажи
    printer.alignLeft();
    printer.println(`Чеков продажи: ${data.salesCount}`);
    printer.println(`Наличные: ${data.cashSales} ₸`);
    printer.println(`Карта: ${data.cardSales} ₸`);
    for (const [bank, amount] of Object.entries(data.cardByBank)) {
      printer.println(`  ${bank}: ${amount} ₸`);
    }
    printer.println(`QR: ${data.qrSales} ₸`);
    printer.bold(true);
    printer.println(`ИТОГО: ${data.totalSales} ₸`);
    printer.bold(false);

    // Возвраты
    printer.newLine();
    printer.println(`Чеков возврата: ${data.returnsCount}`);
    printer.println(`ИТОГО возвраты: ${data.totalReturns} ₸`);

    printer.newLine();
    printer.bold(true);
    printer.println('═══════════════════════════');
    printer.println(`ИТОГО ЗА СМЕНУ: ${data.netRevenue} ₸`);
    if (data.vatAmount) {
      printer.println(`ИТОГО НДС: ${Math.round(data.vatAmount)} ₸`);
    } else {
      // Fallback to 12% calculation if vatAmount is not provided but this is a legacy Z-report
      const fallbackVat = Math.round(data.netRevenue * 12 / 112);
      printer.println(`НДС (расч. 12%): ${fallbackVat} ₸`);
    }
    printer.println('═══════════════════════════');
    printer.bold(false);

    printer.println(`Внесения: ${data.deposits} ₸`);
    printer.println(`Изъятия: ${data.withdrawals} ₸`);
    printer.println(`Наличных в кассе: ${data.cashBalance} ₸`);

    // QR-код фискализации
    if (data.ofdTicketUrl) {
      printer.newLine();
      printer.alignCenter();
      printer.printQR(data.ofdTicketUrl, { cellSize: 6, correction: 'M' });
      printer.println('Проверить отчет:');
      printer.println(data.ofdTicketUrl);
    }

    printer.alignCenter();
    printer.newLine();
    printer.println('Смена закрыта успешно');
    printer.cut();

    await printer.execute();
    log.info('Z-Report printed');
    return true;
  } catch (err: any) {
    log.error('Z-Report print failed:', err.message);
    await saveToPrintQueue(companyId, 'z_report', data);
    return false;
  }
}

/**
 * Сохранить задание в очередь печати (при ошибке принтера)
 */
async function saveToPrintQueue(companyId: string, reportType: string, payload: any): Promise<void> {
  try {
    if (!db) return;
    db.prepare(`
      INSERT INTO printer_queue (id, company_id, report_type, payload, status, attempts)
      VALUES (?, ?, ?, ?, 'pending', 0)
    `).run(uuidv4(), companyId, reportType, JSON.stringify(payload));
    log.info(`Saved to print queue: ${reportType}`);
  } catch (e) {
    log.error('Failed to save to print queue', e);
  }
}

/**
 * Повторная печать из очереди (3 попытки)
 */
export async function retryPrintQueue(companyId: string): Promise<number> {
  if (!db) return 0;

  const pending = db.prepare(`
    SELECT * FROM printer_queue 
    WHERE company_id = ? AND status = 'pending' AND attempts < 3
    ORDER BY created_at ASC LIMIT 10
  `).all(companyId) as any[];

  let printed = 0;

  for (const item of pending) {
    const payload = JSON.parse(item.payload);
    let success = false;

    try {
      if (item.report_type === 'receipt') {
        success = await printReceipt(payload, companyId);
      } else if (item.report_type === 'x_report') {
        success = await printXReport(payload, companyId);
      } else if (item.report_type === 'z_report') {
        success = await printZReport(payload, companyId);
      }
    } catch { /* noop */ }

    if (success) {
      db.prepare(`UPDATE printer_queue SET status = 'printed' WHERE id = ?`).run(item.id);
      printed++;
    } else {
      db.prepare(`UPDATE printer_queue SET attempts = attempts + 1 WHERE id = ?`).run(item.id);
    }
  }

  return printed;
}

/**
 * Получить количество ожидающих печати
 */
export function getPrintQueueCount(companyId: string): number {
  if (!db) return 0;
  const row = db.prepare(`SELECT COUNT(*) as count FROM printer_queue WHERE company_id = ? AND status = 'pending'`).get(companyId) as { count: number };
  return row?.count || 0;
}
