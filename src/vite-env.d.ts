/// <reference types="vite/client" />

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: 'admin' | 'manager' | 'cashier' | 'accountant';
  company_id: string;
  permissions?: Record<string, boolean>;
}

export interface Company {
  id: string;
  name: string;
  bin?: string;
  address?: string;
}

export interface AuthAPI {
  getUsers: (companyId: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  login: (userId: string, password: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  getDefaultCompany: () => Promise<{ success: boolean; data?: any; error?: string }>;
  checkSetup: () => Promise<{ success: boolean; data?: { isSetupComplete: boolean }; error?: string }>;
  completeSetup: (data: any) => Promise<{ success: boolean; data?: { recoveryKey: string }; error?: string }>;
  verifyRecoveryKey: (key: string) => Promise<{ success: boolean; error?: string }>;
  resetAdminPassword: (key: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

export interface UsersAPI {
  getAll: (companyId: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  create: (data: any) => Promise<{ success: boolean; data?: any; error?: string }>;
  update: (data: any) => Promise<{ success: boolean; error?: string }>;
  toggleStatus: (companyId: string, id: string, isActive: boolean) => Promise<{ success: boolean; error?: string }>;
}

export interface ClientsAPI {
  getAll: (companyId: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  create: (data: any) => Promise<{ success: boolean; data?: any; error?: string }>;
  update: (data: any) => Promise<{ success: boolean; error?: string }>;
  delete: (companyId: string, id: string) => Promise<{ success: boolean; error?: string }>;
}

export interface DocumentsAPI {
  getAll: (companyId: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  getReceipts: (companyId: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  getDetails: (companyId: string, docId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  generate: (data: any) => Promise<{ success: boolean; data?: any; error?: string }>;
}

export interface PosAPI {
  searchProduct: (companyId: string, query: string) => Promise<{ success: boolean; data?: any; type?: 'list' | 'exact'; error?: string }>;
  processSale: (data: any) => Promise<{ success: boolean; data?: { receiptId: string, ofdStatus?: string, ofdTicketUrl?: string, ofdError?: string, printData?: any }; error?: string }>;
  getReceipts: (companyId: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  getReceiptDetails: (companyId: string, receiptId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  reprintReceipt: (companyId: string, receiptId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  deferReceipt: (companyId: string, name: string, cartData: any[]) => Promise<{ success: boolean; error?: string }>;
  getDeferred: (companyId: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  deleteDeferred: (id: string) => Promise<{ success: boolean; error?: string }>;
}

export interface InventoryAPI {
  getProducts: (companyId: string, search?: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  createProduct: (data: any) => Promise<{ success: boolean; data?: { id: string }; error?: string }>;
  updateProduct: (data: any) => Promise<{ success: boolean; error?: string }>;
  deleteProduct: (companyId: string, productId: string) => Promise<{ success: boolean; error?: string }>;
  updateStock: (data: any) => Promise<{ success: boolean; error?: string }>;
  getCategories: (companyId: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
}

export interface SuppliersAPI {
  getAll: (companyId: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  create: (data: any) => Promise<{ success: boolean; data?: { id: string }; error?: string }>;
  update: (data: any) => Promise<{ success: boolean; error?: string }>;
  delete: (companyId: string, id: string) => Promise<{ success: boolean; error?: string }>;
}

export interface PurchasesAPI {
  getAll: (companyId: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  getOne: (companyId: string, id: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  create: (data: any) => Promise<{ success: boolean; data?: { id: string }; error?: string }>;
  complete: (companyId: string, id: string) => Promise<{ success: boolean; error?: string }>;
  delete: (companyId: string, id: string) => Promise<{ success: boolean; error?: string }>;
}

export interface ReturnsAPI {
  searchReceipt: (companyId: string, receiptNumber: number) => Promise<{ success: boolean; data?: any; error?: string }>;
  process: (data: any) => Promise<{ success: boolean; data?: { receiptId: string, ofdStatus?: string, ofdTicketUrl?: string, printData?: any }; error?: string }>;
}

export interface ShiftsAPI {
  getCurrent: (companyId: string, userId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  open: (companyId: string, userId: string, startCash: number) => Promise<{ success: boolean; data?: { id: string }; error?: string }>;
  close: (companyId: string, shiftId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  cashOperation: (companyId: string, shiftId: string, type: 'in' | 'out', amount: number) => Promise<{ success: boolean; error?: string }>;
  getHistory: (companyId: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
}

export interface AnalyticsAPI {
  getStats: (companyId: string, startDate?: string, endDate?: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  grossProfit: (companyId: string, startDate?: string, endDate?: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  taxRegister: (companyId: string, startDate?: string, endDate?: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  valuationReport: (companyId: string, filter?: any) => Promise<{ success: boolean; data?: any; error?: string }>;
}

export interface SettingsAPI {
  get: (companyId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  save: (data: any) => Promise<{ success: boolean; error?: string }>;
}

export interface LicenseAPI {
  getHWID: () => Promise<string>;
  check: () => Promise<{ valid: boolean; reason?: string }>;
  activate: (key: string) => Promise<{ success: boolean; message?: string }>;
}

export interface TerminalsAPI {
  getAll: (companyId: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  create: (data: any) => Promise<{ success: boolean; data?: { id: string }; error?: string }>;
  delete: (companyId: string, id: string) => Promise<{ success: boolean; error?: string }>;
  ping: (companyId: string, id: string) => Promise<{ success: boolean; data?: { online: boolean }; error?: string }>;
  purchase: (companyId: string, id: string, amount: number) => Promise<{ success: boolean; data?: any; error?: string }>;
  cancel: (companyId: string, id: string) => Promise<{ success: boolean }>;
}

export interface ScalesAPI {
  getSettings: (companyId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  saveSettings: (data: any) => Promise<{ success: boolean; error?: string }>;
  test: (companyId: string) => Promise<{ success: boolean; data?: { connected: boolean }; error?: string }>;
  diagnose: (companyId: string) => Promise<{ success: boolean; data?: { lines: string[] }; error?: string }>;
  getStatus: (companyId: string) => Promise<{ success: boolean; data?: { connected: boolean; weight: number; stable: boolean }; error?: string }>;
  startStream: (companyId: string) => Promise<{ success: boolean; error?: string }>;
  stopStream: () => Promise<{ success: boolean }>;
  onWeightUpdate: (callback: (reading: { weight: number; stable: boolean; error?: string }) => void) => void;
  offWeightUpdate: () => void;
  onStatusUpdate: (callback: (data: { connected: boolean }) => void) => void;
}

export interface ReportsAPIExt {
  xReport: (companyId: string, shiftId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  zReport: (companyId: string, shiftId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  printQueueCount: (companyId: string) => Promise<{ success: boolean; data?: { count: number } }>;
  retryPrint: (companyId: string) => Promise<{ success: boolean; data?: { printed: number }; error?: string }>;
  testWebkassa: (companyId: string) => Promise<{ success: boolean; data?: { connected: boolean }; error?: string }>;
}

export interface AppElectronAPI {
  getAppVersion: () => Promise<string>;
  appControl: {
    toggleFullscreen: () => Promise<boolean>;
    closeApp: () => Promise<void>;
  };
  auth: AuthAPI;
  pos: PosAPI;
  inventory: InventoryAPI;
  suppliers: SuppliersAPI;
  purchases: PurchasesAPI;
  returns: ReturnsAPI;
  shifts: ShiftsAPI;
  analytics: AnalyticsAPI;
  settings: SettingsAPI;
  license: LicenseAPI;
  users: UsersAPI;
  clients: ClientsAPI;
  documents: DocumentsAPI;
  terminals: TerminalsAPI;
  scales: ScalesAPI;
  warehouses: {
    getAll: (companyId: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    create: (data: any) => Promise<{ success: boolean; data?: { id: string }; error?: string }>;
  };
  transfers: {
    getAll: (companyId: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    getOne: (companyId: string, id: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    create: (data: any) => Promise<{ success: boolean; data?: { id: string }; error?: string }>;
    execute: (companyId: string, id: string) => Promise<{ success: boolean; error?: string }>;
    cancel: (companyId: string, id: string) => Promise<{ success: boolean; error?: string }>;
    getProductHistory: (companyId: string, productId: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  };
  reports: ReportsAPIExt & {
    xReport: ReportsAPIExt['xReport'];
    zReport: ReportsAPIExt['zReport'];
    printQueueCount: ReportsAPIExt['printQueueCount'];
    retryPrint: ReportsAPIExt['retryPrint'];
    testWebkassa: ReportsAPIExt['testWebkassa'];
  };
  revisions: {
    getAll: (companyId: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    getOne: (companyId: string, id: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    create: (data: any) => Promise<{ success: boolean; data?: any; error?: string }>;
    updateItem: (data: any) => Promise<{ success: boolean; error?: string }>;
    complete: (companyId: string, id: string) => Promise<{ success: boolean; error?: string }>;
  };
  resortings: {
    getAll: (companyId: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    create: (data: any) => Promise<{ success: boolean; data?: any; error?: string }>;
  };
  nkt: {
    search: (query: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  };
  customerDisplay: {
    setMode: (mode: string, data: any) => Promise<{ success: boolean; error?: string }>;
  };
  backup: {
    create: () => Promise<{ success: boolean; data?: { path: string, date: string }; error?: string }>;
    restore: () => Promise<{ success: boolean; error?: string }>;
    list: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
    chooseDir: () => Promise<{ success: boolean; data?: { dir: string }; error?: string }>;
    getDir: () => Promise<{ success: boolean; data?: { dir: string }; error?: string }>;
    getAuto: () => Promise<{ success: boolean; data?: { enabled: boolean, interval?: string }; error?: string }>;
    setAuto: (enabled: boolean, interval?: string) => Promise<{ success: boolean; error?: string }>;
    deleteOld: () => Promise<{ success: boolean; data?: { deleted: number }; error?: string }>;
  };
  network: {
    status: () => Promise<{ success: boolean; data?: { mode: string; serverUrl: string; localIP: string; isServerRunning: boolean; port: number }; error?: string }>;
    startServer: () => Promise<{ success: boolean; ip?: string; port?: number; error?: string }>;
    stopServer: () => Promise<{ success: boolean; error?: string }>;
    connect: (serverIP: string) => Promise<{ success: boolean; data?: { serverUrl: string }; error?: string }>;
    disconnect: () => Promise<{ success: boolean; error?: string }>;
    test: (serverIP?: string) => Promise<{ success: boolean; data?: { connected: boolean }; error?: string }>;
  };
  onCustomerDisplayMode: (callback: (payload: any) => void) => void;
  updater: {
    check: () => Promise<any>;
    download: () => Promise<any>;
    install: () => Promise<any>;
    onChecking: (cb: () => void) => void;
    onAvailable: (cb: (data: any) => void) => void;
    onNotAvailable: (cb: (data: any) => void) => void;
    onProgress: (cb: (data: any) => void) => void;
    onDownloaded: (cb: (data: any) => void) => void;
    onError: (cb: (data: any) => void) => void;
    removeAllListeners: () => void;
  };
}

declare global {
  interface Window {
    electronAPI: AppElectronAPI;
  }
}

declare module 'react-barcode' {
  const Barcode: any;
  export default Barcode;
}

declare module 'react-i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
  }
}

declare module 'bwip-js' {
  const bwipjs: {
    toCanvas(canvas: HTMLCanvasElement, opts: {
      bcid: string;
      text: string;
      scale?: number;
      height?: number;
      includetext?: boolean;
      textxalign?: string;
      textsize?: number;
      [key: string]: any;
    }): void;
  };
  export default bwipjs;
}
