import axios from 'axios';
import log from 'electron-log';
import { db } from '../database';

// Базовый URL для Webkassa (используем боевой контур)
const WEBKASSA_API_URL = 'https://kkm.webkassa.kz/api'; // Продакшн URL
const HARDCODED_API_KEY = 'WK-65004DAD-C9ED-4C71-953D-EFF3B2516BEF';

export interface WebkassaSettings {
  ofdProvider: string;
  ofdApiKey: string;
  ofdLogin: string;
  ofdPassword: string;
  ofdCashboxId: string;
}

export class WebkassaService {
  private companyId: string;
  private settings: WebkassaSettings | null = null;
  private token: string | null = null;

  constructor(companyId: string) {
    this.companyId = companyId;
    this.loadSettings();
  }

  private loadSettings() {
    if (!db) return;
    try {
      this.settings = db.prepare(`
        SELECT 
          ofd_provider as ofdProvider,
          ofd_token as ofdApiKey,
          ofd_login as ofdLogin,
          ofd_password as ofdPassword,
          ofd_cashbox_id as ofdCashboxId
        FROM settings
        WHERE company_id = ?
      `).get(this.companyId) as WebkassaSettings;
    } catch (e) {
      log.error('Failed to load Webkassa settings', e);
    }
  }

  // 1. Авторизация
  async authorize(): Promise<{ success: boolean; error?: string }> {
    if (!this.settings || this.settings.ofdProvider === 'none') {
      return { success: false, error: 'ОФД отключен в настройках' };
    }

    if (this.settings.ofdProvider === 'mock') {
      log.info('OFD Mock: Authorization successful');
      this.token = 'mock-token-123';
      return { success: true };
    }

    try {
      // Пример запроса авторизации Webkassa
      // (Точные поля могут отличаться в зависимости от версии API Webkassa)
      log.info(`Authorizing Webkassa for ${this.settings.ofdLogin}...`);

      const response = await axios.post(`${WEBKASSA_API_URL}/Authorize`, {
        Login: this.settings.ofdLogin,
        Password: this.settings.ofdPassword,
      }, {
        headers: {
          'X-API-KEY': HARDCODED_API_KEY,
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.Data && response.data.Data.Token) {
        this.token = response.data.Data.Token;
        log.info('Webkassa Authorization successful');
        return { success: true };
      }

      return { success: false, error: 'В ответе сервера отсутствует токен' };
    } catch (error: any) {
      const errMsg = error?.response?.data?.Errors?.[0]?.Text || error?.response?.data?.message || error.message;
      log.error('Webkassa Auth Error:', error?.response?.data || error.message);
      return { success: false, error: errMsg };
    }
  }

  // Вспомогательный класс для проверки работы
  public async checkStatus(): Promise<{ success: boolean; error?: string }> {
    return await this.authorize();
  }

  // 2. Открытие смены (Z-отчет)
  async openShift(cashierName: string): Promise<boolean> {
    // В реальном API Webkassa смена открывается автоматически при первом чеке 
    // или специальным Z-отчетом. Здесь mock:
    if (this.settings?.ofdProvider === 'mock') return true;

    return true;
  }

  // 3. Закрытие смены (Снятие Z-отчета)
  async closeShift(): Promise<boolean> {
    if (!this.token) {
      const auth = await this.authorize();
      if (!auth.success) return false;
    }
    if (this.settings?.ofdProvider === 'mock') return true;

    try {
      const response = await axios.post(`${WEBKASSA_API_URL}/ZReport`, {
        CashboxUniqueNumber: this.settings?.ofdCashboxId,
        Token: this.token
      }, {
        headers: { 'X-API-KEY': HARDCODED_API_KEY }
      })

      return response.data?.success || true;
    } catch (e) {
      log.error('Webkassa ZReport Error', e);
      return false;
    }
  }

  // 4. Фискализация чека
  async printTicket(receiptData: {
    receiptNumber: number;
    type: 'sale' | 'return';
    paymentType: 'cash' | 'card' | 'mixed';
    total: number;
    cash: number;
    card: number;
    items: Array<{
      name: string;
      quantity: number;
      price: number;
      total: number;
    }>
  }): Promise<{ success: boolean; ticketUrl?: string; error?: string }> {
    if (!this.settings || this.settings.ofdProvider === 'none') {
      return { success: false, error: 'OFD Disabled' };
    }

    if (this.settings.ofdProvider === 'mock') {
      // Эмуляция задержки сети и успешного ответа
      await new Promise(resolve => setTimeout(resolve, 800));
      return {
        success: true,
        ticketUrl: `https://consumer.oofd.kz/ticket/mock-${receiptData.receiptNumber}-${Date.now()}`
      }
    }

    if (!this.token) {
      const authOk = await this.authorize();
      if (!authOk.success) return { success: false, error: authOk.error || 'Unauthorized in Webkassa' };
    }

    try {
      // Формирование структуры чека Webkassa
      // Внимание: Структура упрощена. Реальный API требует больше параметров (НДС, Маркировка)
      const ticketReq = {
        Token: this.token,
        CashboxUniqueNumber: this.settings.ofdCashboxId,
        OperationType: receiptData.type === 'sale' ? 0 : 1, // 0 - Покупка, 1 - Возврат покупки
        Positions: receiptData.items.map(item => ({
          Count: item.quantity,
          Price: item.price,
          TaxPercent: 0,
          TaxType: 0, // Без НДС
          PositionName: item.name
        })),
        Payments: [
          ...(receiptData.cash > 0 ? [{ PaymentType: 0, Sum: receiptData.cash }] : []), // 0 - Наличные
          ...(receiptData.card > 0 ? [{ PaymentType: 1, Sum: receiptData.card }] : [])  // 1 - Карта
        ]
      };

      const response = await axios.post(`${WEBKASSA_API_URL}/Check`, ticketReq, {
        headers: { 'X-API-KEY': HARDCODED_API_KEY }
      });

      if (response.data && response.data.Data && response.data.Data.TicketUrl) {
        return {
          success: true,
          ticketUrl: response.data.Data.TicketUrl
        };
      } else {
        throw new Error(response.data?.Errors?.[0]?.Text || 'Unknown OFD Error');
      }

    } catch (error: any) {
      log.error('Webkassa Ticket Error:', error?.response?.data || error.message);
      return {
        success: false,
        error: error?.response?.data?.Errors?.[0]?.Text || error.message
      };
    }
  }
}
