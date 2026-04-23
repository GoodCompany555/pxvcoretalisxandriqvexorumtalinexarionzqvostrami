import { registerRpc } from '../services/rpc';
import { ipcMain } from 'electron';
import { mainWindow } from '../main';
import { db } from '../database';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';

export function setupDocumentsHandlers() {
  // Получить историю сгенерированных документов
  registerRpc('documents:get-all', async (_event, companyId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const docs = db.prepare(`
        SELECT d.*, c.name as client_name, r.total_amount 
        FROM documents d
        JOIN clients c ON d.client_id = c.id
        JOIN receipts r ON d.receipt_id = r.id
        WHERE d.company_id = ?
        ORDER BY d.generated_at DESC
      `).all(companyId);
      return { success: true, data: docs };
    } catch (error) {
      log.error('Failed to get documents:', error);
      return { success: false, error: 'Ошибка загрузки документов' };
    }
  });

  // Получить список чеков (продаж) для которых можно сгенерировать документы
  registerRpc('documents:get-receipts', async (_event, companyId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');
      // Берем последние 100 успешных продаж
      const receipts = db.prepare(`
          SELECT 
            id, total_amount, payment_type, created_at, 
            (SELECT COUNT(*) FROM documents WHERE receipt_id = receipts.id) as docs_count
          FROM receipts
          WHERE company_id = ? AND type = 'sale'
          ORDER BY created_at DESC 
          LIMIT 100
        `).all(companyId);
      return { success: true, data: receipts };
    } catch (error) {
      log.error('Failed to get receipts for documents:', error);
      return { success: false, error: 'Ошибка загрузки чеков' };
    }
  });

  // Получить данные чека и клиента для рендеринга шаблона
  registerRpc('documents:get-details', async (_event, companyId: string, docId: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      const doc = db.prepare(`SELECT * FROM documents WHERE id = ? AND company_id = ?`).get(docId, companyId);
      if (!doc) throw new Error('Document not found');

      const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(doc.client_id);
      const receipt = db.prepare(`SELECT * FROM receipts WHERE id = ?`).get(doc.receipt_id);
      const company = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(companyId);

      const items = db.prepare(`
            SELECT ri.*, p.name as product_name, p.measure_unit, p.vat_rate 
            FROM receipt_items ri
            JOIN products p ON ri.product_id = p.id
            WHERE ri.receipt_id = ?
        `).all(doc.receipt_id);

      return {
        success: true,
        data: { doc, client, receipt, items, company }
      };
    } catch (error) {
      log.error('Failed to get document details:', error);
      return { success: false, error: 'Ошибка загрузки деталей документа' };
    }
  });

  // Сгенерировать новый документ
  registerRpc('documents:generate', async (_event, data: any) => {
    try {
      if (!db) throw new Error('Database not initialized');

      const id = uuidv4();

      // Генерация красивого номера документа (например, ЭСФ-2023-0001)
      const year = new Date().getFullYear();
      const countData = db.prepare(`SELECT COUNT(*) as count FROM documents WHERE company_id = ? AND doc_type = ? AND strftime('%Y', generated_at) = ?`).get(data.companyId, data.docType, String(year)) as { count: number };

      const docNumber = `${data.docType === 'invoice' ? 'ЭСФ' : data.docType === 'avr' ? 'АВР' : 'НАК'}-${year}-${String(countData.count + 1).padStart(4, '0')}`;

      db.prepare(`
        INSERT INTO documents (id, company_id, client_id, receipt_id, doc_type, doc_number)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, data.companyId, data.clientId, data.receiptId, data.docType, docNumber);

      return { success: true, data: { id, docNumber } };
    } catch (error) {
      log.error('Failed to generate document:', error);
      return { success: false, error: 'Ошибка генерации документа' };
    }
  });
}
