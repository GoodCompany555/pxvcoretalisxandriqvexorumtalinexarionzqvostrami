import { app, BrowserWindow, ipcMain, screen, Menu, net } from 'electron'
import * as path from 'path'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import Store from 'electron-store'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import { machineIdSync } from 'node-machine-id'
import crypto from 'crypto'
import { spawn } from 'child_process'
import https from 'https'
import os from 'os'

// Генерируем надежный ключ из ID железа
const hwid = machineIdSync()
const SECURE_KEY = crypto.createHash('sha256').update(String(hwid) + '_easykassa_v1').digest('base64').substring(0, 32)
const IV_LENGTH = 16

export const store = new Store({
  encryptionKey: SECURE_KEY
})

export function encryptData(text: string): string {
  if (!text) return text
  try {
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(SECURE_KEY, 'utf-8'), iv)
    let encrypted = cipher.update(text)
    encrypted = Buffer.concat([encrypted, cipher.final()])
    return iv.toString('hex') + ':' + encrypted.toString('hex')
  } catch (e) {
    return text
  }
}

export function decryptData(text: string): string {
  if (!text) return text
  if (!text.includes(':')) return text // Совместимость со старыми открытыми данными
  try {
    const textParts = text.split(':')
    const iv = Buffer.from(textParts.shift()!, 'hex')
    const encryptedText = Buffer.from(textParts.join(':'), 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(SECURE_KEY, 'utf-8'), iv)
    let decrypted = decipher.update(encryptedText)
    decrypted = Buffer.concat([decrypted, decipher.final()])
    return decrypted.toString()
  } catch (e) {
    console.error('Decryption failed, returning empty');
    return '' // fail safe
  }
}

// Загружаем .env файл с API ключами
const envPath = path.join(process.cwd(), '.env')
if (fs.existsSync(envPath)) dotenv.config({ path: envPath })
import { initDatabase, closeDatabase } from './database'
import { setupAuthHandlers } from './api/auth'
import { setupPosHandlers } from './api/pos'
import { setupInventoryHandlers } from './api/inventory'
import { setupPurchasesHandlers } from './api/purchases'
import { setupReturnsHandlers } from './api/returns'
import { setupShiftHandlers } from './api/shifts'
import { setupAnalyticsHandlers } from './api/analytics'
import { setupSettingsHandlers } from './api/settings'
import { setupLicenseHandlers } from './api/license'
import { setupUsersHandlers } from './api/users'
import { setupClientsHandlers } from './api/clients'
import { setupDocumentsHandlers } from './api/documents'
import { setupTerminalsHandlers } from './api/terminals'
import { setupScalesHandlers } from './api/scales'
import { setupReportsHandlers } from './api/reports'
import { setupRevisionsHandlers } from './api/revisions'
import { setupResortingsHandlers } from './api/resortings'
import { setupNktHandlers } from './api/nkt'
import { setupBackupHandlers } from './api/backup'
import { setupWarehousesHandlers } from './api/warehouses'
import { setupTransfersHandlers } from './api/transfers'
import { startAutoBackupScheduler } from './api/backup'
import { setupNetworkHandlers, restoreNetworkMode } from './api/network'
import { startOfflineQueueProcessor, stopOfflineQueueProcessor } from './services/offlineQueue'

// Настройка путей для Vite и билда
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

export let mainWindow: BrowserWindow | null = null;
let customerDisplay: BrowserWindow | null = null;

// Функции безопасности
function applySecurityRestrictions(webContents: Electron.WebContents) {
  // Блокируем контекстное меню и инструменты разработчика
  webContents.on('context-menu', (e) => {
    if (app.isPackaged) e.preventDefault();
  });

  // Блокируем шорткаты DevTools (Ctrl+Shift+I, F12 и т.д.)
  webContents.on('before-input-event', (event, input) => {
    if (app.isPackaged) {
      if (
        (input.control && input.shift && input.key.toLowerCase() === 'i') ||
        (input.control && input.shift && input.key.toLowerCase() === 'j') ||
        (input.control && input.shift && input.key.toLowerCase() === 'c') ||
        input.key === 'F12'
      ) {
        event.preventDefault();
      }
    }
  });
}

function createWindow() {
  // Иконка окна и ярлыка
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'logo.ico')
    : path.join(__dirname, '../src/assets/logo.ico')

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    fullscreen: true,
    frame: false,
    title: 'EasyKassa',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    show: false,
  })

  mainWindow.maximize()
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Корректное закрытие: освобождаем ресурсы и убиваем все процессы
  mainWindow.on('close', () => {
    // Закрываем второй экран
    if (customerDisplay && !customerDisplay.isDestroyed()) {
      customerDisplay.destroy()
      customerDisplay = null
    }
    // Закрываем БД и очередь
    try { closeDatabase() } catch { }
    try { stopOfflineQueueProcessor() } catch { }
    // Принудительный выход всех процессов
    app.exit(0)
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    // mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Возвращаем фокус после загрузки
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.focus()
  })

  // Перехватываем открытие новых окон (например, ссылок target="_blank" на чеки Webkassa)
  // и устанавливаем наш логотип вместо стандартного логотипа Electron
  mainWindow.webContents.setWindowOpenHandler(() => {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        icon: iconPath,
        autoHideMenuBar: true
      }
    };
  });

  // Применяем блокировки безопасности DevTools и шорткатов
  applySecurityRestrictions(mainWindow.webContents)


  mainWindow.setAlwaysOnTop(false)

  // Запрети окну терять фокус после диалогов и операций
  mainWindow.on('blur', () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus()
        mainWindow.webContents.focus()
      }
    }, 100)
  })

  // focus event removed to prevent window background flashing
}

// Отключаем тачскрин чтобы Windows не открывал экранную клавиатуру при фокусе на поле ввода
app.commandLine.appendSwitch('disable-features', 'TouchEvents,TouchEventFeatureDetection')

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  initDatabase()
  setupAuthHandlers()
  setupPosHandlers()
  setupInventoryHandlers()
  setupPurchasesHandlers()
  setupReturnsHandlers()
  setupShiftHandlers()
  setupAnalyticsHandlers()
  setupSettingsHandlers()
  setupLicenseHandlers()
  setupUsersHandlers()
  setupClientsHandlers()
  setupDocumentsHandlers()
  setupTerminalsHandlers()
  setupScalesHandlers()
  setupReportsHandlers()
  setupRevisionsHandlers()
  setupResortingsHandlers()
  setupNktHandlers()
  setupBackupHandlers()
  setupWarehousesHandlers()
  setupTransfersHandlers()
  setupNetworkHandlers()
  startAutoBackupScheduler()
  restoreNetworkMode()
  startOfflineQueueProcessor()

  // ───── Автообновление ─────
  setupAutoUpdater()

  // --- Printing Hooks (User Requested) ---
  ipcMain.handle('reset-printer', async () => {
    try {
      // Имитация сброса буфера для текущего драйвера
      const ESC = 0x1B;
      const initCommand = Buffer.from([ESC, 0x40]);
      await new Promise(resolve => setTimeout(resolve, 200));
      return { success: true };
    } catch (error) {
      console.error('Ошибка сброса принтера:', error);
      return { success: false };
    }
  });

  function buildLabelHTML(data: any): string {
    const {
      companyName = 'МАГАЗИН',
      productName = '',
      productNameKz = '',
      unit = 'шт',
      price = 0,
      barcode = '',
    } = data

    // Генерируем штрихкод через bwip-js (без интернета):
    let barcodeBase64 = ''
    try {
      const bwipjs = require('bwip-js')
      const buf = bwipjs.toBufferSync({
        bcid: barcode.length === 8 ? 'ean8' : 'ean13',
        text: barcode,
        scale: 3,
        height: 14,
        includetext: true,
        textxalign: 'center',
        textsize: 11,
        backgroundcolor: 'ffffff',
        barcolor: '000000',
      })
      barcodeBase64 = buf.toString('base64')
    } catch (e: any) {
      console.error('bwip-js ошибка:', e.message)
    }

    const formattedPrice = Number(price).toLocaleString('ru-RU')

    return `<!DOCTYPE html>
  <html>
  <head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 58mm;
      background: #fff;
      font-family: Arial, sans-serif;
      color: #000;
    }
    .label {
      width: 58mm;
      min-height: 40mm;
      padding: 2mm 3mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .company {
      font-size: 9pt;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 1mm;
    }
    .divider {
      width: 100%;
      border-top: 0.5mm solid #000;
      margin: 1mm 0;
    }
    .product-name {
      font-size: 13pt;
      font-weight: bold;
      margin-bottom: 0.5mm;
    }
    .product-name-kz {
      font-size: 11pt;
      font-style: italic;
      color: #333;
      margin-bottom: 0.5mm;
    }
    .unit {
      font-size: 10pt;
      margin-bottom: 2mm;
    }
    .price {
      font-size: 26pt;
      font-weight: bold;
      margin-bottom: 2mm;
    }
    .price span {
      font-size: 18pt;
    }
    .barcode-img {
      width: 90%;
      max-width: 52mm;
      display: block;
      margin: 0 auto;
    }
    @media print {
      @page {
        size: 58mm 60mm;
        margin: 0;
      }
    }
  </style>
  </head>
  <body>
  <div class="label">
    <div class="company">${companyName}</div>
    <div class="divider"></div>
    <div class="product-name">${productName}</div>
    ${productNameKz ? `<div class="product-name-kz">${productNameKz}</div>` : ''}
    <div class="unit">${unit}</div>
    <div class="price">${formattedPrice} <span>₸</span></div>
    ${barcodeBase64
        ? `<img class="barcode-img" src="data:image/png;base64,${barcodeBase64}" />`
        : `<div style="font-size:9pt;font-family:monospace;">${barcode}</div>`
      }
  </div>
  </body>
  </html>`
  }

  ipcMain.handle('print-label', async (_, labelData: any) => {
    try {
      const bwipjs = require('bwip-js')
      const test = bwipjs.toBufferSync({ bcid: 'ean13', text: '4607061250038', scale: 1, height: 5 })
      console.log('bwip-js работает, размер:', test.length)
    } catch (e: any) {
      console.error('bwip-js НЕ РАБОТАЕТ:', e.message)
    }

    try {
      console.log('Печать этикетки:', labelData)

      if (!labelData.barcode) {
        return { success: false, message: 'Штрихкод не указан' }
      }

      const html = buildLabelHTML(labelData);

      const labelWin = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      })

      await labelWin.webContents.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
      )

      // Ждём рендеринга штрихкода:
      await new Promise(resolve => setTimeout(resolve, 800))

      const labelPrinterName = store.get('labelPrinter') as string | undefined

      await new Promise<void>((resolve, reject) => {
        labelWin.webContents.print(
          {
            silent: true,
            printBackground: true,
            deviceName: labelPrinterName || '',
            pageSize: { width: 58000, height: 60000 },
            margins: { marginType: 'none' },
          },
          (success, errorType) => {
            labelWin.destroy()
            if (success) resolve()
            else reject(new Error(errorType ?? 'Ошибка печати'))
          }
        )
      })

      return { success: true }

    } catch (error: any) {
      console.error('Ошибка печати этикетки:', error)
      return { success: false, message: error.message }
    }
  })

  createWindow()

  // Создать экран покупателя на втором мониторе (если он есть)
  createCustomerDisplay()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  // После любого IPC вызова — возвращаем фокус:
  // Removed browser-window-focus to prevent focus stealing

  // Слушаем изменения мониторов (если пользователь переключил "Дублировать" -> "Расширить")
  screen.on('display-added', () => {
    if (!customerDisplay) createCustomerDisplay()
  })
  screen.on('display-metrics-changed', () => {
    if (!customerDisplay) createCustomerDisplay()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  // Закрываем второй экран
  if (customerDisplay && !customerDisplay.isDestroyed()) {
    customerDisplay.destroy()
    customerDisplay = null
  }
  // Закрываем БД
  try { closeDatabase() } catch { }
  // Останавливаем офлайн очередь
  try { stopOfflineQueueProcessor() } catch { }
  // Страховка: если через 3 сек процессы всё ещё живы — убиваем принудительно
  setTimeout(() => process.exit(0), 3000)
})

// Базовые IPC обработчики
ipcMain.handle('app-version', () => app.getVersion())

ipcMain.handle("download-and-install", async (_event, url: string) => {
  const tmpPath = path.join(os.tmpdir(), "pos_update.exe");

  await new Promise<void>((resolve, reject) => {
    const request = net.request(url);
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        reject(new Error('Failed to download: ' + response.statusCode));
        return;
      }
      const file = fs.createWriteStream(tmpPath);
      response.on('data', (chunk) => file.write(chunk));
      response.on('end', () => {
        file.end();
        resolve();
      });
      response.on('error', (err) => {
        file.close();
        reject(err);
      });
    });
    request.on('error', reject);
    request.end();
  });

  // Запускаем установщик и выходим
  spawn(tmpPath, [], { detached: true, stdio: 'ignore' }).unref();
  app.quit();
});

ipcMain.handle('window:toggle-fullscreen', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const isFull = mainWindow.isFullScreen();
    mainWindow.setFullScreen(!isFull);
    return !isFull;
  }
  return false;
})

ipcMain.handle('window:close', () => {
  app.quit();
})

ipcMain.handle('window:minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
})

// ═══ Customer Display (Второй экран для покупателя) ═══

function createCustomerDisplay() {
  if (customerDisplay && !customerDisplay.isDestroyed()) return;

  const displays = screen.getAllDisplays()
  // Только при наличии второго монитора
  if (displays.length < 2) {
    console.log('Второй монитор не обнаружен, экран покупателя не создан')
    return
  }

  const secondDisplay = displays[1]
  console.log(`Создаю экран покупателя на мониторе: ${secondDisplay.label || 'Display 2'} (${secondDisplay.bounds.width}x${secondDisplay.bounds.height})`)

  customerDisplay = new BrowserWindow({
    x: secondDisplay.bounds.x,
    y: secondDisplay.bounds.y,
    width: secondDisplay.bounds.width,
    height: secondDisplay.bounds.height,
    show: false,            // Скрываем до загрузки
    fullscreen: true,       // Настоящий полноэкранный режим
    kiosk: true,            // Киоск отключает все системные меню Windows
    frame: false,           // Убирает рамки
    skipTaskbar: true,      // Не показывать в панели задач
    alwaysOnTop: true,      // Поверх других окон
    title: 'EasyKassa — Покупатель',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Принудительно устанавливаем самый высокий приоритет над панелью задач
  customerDisplay.setAlwaysOnTop(true, 'screen-saver')

  if (VITE_DEV_SERVER_URL) {
    customerDisplay.loadURL(VITE_DEV_SERVER_URL + '#/customer-display')
  } else {
    customerDisplay.loadFile(path.join(__dirname, '../dist/index.html'), {
      hash: '/customer-display'
    })
  }

  // Показываем окно без захвата фокуса (чтобы кассир мог сразу печатать в главном окне)
  customerDisplay.once('ready-to-show', () => {
    customerDisplay.showInactive()
  })

  // Применяем блокировки безопасности DevTools и шорткатов
  applySecurityRestrictions(customerDisplay.webContents)


  customerDisplay.on('closed', () => {
    customerDisplay = null
  })
}

// IPC: Кассир меняет режим экрана покупателя
ipcMain.handle('customer-display:setMode', (_event, mode: string, data: any) => {
  if (customerDisplay && !customerDisplay.isDestroyed()) {
    customerDisplay.webContents.send('customer-display:mode-changed', { mode, data })
    return { success: true }
  }
  return { success: false, error: 'Экран покупателя не подключён' }
})

// Удалил старый refocus-window IPC, фокус теперь возвращается внутри обработчиков

// ═══════════════════════════════════════════════════════════════
// ───── Автоматическое обновление через GitHub Releases ─────
// ═══════════════════════════════════════════════════════════════

function setupAutoUpdater() {
  // Настраиваем логирование
  autoUpdater.logger = log
  // @ts-ignore
  autoUpdater.logger.transports.file.level = 'debug'
  log.info('[AutoUpdater] Приложение запускается...')

  // Не проверяем обновления в dev-режиме
  if (!app.isPackaged) {
    console.log('[AutoUpdater] Пропуск — приложение запущено в dev-режиме')
    return
  }

  // Настройки autoUpdater
  autoUpdater.autoDownload = false        // Не скачиваем автоматически — ждём решения пользователя
  autoUpdater.autoInstallOnAppQuit = true  // Если скачано — установить при закрытии
  autoUpdater.allowDowngrade = false       // Не откатываемся на старую версию
  autoUpdater.allowPrerelease = true      // Разрешить пре-релизы (для тестов)

  // ───── События autoUpdater → renderer ─────

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Проверка обновлений...')
    sendUpdateEvent('updater:checking')
  })

  autoUpdater.on('update-available', (info) => {
    console.log(`[AutoUpdater] Найдено обновление: v${info.version}`)
    sendUpdateEvent('updater:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    })
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] Обновлений нет, текущая версия актуальна')
    sendUpdateEvent('updater:not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[AutoUpdater] Загрузка: ${Math.round(progress.percent)}%`)
    sendUpdateEvent('updater:download-progress', {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[AutoUpdater] Обновление v${info.version} скачано и готово к установке`)
    sendUpdateEvent('updater:downloaded', {
      version: info.version,
    })
  })

  autoUpdater.on('error', (error) => {
    const errorMsg = error.message || '';
    console.error('[AutoUpdater] Ошибка:', errorMsg)
    
    // Игнорируем типичные ошибки "пустого" репозитория, чтобы не пугать пользователя
    if (errorMsg.includes('Unable to find latest version') || errorMsg.includes('404')) {
      console.log('[AutoUpdater] Обновления пока не опубликованы на GitHub');
      return;
    }
    
    sendUpdateEvent('updater:error', { message: errorMsg })
  })

  // ───── IPC: команды из renderer ─────

  // Пользователь нажал «Скачать обновление»
  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Пользователь нажал «Установить и перезапустить»
  ipcMain.handle('updater:install', async () => {
    try {
      // Создаём резервную копию БД перед установкой
      await createBackupBeforeUpdate()
      // Устанавливаем обновление и перезапускаем приложение
      autoUpdater.quitAndInstall(false, true)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Ручная проверка обновлений
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return { success: true, version: result?.updateInfo?.version }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ───── Автоматическая проверка ─────

  // Первая проверка через 2 секунды после запуска
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[AutoUpdater] Ошибка первой проверки:', err.message)
    })
  }, 2_000)

  // Повторная проверка каждые 4 часа
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[AutoUpdater] Ошибка периодической проверки:', err.message)
    })
  }, 4 * 60 * 60 * 1000)
}

/** Отправить событие обновления в renderer */
function sendUpdateEvent(channel: string, data?: any) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data)
  }
}

/** Резервная копия БД перед установкой обновления */
async function createBackupBeforeUpdate() {
  try {
    const userDataPath = app.getPath('userData')
    const dbPath = path.join(userDataPath, 'easykassa.db')
    if (fs.existsSync(dbPath)) {
      const backupDir = path.join(userDataPath, 'backups')
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupPath = path.join(backupDir, `pre-update-${timestamp}.db`)
      fs.copyFileSync(dbPath, backupPath)
      console.log(`[AutoUpdater] Резервная копия БД создана: ${backupPath}`)
    }
  } catch (error) {
    console.error('[AutoUpdater] Ошибка создания резервной копии:', error)
    // Не блокируем обновление из-за ошибки бэкапа
  }
}
