import { registerRpc } from '../services/rpc';
import { ipcMain } from 'electron';
import { mainWindow } from '../main';
import log from 'electron-log';

// Официальная документация API: https://nationalcatalog.kz/gwp/docs
// Аутентификация: X-API-KEY заголовок
// Поиск по штрихкоду: GET /gwp/portal/api/v2/products/{gtin_or_ntin}
// Текстовый поиск по названию в публичном API ОТСУТСТВУЕТ

const NKT_BASE = 'https://nationalcatalog.kz/gwp/portal/api';

// Ключ из .env файла, с запасным значением
const NKT_KEY = process.env.NKT_API_KEY || 'IvhWQMA3-_qJqi0GIE_IESPmC_yW9GRp969jjqTcmEg';

export function setupNktHandlers() {

  registerRpc('nkt:search', async (_event, query: string) => {
    try {
      if (!query || query.trim().length < 2) {
        return { success: true, data: [] };
      }

      const q = query.trim();
      const isBarcode = /^\d{8,14}$/.test(q);

      let url = '';
      if (isBarcode) {
        url = `${NKT_BASE}/v2/products/${encodeURIComponent(q)}`;
      } else {
        // Пробуем эндпоинт по инструкции пользователя:
        url = `https://nationalcatalog.kz/gwp/api/v1/product/list?name=${encodeURIComponent(q)}&page=0&size=20`;
      }

      console.log('НКТ ищет:', query);
      console.log('НКТ URL:', url);
      log.info('НКТ запрос:', url);

      // Используем API ключ из .env или встроенный запасной
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'User-Agent': 'EasyKassa/1.0',
        'X-API-KEY': NKT_KEY,
      };

      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      log.info('НКТ статус:', response.status);

      if (response.status === 401) {
        return {
          success: false,
          error: 'НКТ требует API ключ. Зарегистрируйтесь на nationalcatalog.kz и добавьте API ключ в настройки.',
        };
      }

      if (response.status === 404) {
        // Товар не найден — это нормально, возвращаем пустой список
        return { success: true, data: [] };
      }

      if (!response.ok) {
        log.warn(`НКТ вернул ошибку ${response.status}`);
        return { success: false, error: `Ошибка сервера НКТ: ${response.status}` };
      }

      const data: any = await response.json();

      // ДОБАВЛЕНО ДЛЯ ОТЛАДКИ (ПО ПРОСЬБЕ ПОЛЬЗОВАТЕЛЯ)
      console.log('НКТ полный ответ:', JSON.stringify(data, null, 2).slice(0, 1000));
      log.info('НКТ полный ответ:', JSON.stringify(data).slice(0, 500));

      // Пытаемся найти массив товаров в разных возможных полях ответа
      const itemsRaw =
        data.result?.products ??
        data.items ??
        data.products ??
        data.content ??
        data.data ??
        (Array.isArray(data) ? data : [data].filter(Boolean));

      const items: any[] = Array.isArray(itemsRaw) ? itemsRaw : [];

      const normalized = items.map((p: any) => ({
        id: p.id || p.ntin || p.gtin || '',
        gtin: p.gtin || '',
        ntin: p.ntin || '',
        name: p.nameRu || p.shortNameRu || p.nameKk || p.name || '',
        manufacturer: p.manufacturer || '',
        unit: 'шт',
        image: null,
        category: p.categoryAncestors
          ? p.categoryAncestors[p.categoryAncestors.length - 1]?.nameRu || ''
          : p.category || '',
      }));


      return { success: true, data: normalized };
    } catch (error: any) {
      log.error('НКТ недоступен:', error.message);
      return { success: false, error: `НКТ недоступен: ${error.message}` };
    }
  });
}
