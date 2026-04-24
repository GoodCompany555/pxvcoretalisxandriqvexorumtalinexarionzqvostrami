import log from 'electron-log';
import { db } from '../database';
import { WebkassaService } from './webkassa';

let timerId: NodeJS.Timeout | null = null;
let isProcessing = false;

export function startOfflineQueueProcessor() {
  if (timerId) return;

  // Проверяем очередь каждые 2 минуты (120000 мс)
  timerId = setInterval(processQueue, 120000);
  log.info('Offline OFD queue processor started');

  // Запуск сразу при старте, чтобы очистить накопленное
  setTimeout(processQueue, 10000);
}

export function stopOfflineQueueProcessor() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
    log.info('Offline OFD queue processor stopped');
  }
}

async function processQueue() {
  if (isProcessing) return;
  if (!db) return;

  try {
    isProcessing = true;

    // Берем до 20 чеков из очереди
    const pendingItems = db.prepare(`
      SELECT q.id as queue_id, q.receipt_id, q.payload, r.company_id 
      FROM ofd_queue q
      JOIN receipts r ON q.receipt_id = r.id
      ORDER BY q.created_at ASC
      LIMIT 20
    `).all() as any[];

    if (pendingItems.length === 0) {
      isProcessing = false;
      return;
    }

    log.info(`Processing ${pendingItems.length} items from OFD offline queue`);

    for (const item of pendingItems) {
      try {
        const payload = JSON.parse(item.payload);
        const webkassa = new WebkassaService(item.company_id);

        // В реальном приложении здесь будет маппинг сохраненного payload на метод WebKassa (Check или ZReport)
        // Мы сохраняли упрощенный payload в pos.ts
        if (payload.type === 'sale' || payload.type === 'sell' || payload.type === 'return') {
          const type: 'sale' | 'return' = (payload.type === 'return') ? 'return' : 'sale';

          const fiscalResult = await webkassa.printTicket({
            id: item.receipt_id,
            receiptNumber: Date.now(), // Fallback, though ExternalCheckNumber is more important
            type: type,
            paymentType: payload.moneyCard > 0 && payload.moneyCash > 0 ? 'mixed' : payload.moneyCard > 0 ? 'card' : 'cash',
            returnBasisDetails: payload.returnBasisDetails,
            total: (payload.moneyCard || 0) + (payload.moneyCash || 0),
            cash: payload.moneyCash || 0,
            card: payload.moneyCard || 0,
            items: payload.positions.map((p: any) => ({
              name: p.positionName,
              quantity: p.count,
              price: p.price,
              total: p.price * p.count - (p.discount || 0),
              discount: p.discount,
              markCode: p.markCode,
              vatRate: p.taxPercent
            }))
          });

          if (fiscalResult.success && fiscalResult.ticketUrl) {
            // Обновляем статус чека
            db.prepare(`
               UPDATE receipts 
               SET ofd_status = 'sent', ofd_ticket_url = ?
               WHERE id = ?
             `).run(fiscalResult.ticketUrl, item.receipt_id);

            // Удаляем из очереди
            db.prepare(`DELETE FROM ofd_queue WHERE id = ?`).run(item.queue_id);
            log.info(`Successfully processed offline receipt ${item.receipt_id}`);
          } else {
            log.warn(`Failed to process offline receipt ${item.receipt_id}:`, fiscalResult.error);
            // Если ошибка "OFD Disabled", удаляем из очереди (ОФД выключили)
            if (fiscalResult.error === 'OFD Disabled') {
              db.prepare(`DELETE FROM ofd_queue WHERE id = ?`).run(item.queue_id);
            }
          }
        }
      } catch (itemError) {
        log.error(`Error processing queue item ${item.queue_id}`, itemError);
      }
    }
  } catch (error) {
    log.error('Failed to process offline OFD queue', error);
  } finally {
    isProcessing = false;
  }
}
