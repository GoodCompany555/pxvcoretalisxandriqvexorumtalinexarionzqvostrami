import { registerRpc } from '../services/rpc';
import { app, dialog, BrowserWindow } from 'electron';
import { db, closeDatabase, initDatabase } from '../database';
import { mainWindow } from '../main';
import log from 'electron-log';
import * as path from 'path';
import * as fs from 'fs';
import Store from 'electron-store';

const store = new Store();

function getDbPath(): string {
  return path.join(app.getPath('userData'), 'pos-system.sqlite');
}

function getDefaultBackupDir(): string {
  return path.join(app.getPath('documents'), 'EasyKassa Backups');
}

export function setupBackupHandlers() {
  // Создать резервную копию
  registerRpc('backup:create', async () => {
    try {
      const dbPath = getDbPath();
      if (!fs.existsSync(dbPath)) {
        return { success: false, error: 'Файл базы данных не найден' };
      }

      const backupDir = (store.get('backupDir') as string) || getDefaultBackupDir();
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const backupFileName = `База данных ${day}.${month}.${year} ${hours}-${minutes}.sqlite`;
      const backupPath = path.join(backupDir, backupFileName);

      // Используем SQLite backup API через pragma для безопасного копирования
      if (db) {
        db.pragma('wal_checkpoint(TRUNCATE)');
      }
      fs.copyFileSync(dbPath, backupPath);

      // Копируем WAL файл если есть
      const walPath = dbPath + '-wal';
      if (fs.existsSync(walPath)) {
        fs.copyFileSync(walPath, backupPath + '-wal');
      }

      // Сохраняем в историю (последние 20)
      const history = (store.get('backupHistory') as any[]) || [];
      history.unshift({
        path: backupPath,
        date: now.toISOString(),
        size: fs.statSync(backupPath).size,
      });
      store.set('backupHistory', history.slice(0, 20));

      log.info(`Backup created: ${backupPath}`);
      return { success: true, data: { path: backupPath, date: now.toISOString() } };
    } catch (error: any) {
      log.error('Backup create error:', error);
      return { success: false, error: error.message || 'Ошибка создания копии' };
    }
  });

  // Восстановить из копии
  registerRpc('backup:restore', async () => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const result = await dialog.showOpenDialog(win!, {
        title: 'Выберите файл резервной копии',
        defaultPath: (store.get('backupDir') as string) || getDefaultBackupDir(),
        filters: [{ name: 'SQLite Database', extensions: ['sqlite'] }],
        properties: ['openFile'],
      });

      if (result.canceled || !result.filePaths[0]) {
        return { success: false, error: 'Отменено' };
      }

      const restoreFile = result.filePaths[0];
      const dbPath = getDbPath();

      // Сначала создаём аварийную копию текущей БД
      const emergencyBackup = dbPath + '.before-restore';
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, emergencyBackup);
      }

      // Закрываем текущую БД
      closeDatabase();

      // Заменяем файл
      fs.copyFileSync(restoreFile, dbPath);

      // Удаляем WAL/SHM от старой БД (новая создаст свои)
      const walPath = dbPath + '-wal';
      const shmPath = dbPath + '-shm';
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

      log.info(`Database restored from: ${restoreFile}`);

      // Переинициализируем БД и перезагружаем окно
      initDatabase();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.reloadIgnoringCache();
      }

      return { success: true };
    } catch (error: any) {
      log.error('Backup restore error:', error);
      // Пытаемся переинициализировать БД в случае ошибки
      try { initDatabase(); } catch { }
      return { success: false, error: error.message || 'Ошибка восстановления' };
    }
  });

  // Получить список копий
  registerRpc('backup:list', async () => {
    try {
      const history = (store.get('backupHistory') as any[]) || [];
      // Проверяем существование файлов
      const validHistory = history.filter(item => fs.existsSync(item.path));
      if (validHistory.length !== history.length) {
        store.set('backupHistory', validHistory);
      }
      return { success: true, data: validHistory };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Выбрать папку для хранения копий
  registerRpc('backup:choose-dir', async () => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const result = await dialog.showOpenDialog(win!, {
        title: 'Выберите папку для резервных копий',
        defaultPath: (store.get('backupDir') as string) || getDefaultBackupDir(),
        properties: ['openDirectory'],
      });

      if (result.canceled || !result.filePaths[0]) {
        return { success: false, error: 'Отменено' };
      }

      store.set('backupDir', result.filePaths[0]);
      return { success: true, data: { dir: result.filePaths[0] } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Получить текущую папку
  registerRpc('backup:get-dir', async () => {
    return { success: true, data: { dir: (store.get('backupDir') as string) || getDefaultBackupDir() } };
  });

  // Автобэкап: получить/установить
  registerRpc('backup:get-auto', async () => {
    return { success: true, data: { enabled: !!store.get('autoBackup') } };
  });

  registerRpc('backup:set-auto', async (_event, enabled: boolean) => {
    store.set('autoBackup', enabled);
    return { success: true };
  });
}

// Автобэкап раз в сутки (вызывается из main.ts)
export function startAutoBackupScheduler() {
  const CHECK_INTERVAL = 60 * 60 * 1000; // Проверять каждый час

  setInterval(() => {
    if (!store.get('autoBackup')) return;

    const lastBackup = store.get('lastAutoBackup') as string | undefined;
    const now = new Date();

    if (lastBackup) {
      const lastDate = new Date(lastBackup);
      const hoursSince = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) return; // Ещё не прошли сутки
    }

    // Выполняем автобэкап
    try {
      const dbPath = getDbPath();
      if (!fs.existsSync(dbPath)) return;

      const backupDir = (store.get('backupDir') as string) || getDefaultBackupDir();
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const backupPath = path.join(backupDir, `База данных ${day}.${month}.${year} авто.sqlite`);

      if (db) {
        db.pragma('wal_checkpoint(TRUNCATE)');
      }
      fs.copyFileSync(dbPath, backupPath);

      const history = (store.get('backupHistory') as any[]) || [];
      history.unshift({
        path: backupPath,
        date: now.toISOString(),
        size: fs.statSync(backupPath).size,
        auto: true,
      });
      store.set('backupHistory', history.slice(0, 20));
      store.set('lastAutoBackup', now.toISOString());

      log.info(`Auto backup created: ${backupPath}`);
    } catch (error) {
      log.error('Auto backup error:', error);
    }
  }, CHECK_INTERVAL);
}
