import { contextBridge, ipcRenderer } from 'electron'

// Описание API, доступного в браузере (React)
// Callback для событий весов
type WeightCallback = (reading: { weight: number; stable: boolean; error?: string }) => void;
let weightCallback: WeightCallback | null = null;
ipcRenderer.on('scales:weight-update', (_event, reading) => {
  if (weightCallback) weightCallback(reading);
});
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('app-version'),

  appControl: {
    toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
    minimize: () => ipcRenderer.invoke('window:minimize'),
    closeApp: () => ipcRenderer.invoke('window:close'),
  },

  auth: {
    getUsers: (companyId: string) => ipcRenderer.invoke('auth:get-users', companyId),
    login: (userId: string, password: string) => ipcRenderer.invoke('auth:login', userId, password),
    getDefaultCompany: () => ipcRenderer.invoke('auth:get-default-company'),
  },

  users: {
    getAll: (companyId: string) => ipcRenderer.invoke('users:get-all', companyId),
    create: (data: any) => ipcRenderer.invoke('users:create', data),
    update: (data: any) => ipcRenderer.invoke('users:update', data),
    toggleStatus: (companyId: string, id: string, isActive: boolean) => ipcRenderer.invoke('users:toggle-status', companyId, id, isActive),
  },

  clients: {
    getAll: (companyId: string) => ipcRenderer.invoke('clients:get-all', companyId),
    create: (data: any) => ipcRenderer.invoke('clients:create', data),
    update: (data: any) => ipcRenderer.invoke('clients:update', data),
    delete: (companyId: string, id: string) => ipcRenderer.invoke('clients:delete', companyId, id),
  },

  documents: {
    getAll: (companyId: string) => ipcRenderer.invoke('documents:get-all', companyId),
    getReceipts: (companyId: string) => ipcRenderer.invoke('documents:get-receipts', companyId),
    getDetails: (companyId: string, docId: string) => ipcRenderer.invoke('documents:get-details', companyId, docId),
    generate: (data: any) => ipcRenderer.invoke('documents:generate', data),
  },

  pos: {
    searchProduct: (companyId: string, query: string) => ipcRenderer.invoke('pos:search-product', companyId, query),
    processSale: (data: any) => ipcRenderer.invoke('pos:process-sale', data),
    validateMarkCode: (companyId: string, markCode: string) => ipcRenderer.invoke('pos:validate-mark-code', companyId, markCode),
    getReceipts: (companyId: string) => ipcRenderer.invoke('pos:get-receipts', companyId),
    getReceiptDetails: (companyId: string, receiptId: string) => ipcRenderer.invoke('pos:get-receipt-details', companyId, receiptId),
    reprintReceipt: (companyId: string, receiptId: string) => ipcRenderer.invoke('pos:reprint-receipt', companyId, receiptId),
  },

  inventory: {
    getProducts: (companyId: string, search?: string) => ipcRenderer.invoke('inventory:get-products', companyId, search),
    createProduct: (data: any) => ipcRenderer.invoke('inventory:create-product', data),
    updateProduct: (data: any) => ipcRenderer.invoke('inventory:update-product', data),
    deleteProduct: (companyId: string, productId: string) => ipcRenderer.invoke('inventory:delete-product', companyId, productId),
    updateStock: (data: any) => ipcRenderer.invoke('inventory:update-stock', data),
  },

  suppliers: {
    getAll: (companyId: string) => ipcRenderer.invoke('suppliers:get-all', companyId),
    create: (data: any) => ipcRenderer.invoke('suppliers:create', data),
    update: (data: any) => ipcRenderer.invoke('suppliers:update', data),
    delete: (companyId: string, id: string) => ipcRenderer.invoke('suppliers:delete', companyId, id),
  },

  purchases: {
    getAll: (companyId: string) => ipcRenderer.invoke('purchases:get-all', companyId),
    getOne: (companyId: string, id: string) => ipcRenderer.invoke('purchases:get-one', companyId, id),
    create: (data: any) => ipcRenderer.invoke('purchases:create', data),
    complete: (companyId: string, id: string) => ipcRenderer.invoke('purchases:complete', companyId, id),
    delete: (companyId: string, id: string) => ipcRenderer.invoke('purchases:delete', companyId, id),
  },

  returns: {
    searchReceipt: (companyId: string, receiptNumber: number) => ipcRenderer.invoke('returns:search-receipt', companyId, receiptNumber),
    process: (data: any) => ipcRenderer.invoke('returns:process', data),
  },

  shifts: {
    getCurrent: (companyId: string, userId: string) => ipcRenderer.invoke('shifts:get-current', companyId, userId),
    open: (companyId: string, userId: string, startCash: number) => ipcRenderer.invoke('shifts:open', companyId, userId, startCash),
    close: (companyId: string, shiftId: string) => ipcRenderer.invoke('shifts:close', companyId, shiftId),
    cashOperation: (companyId: string, shiftId: string, type: 'in' | 'out', amount: number) => ipcRenderer.invoke('shifts:cash-operation', companyId, shiftId, type, amount),
    getHistory: (companyId: string) => ipcRenderer.invoke('shifts:get-history', companyId),
  },

  analytics: {
    getStats: (companyId: string, startDate?: string, endDate?: string) => ipcRenderer.invoke('analytics:get-stats', companyId, startDate, endDate),
  },

  settings: {
    get: (companyId: string) => ipcRenderer.invoke('settings:get', companyId),
    save: (data: any) => ipcRenderer.invoke('settings:save', data),
  },

  reports: {
    xReport: (companyId: string, shiftId: string) => ipcRenderer.invoke('reports:x-report', companyId, shiftId),
    zReport: (companyId: string, shiftId: string) => ipcRenderer.invoke('reports:z-report', companyId, shiftId),
    printQueueCount: (companyId: string) => ipcRenderer.invoke('reports:print-queue-count', companyId),
    retryPrint: (companyId: string) => ipcRenderer.invoke('reports:retry-print', companyId),
    testWebkassa: (companyId: string) => ipcRenderer.invoke('reports:test-webkassa', companyId),
  },

  backup: {
    create: () => ipcRenderer.invoke('backup:create'),
    restore: () => ipcRenderer.invoke('backup:restore'),
    list: () => ipcRenderer.invoke('backup:list'),
    chooseDir: () => ipcRenderer.invoke('backup:choose-dir'),
    getDir: () => ipcRenderer.invoke('backup:get-dir'),
    getAuto: () => ipcRenderer.invoke('backup:get-auto'),
    setAuto: (enabled: boolean) => ipcRenderer.invoke('backup:set-auto', enabled),
  },

  network: {
    status: () => ipcRenderer.invoke('network:status'),
    startServer: () => ipcRenderer.invoke('network:start-server'),
    stopServer: () => ipcRenderer.invoke('network:stop-server'),
    connect: (serverIP: string) => ipcRenderer.invoke('network:connect', serverIP),
    disconnect: () => ipcRenderer.invoke('network:disconnect'),
    test: (serverIP?: string) => ipcRenderer.invoke('network:test', serverIP),
  },

  license: {
    getHWID: () => ipcRenderer.invoke('license:get-hwid'),
    check: () => ipcRenderer.invoke('license:check'),
    activate: (key: string) => ipcRenderer.invoke('license:activate', key),
  },

  terminals: {
    getAll: (companyId: string) => ipcRenderer.invoke('terminals:get-all', companyId),
    create: (data: any) => ipcRenderer.invoke('terminals:create', data),
    delete: (companyId: string, id: string) => ipcRenderer.invoke('terminals:delete', companyId, id),
    ping: (companyId: string, id: string) => ipcRenderer.invoke('terminals:ping', companyId, id),
    purchase: (companyId: string, id: string, amount: number) => ipcRenderer.invoke('terminals:purchase', companyId, id, amount),
    cancel: (companyId: string, id: string) => ipcRenderer.invoke('terminals:cancel', companyId, id),
  },

  scales: {
    getSettings: (companyId: string) => ipcRenderer.invoke('scales:get-settings', companyId),
    saveSettings: (data: any) => ipcRenderer.invoke('scales:save-settings', data),
    test: (companyId: string) => ipcRenderer.invoke('scales:test', companyId),
    startStream: (companyId: string) => ipcRenderer.invoke('scales:start-stream', companyId),
    stopStream: () => ipcRenderer.invoke('scales:stop-stream'),
    onWeightUpdate: (callback: WeightCallback) => { weightCallback = callback; },
    offWeightUpdate: () => { weightCallback = null; },
  },

  revisions: {
    getAll: (companyId: string) => ipcRenderer.invoke('revisions:get-all', companyId),
    getOne: (companyId: string, id: string) => ipcRenderer.invoke('revisions:get-one', companyId, id),
    create: (data: any) => ipcRenderer.invoke('revisions:create', data),
    updateItem: (data: any) => ipcRenderer.invoke('revisions:update-item', data),
    complete: (companyId: string, id: string) => ipcRenderer.invoke('revisions:complete', companyId, id),
  },

  nkt: {
    search: (query: string) => ipcRenderer.invoke('nkt:search', query),
  },

  // Второй экран для покупателя
  customerDisplay: {
    setMode: (mode: string, data: any) => ipcRenderer.invoke('customer-display:setMode', mode, data),
  },

  printRevisionAct: (data: any) => ipcRenderer.invoke('print-revision-act', data),
  cancelRevision: (id: string) => ipcRenderer.invoke('cancel-revision', id),
  resetPrinter: () => ipcRenderer.invoke('reset-printer'),
  printLabel: (imageData: string) => ipcRenderer.invoke('print-label', imageData),

  // Слушатель для окна покупателя (получает команды от main)
  onCustomerDisplayMode: (callback: (payload: any) => void) => {
    ipcRenderer.on('customer-display:mode-changed', (_event, payload) => callback(payload));
  },

  // ───── Автообновление ─────
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onChecking: (cb: () => void) => { ipcRenderer.on('updater:checking', cb); },
    onAvailable: (cb: (data: any) => void) => { ipcRenderer.on('updater:available', (_e, data) => cb(data)); },
    onNotAvailable: (cb: () => void) => { ipcRenderer.on('updater:not-available', cb); },
    onProgress: (cb: (data: any) => void) => { ipcRenderer.on('updater:download-progress', (_e, data) => cb(data)); },
    onDownloaded: (cb: (data: any) => void) => { ipcRenderer.on('updater:downloaded', (_e, data) => cb(data)); },
    onError: (cb: (data: any) => void) => { ipcRenderer.on('updater:error', (_e, data) => cb(data)); },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('updater:checking');
      ipcRenderer.removeAllListeners('updater:available');
      ipcRenderer.removeAllListeners('updater:not-available');
      ipcRenderer.removeAllListeners('updater:download-progress');
      ipcRenderer.removeAllListeners('updater:downloaded');
      ipcRenderer.removeAllListeners('updater:error');
    },
  },

})
