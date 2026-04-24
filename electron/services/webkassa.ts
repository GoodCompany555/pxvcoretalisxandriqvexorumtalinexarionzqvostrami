import axios from 'axios';
import log from 'electron-log';
import { db } from '../database';
import { decryptData } from '../main';

// Базовый URL для Webkassa (используем v4 API)
const WEBKASSA_API_URL = 'https://kkm.webkassa.kz/api/v4';
const HARDCODED_API_KEY = 'WK-65004DAD-C9ED-4C71-953D-EFF3B2516BEF';

export interface WebkassaSettings {
  ofdProvider: string;
  ofdLogin: string;
  ofdPassword: string;
  ofdCashboxId: string;
}

// Глобальный кэш токенов (CompanyId -> {token: string, expires: number})
const tokenCache = new Map<string, string>();

export class WebkassaService {
  private companyId: string;
  private settings: WebkassaSettings | null = null;
  private get token(): string | null {
    return tokenCache.get(this.companyId) || null;
  }
  private set token(val: string | null) {
    if (val) tokenCache.set(this.companyId, val);
    else tokenCache.delete(this.companyId);
  }

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
          ofd_login as ofdLogin,
          ofd_password as ofdPassword,
          ofd_cashbox_id as ofdCashboxId
        FROM settings
        WHERE company_id = ?
      `).get(this.companyId) as WebkassaSettings;

      if (this.settings && this.settings.ofdPassword) {
        this.settings.ofdPassword = decryptData(this.settings.ofdPassword);
      }
    } catch (e) {
      log.error('Failed to load Webkassa settings', e);
    }
  }

  private getHeaders() {
    return {
      'X-API-KEY': HARDCODED_API_KEY,
      'Content-Type': 'application/json'
    };
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
      log.info(`Authorizing Webkassa v4 for ${this.settings.ofdLogin}...`);

      const response = await axios.post(`${WEBKASSA_API_URL}/Authorize`, {
        Login: this.settings.ofdLogin,
        Password: this.settings.ofdPassword,
      }, {
        headers: this.getHeaders()
      });

      if (response.data && response.data.Data && response.data.Data.Token) {
        this.token = response.data.Data.Token;
        log.info('Webkassa Authorization successful');
        return { success: true };
      }

      const errorMsg = response.data?.Errors?.[0]?.Text || 'В ответе сервера отсутствует токен';
      return { success: false, error: errorMsg };
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

  // 2. Открытие смены (Смена открывается автоматически при первом чеке в Webkassa)
  async openShift(cashierName: string): Promise<boolean> {
    if (this.settings?.ofdProvider === 'mock') return true;
    return true;
  }

  // 3. Закрытие смены (Снятие Z-отчета)
  async closeShift(): Promise<{ success: boolean; ticketUrl?: string; reportNumber?: string; error?: string }> {
    if (!this.token) {
      const auth = await this.authorize();
      if (!auth.success) return { success: false, error: auth.error };
    }
    if (this.settings?.ofdProvider === 'mock') return { success: true, ticketUrl: 'https://mock-z-report' };

    try {
      const response = await axios.post(`${WEBKASSA_API_URL}/ZReport`, {
        CashboxUniqueNumber: this.settings?.ofdCashboxId,
        Token: this.token
      }, {
        headers: this.getHeaders()
      });

      if (response.data && response.data.Data) {
        return {
          success: true,
          ticketUrl: response.data.Data.TicketUrl,
          reportNumber: response.data.Data.ReportNumber
        };
      }
      return { success: false, error: response.data?.Errors?.[0]?.Text || 'Unknown error' };
    } catch (e: any) {
      log.error('Webkassa ZReport Error', e);
      return { success: false, error: e.message };
    }
  }

  // 4. Фискализация чека
  async printTicket(receiptData: {
    id: string; // UUID из БД
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
      discount?: number;
      markCode?: string;
      vatRate?: number;
    }>;
    returnBasisDetails?: {
      CheckNumber: string;
      DateTime: string;
      RegistrationNumber: string;
      Total: number;
      IsOffline: boolean;
    };
  }): Promise<{ success: boolean; ticketUrl?: string; ticketNumber?: string; ofdDateTime?: string; ofdRegistrationNumber?: string; error?: string, errorCode?: number }> {
    if (!this.settings || this.settings.ofdProvider === 'none') {
      return { success: false, error: 'OFD Disabled' };
    }

    if (this.settings.ofdProvider === 'mock') {
      await new Promise(resolve => setTimeout(resolve, 800));
      return {
        success: true,
        ticketUrl: `https://consumer.oofd.kz/ticket/mock-${receiptData.receiptNumber}-${Date.now()}`,
        ticketNumber: `FP-${Math.floor(Math.random() * 1000000)}`
      }
    }

    if (!this.token) {
      const authOk = await this.authorize();
      if (!authOk.success) return { success: false, error: authOk.error || 'Unauthorized in Webkassa' };
    }

    let attempt = 0;
    const maxAttempts = 2;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const ticketReq = {
          Token: this.token,
          CashboxUniqueNumber: this.settings.ofdCashboxId,
          OperationType: receiptData.type === 'sale' ? 2 : 3,
          Positions: receiptData.items.map(item => {
            let taxPercent = 0;
            if (typeof item.vatRate === 'number') {
              taxPercent = Math.round(item.vatRate);
            } else if (typeof item.vatRate === 'string') {
              const parsed = parseInt(item.vatRate, 10);
              taxPercent = isNaN(parsed) ? 0 : parsed;
            }

            const taxType = taxPercent > 0 ? 100 : 0; // 100 = НДС, 0 = Без НДС
            const itemTotal = Math.round((item.total || (item.price * item.quantity)) * 100) / 100;
            const taxAmount = taxPercent > 0 ? Math.round((itemTotal * taxPercent / (100 + taxPercent)) * 100) / 100 : 0;

            return {
              Count: item.quantity,
              Price: Math.round(item.price * 100) / 100,
              TaxPercent: taxPercent,
              TaxType: taxType,
              Tax: taxAmount,
              PositionName: item.name,
              UnitCode: 796,
              Total: itemTotal,
              ...(item.discount ? { Discount: Math.round(item.discount * 100) / 100 } : {}),
              ...(item.markCode ? { Mark: item.markCode } : {})
            };
          }),
          Payments: [
            ...(receiptData.cash > 0 ? [{ PaymentType: 0, Sum: Math.round(receiptData.cash * 100) / 100 }] : []),
            ...(receiptData.card > 0 ? [{ PaymentType: 1, Sum: Math.round(receiptData.card * 100) / 100 }] : [])
          ],
          ExternalCheckNumber: receiptData.id,
          RoundType: 2,
          // Данные чека-основания (ОБЯЗАТЕЛЬНО для возвратов по протоколу ОФД 2.0.3+)
          ...(receiptData.type === 'return' && receiptData.returnBasisDetails ? {
            ReturnBasisDetails: receiptData.returnBasisDetails
          } : {})
        };

        // Защитная проверка для возврата без основания
        if (receiptData.type === 'return' && !ticketReq.ReturnBasisDetails) {
          log.warn('Fiscal return attempted without ReturnBasisDetails! This will fail on protocol 2.0.3+.');
        }

        const checkUrl = `${WEBKASSA_API_URL}/check`;
        log.info(`[WebKassa Request] POST ${checkUrl}`);
        log.info(`[WebKassa Request Body] ${JSON.stringify(ticketReq, null, 2)}`);

        const response = await axios.post(checkUrl, ticketReq, {
          headers: this.getHeaders(),
          timeout: 5000 // Уменьшаем тайм-аут до 5 секунд
        });

        log.info(`[WebKassa Response] Status: ${response.status}`);
        log.info(`[WebKassa Response Body] ${JSON.stringify(response.data, null, 2)}`);

        if (response.data && response.data.Data && response.data.Data.TicketUrl) {
          return {
            success: true,
            ticketUrl: response.data.Data.TicketUrl,
            ticketNumber: response.data.Data.CheckNumber || response.data.Data.TicketNumber,
            ofdDateTime: response.data.Data.DateTime || response.data.Data.DateTimeUTC,
            ofdRegistrationNumber: response.data.Data.Cashbox?.RegistrationNumber
          };
        } else {
          const errMsg = response.data?.Errors?.[0]?.Text || 'Unknown OFD Error';
          const errCode = response.data?.Errors?.[0]?.Code || 0;

          log.error('Webkassa Logic Error:', errMsg);
          // Если это ошибка валидации данных (не лицензия/связь), то повторять бесполезно
          return { success: false, error: errMsg, errorCode: errCode };
        }
      } catch (error: any) {
        if (error.response) {
          log.error(`[WebKassa Response Error] Status: ${error.response.status}`);
          log.error(`[WebKassa Response Error Body] ${JSON.stringify(error.response.data, null, 2)}`);
        } else {
          log.error(`[WebKassa Request Error] ${error.message}`);
        }

        // Если это 400 ошибка или ошибка в теле ответа, не повторяем
        if (error.response && error.response.status === 400) {
          const errMsg = error.response.data?.Errors?.[0]?.Text || 'Validation Error';
          return { success: false, error: errMsg };
        }

        // Проверка на истечение токена (код 2)
        const errCode = error.response?.data?.Errors?.[0]?.Code;
        if (errCode === 2 && attempt < maxAttempts) {
          log.info('Webkassa token expired (Code 2). Re-authorizing...');
          const authOk = await this.authorize();
          if (authOk.success) continue;
        }

      }
    }
    return { success: false, error: 'Maximum retries exceeded' };
  }

  // 5. Внесение / Изъятие
  async cashOperation(type: 'in' | 'out', amount: number, externalId: string): Promise<{ success: boolean; ticketUrl?: string; error?: string }> {
    if (!this.settings || this.settings.ofdProvider === 'none') {
      return { success: false, error: 'OFD Disabled' };
    }

    if (this.settings.ofdProvider === 'mock') {
      return { success: true, ticketUrl: `https://consumer.oofd.kz/ticket/mock-${type}` };
    }

    if (!this.token) {
      const authOk = await this.authorize();
      if (!authOk.success) return { success: false, error: authOk.error };
    }

    let attempt = 0;
    const maxAttempts = 2;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const payload = {
          Token: this.token,
          CashboxUniqueNumber: this.settings.ofdCashboxId,
          OperationType: type === 'in' ? 0 : 1, // 0 - внесение, 1 - изъятие
          Sum: amount,
          ExternalCheckNumber: externalId
        };

        const moneyOpUrl = `${WEBKASSA_API_URL}/MoneyOperation`;
        log.info(`[WebKassa MoneyOperation Request] POST ${moneyOpUrl}`);
        log.info(`[WebKassa MoneyOperation Body] ${JSON.stringify(payload, null, 2)}`);

        const response = await axios.post(moneyOpUrl, payload, {
          headers: this.getHeaders()
        });

        log.info(`[WebKassa MoneyOperation Response] Status: ${response.status}`);
        log.info(`[WebKassa MoneyOperation Response Body] ${JSON.stringify(response.data, null, 2)}`);

        if (response.data && response.data.Data) {
          return { success: true };
        } else {
          throw new Error(response.data?.Errors?.[0]?.Text || 'Unknown OFD Error');
        }
      } catch (error: any) {
        if (error.response) {
          log.error(`[WebKassa MoneyOperation Error Response] Status: ${error.response.status}`);
          log.error(`[WebKassa MoneyOperation Error Body] ${JSON.stringify(error.response.data, null, 2)}`);
        } else {
          log.error(`[WebKassa MoneyOperation Error] ${error.message}`);
        }

        const errCode = error.response?.data?.Errors?.[0]?.Code;
        if (errCode === 2 && attempt < maxAttempts) {
          log.info('Webkassa token expired for MoneyOperation. Re-authorizing...');
          const authOk = await this.authorize();
          if (authOk.success) continue;
        }

        return {
          success: false,
          error: this.mapErrorMessage(error?.response?.data || error)
        };
      }
    }
    return { success: false, error: 'Maximum retries exceeded (MoneyOperation)' };
  }

  // 6. Промежуточный отчет (X-отчет)
  async getXReport(): Promise<{ success: boolean; ticketUrl?: string; error?: string }> {
    if (!this.token) {
      const auth = await this.authorize();
      if (!auth.success) return { success: false, error: auth.error };
    }
    if (this.settings?.ofdProvider === 'mock') return { success: true, ticketUrl: 'https://mock-x-report' };

    try {
      const response = await axios.post(`${WEBKASSA_API_URL}/XReport`, {
        CashboxUniqueNumber: this.settings?.ofdCashboxId,
        Token: this.token
      }, {
        headers: this.getHeaders()
      });

      if (response.data && response.data.Data) {
        return {
          success: true,
          ticketUrl: response.data.Data.TicketUrl
        };
      }
      return { success: false, error: this.mapErrorMessage(response.data) };
    } catch (e: any) {
      log.error('Webkassa XReport Error', e);
      return { success: false, error: this.mapErrorMessage(e.response?.data || e) };
    }
  }

  // Вспомогательный метод для маппинга ошибок Webkassa
  private mapErrorMessage(errorData: any): string {
    const err = errorData?.Errors?.[0];
    if (!err) return errorData?.message || 'Неизвестная ошибка ОФД';

    const code = err.Code;
    const text = err.Text;

    switch (code) {
      case 2:
        return 'Срок действия сессии истек. Пожалуйста, попробуйте еще раз (система обновит токен автоматически).';
      case 10:
        return 'Ошибка лицензии: Касса не имеет активного активационного номера или лицензия отозвана.';
      case 13:
        return 'Смена превысила 24 часа. Необходимо снять Z-отчет для продолжения работы.';
      case 18:
        return 'Превышено время оффлайн режима (72 часа). Необходимо подключение к интернету для синхронизации.';
      default:
        return text || `Ошибка ОФД (Код ${code})`;
    }
  }
}

