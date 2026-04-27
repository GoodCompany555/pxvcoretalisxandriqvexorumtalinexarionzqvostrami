import path from 'path'
import log from 'electron-log'
import { app } from 'electron'
import { runMigrations } from '../database/migrations'

// Bypass Vite bundling
// @ts-ignore
const requireNode = typeof __webpack_require__ === 'function' ? __non_webpack_require__ : eval('require');
const Database = requireNode('better-sqlite3');

export let db: any = null

export function initDatabase() {
  try {
    const userDataPath = app.getPath('userData')
    const dbPath = path.join(userDataPath, 'pos-system.sqlite')

    log.info(`Initializing database at: ${dbPath}`)

    db = new Database(dbPath, {
      verbose: process.env.NODE_ENV === 'development' ? console.log : null
    })

    // Enable Write-Ahead Logging for better concurrent performance
    db.pragma('journal_mode = WAL')
    // Enable foreign keys
    db.pragma('foreign_keys = ON')

    runMigrations(db)

    log.info('Database initialized successfully')
    return true
  } catch (error) {
    log.error('Failed to initialize database:', error)
    return false
  }
}

export function closeDatabase() {
  if (db) {
    db.close()
    db = null
    log.info('Database connection closed')
  }
}
