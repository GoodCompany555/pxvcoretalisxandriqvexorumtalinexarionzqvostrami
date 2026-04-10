import Database from 'better-sqlite3'
import log from 'electron-log'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'

// Версионирование БД
export function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const currentVersion = db.prepare('SELECT MAX(version) as version FROM migrations').get() as { version: number } | undefined;
  const version = currentVersion?.version || 0;

  if (version < 1) {
    migrationV1(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(1, 'initial_schema');
    log.info('Migration V1 applied: initial_schema');
  }

  if (version < 2) {
    migrationV2(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(2, 'suppliers_purchases');
    log.info('Migration V2 applied: suppliers_purchases');
  }
  if (version < 3) {
    migrationV3(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(3, 'ofd_settings');
    log.info('Migration V3 applied: ofd_settings');
  }

  if (version < 4) {
    migrationV4(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(4, 'hwid_license_cache');
    log.info('Migration V4 applied: hwid_license_cache');
  }

  if (version < 5) {
    migrationV5(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(5, 'taxes_and_clients');
    log.info('Migration V5 applied: taxes_and_clients');
  }

  if (version < 6) {
    migrationV6(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(6, 'hardware_and_i18n');
    log.info('Migration V6 applied: hardware_and_i18n');
  }

  if (version < 7) {
    migrationV7(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(7, 'product_name_kk');
    log.info('Migration V7 applied: product_name_kk');
  }

  if (version < 8) {
    migrationV8(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(8, 'user_permissions');
    log.info('Migration V8 applied: user_permissions');
  }

  if (version < 9) {
    migrationV9(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(9, 'inventory_revisions');
    log.info('Migration V9 applied: inventory_revisions');
  }

  if (version < 10) {
    migrationV10(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(10, 'products_soft_delete');
    log.info('Migration V10 applied: products_soft_delete');
  }

  if (version < 11) {
    migrationV11(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(11, 'prevent_negative_inventory');
    log.info('Migration V11 applied: prevent_negative_inventory');
  }

  if (version < 12) {
    migrationV12(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(12, 'alcohol_support');
    log.info('Migration V12 applied: alcohol_support');
  }
  if (version < 13) {
    migrationV13(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(13, 'cash_operations_table');
    log.info('Migration V13 applied: cash_operations_table');
  }
}

function migrationV13(db: Database.Database) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cash_operations (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        shift_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL, /* in, out */
        amount REAL NOT NULL,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (shift_id) REFERENCES shifts(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
  } catch (error) {
    log.error('Migration V13 error:', error);
  }
}

function migrationV12(db: Database.Database) {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(products)').all() as any[];
    const hasIsAlcohol = tableInfo.some(col => col.name === 'is_alcohol');
    if (!hasIsAlcohol) {
      db.exec('ALTER TABLE products ADD COLUMN is_alcohol INTEGER DEFAULT 0');
      db.exec('ALTER TABLE products ADD COLUMN alcohol_abv REAL');
      db.exec('ALTER TABLE products ADD COLUMN alcohol_volume REAL');
    }
  } catch (error) {
    log.error('Migration V12 error:', error);
  }
}

function migrationV11(db: Database.Database) {
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS check_inventory_quantity_insert
      BEFORE INSERT ON inventory
      WHEN NEW.quantity < 0
      BEGIN
        SELECT RAISE(ABORT, 'Quantity cannot be negative');
      END;
    `);
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS check_inventory_quantity_update
      BEFORE UPDATE ON inventory
      WHEN NEW.quantity < 0
      BEGIN
        SELECT RAISE(ABORT, 'Quantity cannot be negative');
      END;
    `);
    // Fix existing negative values
    db.exec('UPDATE inventory SET quantity = 0 WHERE quantity < 0');
  } catch (error) {
    log.error('Migration V11 error:', error);
  }
}

function migrationV10(db: Database.Database) {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(products)').all() as any[];
    const hasIsDeleted = tableInfo.some(col => col.name === 'is_deleted');
    if (!hasIsDeleted) {
      db.exec('ALTER TABLE products ADD COLUMN is_deleted INTEGER DEFAULT 0');
    }
  } catch (error) {
    log.error('Migration V10 error:', error);
  }
}

function migrationV1(db: Database.Database) {
  // Транзакция для создания всех начальных таблиц
  const createTables = db.transaction(() => {
    // 1. Компании (Тенанты)
    db.exec(`
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY, /* UUID */
        name TEXT NOT NULL,
        bin TEXT,
        address TEXT,
        hwid TEXT UNIQUE, /* Привязка к оборудованию */
        license_key TEXT,
        license_status TEXT DEFAULT 'trial',
        license_expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Пользователи (Сотрудники)
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, /* UUID */
        company_id TEXT NOT NULL,
        username TEXT NOT NULL, /* Для логина */
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL, /* admin, cashier, accountant */
        iin TEXT,
        pin_code TEXT, /* Для быстрого входа */
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      )
    `);

    // 3. Категории товаров
    db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        parent_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (parent_id) REFERENCES categories(id)
      )
    `);

    // 4. Товары
    db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        barcode TEXT,
        name TEXT NOT NULL,
        category_id TEXT,
        price_purchase REAL DEFAULT 0,
        price_retail REAL NOT NULL,
        measure_unit TEXT DEFAULT 'шт', /* шт, кг, л, м */
        is_weighable INTEGER DEFAULT 0, /* Весовой товар */
        is_marked INTEGER DEFAULT 0, /* Маркированный товар */
        min_stock INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (category_id) REFERENCES categories(id)
      )
    `);

    // 5. Единый регистр остатков (Склады)
    db.exec(`
      CREATE TABLE IF NOT EXISTS inventory (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        quantity REAL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (product_id) REFERENCES products(id),
        UNIQUE(company_id, product_id)
      )
    `);

    // 6. Смены (Z-отчеты)
    db.exec(`
      CREATE TABLE IF NOT EXISTS shifts (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        closed_at DATETIME,
        start_cash REAL DEFAULT 0,
        end_cash REAL DEFAULT 0,
        total_sales REAL DEFAULT 0,
        total_returns REAL DEFAULT 0,
        is_closed INTEGER DEFAULT 0,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // 7. Чеки (Продажи и Возвраты)
    db.exec(`
      CREATE TABLE IF NOT EXISTS receipts (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        shift_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        receipt_number INTEGER NOT NULL,
        type TEXT NOT NULL, /* sale, return */
        payment_type TEXT NOT NULL, /* cash, card, mixed */
        total_amount REAL NOT NULL,
        discount_amount REAL DEFAULT 0,
        cash_amount REAL DEFAULT 0,
        card_amount REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        -- ОФД поля
        ofd_status TEXT DEFAULT 'pending', /* pending, sent, error */
        ofd_ticket_url TEXT,
        ofd_error_code TEXT,
        is_offline INTEGER DEFAULT 0, /* Пробит в оффлайне */
        
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (shift_id) REFERENCES shifts(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // 8. Позиции чека
    db.exec(`
      CREATE TABLE IF NOT EXISTS receipt_items (
        id TEXT PRIMARY KEY,
        receipt_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        price REAL NOT NULL,
        discount REAL DEFAULT 0,
        total REAL NOT NULL,
        mark_code TEXT, /* Код маркировки (для сигарет/обуви) */
        FOREIGN KEY (receipt_id) REFERENCES receipts(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    // 9. Очередь ОФД (для офлайн режима)
    db.exec(`
      CREATE TABLE IF NOT EXISTS ofd_queue (
        id TEXT PRIMARY KEY,
        receipt_id TEXT NOT NULL UNIQUE,
        payload TEXT NOT NULL, /* JSON запроса к ОФД */
        failed_attempts INTEGER DEFAULT 0,
        last_error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (receipt_id) REFERENCES receipts(id)
      )
    `);

    // 10. Настройки
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        company_id TEXT PRIMARY KEY,
        ofd_token TEXT,
        ofd_activated INTEGER DEFAULT 0,
        terminal_type TEXT, /* halyk, kaspi, none */
        terminal_port TEXT,
        printer_type TEXT,
        printer_address TEXT,
        auto_print INTEGER DEFAULT 1,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      )
    `);

    // Индексы для скорости (важно для POS!)
    db.exec('CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id)');

    // Seed: Создаём дефолтную компанию и админа
    seedInitialData(db);
  });

  createTables();
}

function seedInitialData(db: Database.Database) {
  const companyId = uuidv4();
  const adminId = uuidv4();

  // Добавляем компанию
  db.prepare(`
    INSERT INTO companies (id, name, license_status) 
    VALUES (?, ?, ?)
  `).run(companyId, 'Мой Магазин', 'active');

  // Добавляем админа (пароль: admin123)
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync('admin123', salt);

  db.prepare(`
    INSERT INTO users (id, company_id, username, password_hash, full_name, role)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(adminId, companyId, 'admin', hash, 'Администратор', 'admin');

  db.prepare(`
    INSERT INTO settings (company_id) VALUES (?)
  `).run(companyId);

  log.info('Seeded initial company and admin user');
}

function migrationV2(db: Database.Database) {
  const createTables = db.transaction(() => {
    // 11. Поставщики
    db.exec(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        bin TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      )
    `);

    // 12. Покупки / Приходные накладные
    db.exec(`
      CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        user_id TEXT NOT NULL, /* Кто создал/принял */
        status TEXT DEFAULT 'draft', /* draft, completed, cancelled */
        total_amount REAL DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // 13. Позиции в приходной накладной
    db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_items (
        id TEXT PRIMARY KEY,
        purchase_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        price REAL NOT NULL, /* Закупочная цена */
        total REAL NOT NULL,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);
  });

  createTables();
}

function migrationV3(db: Database.Database) {
  // Add OFD specific columns to settings table
  db.exec(`
    ALTER TABLE settings ADD COLUMN ofd_provider TEXT DEFAULT 'none';
  `);
  db.exec(`
    ALTER TABLE settings ADD COLUMN ofd_login TEXT;
  `);
  db.exec(`
    ALTER TABLE settings ADD COLUMN ofd_password TEXT;
  `);
  db.exec(`
    ALTER TABLE settings ADD COLUMN ofd_cashbox_id TEXT;
  `);
}

function migrationV4(db: Database.Database) {
  // Add license check timestamp cache
  db.exec(`
    ALTER TABLE companies ADD COLUMN last_license_check DATETIME;
  `);
}

function migrationV5(db: Database.Database) {
  const transaction = db.transaction(() => {
    // 1. Add vat_rate to products
    db.exec(`
      ALTER TABLE products ADD COLUMN vat_rate INTEGER DEFAULT 12;
    `);

    // 2. Add vat_rate to receipt_items for historical accuracy
    db.exec(`
      ALTER TABLE receipt_items ADD COLUMN vat_rate INTEGER DEFAULT 12;
    `);

    // 3. Create B2B Clients table (Counterparties)
    db.exec(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        bin TEXT,
        address TEXT,
        phone TEXT,
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      )
    `);

    // 4. Create Documents table (Invoices, AVR)
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        receipt_id TEXT NOT NULL,
        doc_type TEXT NOT NULL, /* invoice, avr, waybill */
        doc_number TEXT NOT NULL,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (client_id) REFERENCES clients(id),
        FOREIGN KEY (receipt_id) REFERENCES receipts(id)
      )
    `);
  });

  transaction();
}

function migrationV6(db: Database.Database) {
  const transaction = db.transaction(() => {
    // 1. POS-терминалы банков
    db.exec(`
      CREATE TABLE IF NOT EXISTS pos_terminals (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        bank_name TEXT NOT NULL,
        model TEXT DEFAULT '',
        connection_type TEXT NOT NULL DEFAULT 'tcp', /* tcp, com */
        address TEXT NOT NULL, /* IP или COM-порт */
        port INTEGER DEFAULT 0,
        baud_rate INTEGER DEFAULT 9600,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      )
    `);

    // 2. Настройки весов
    db.exec(`
      CREATE TABLE IF NOT EXISTS scale_settings (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL UNIQUE,
        com_port TEXT NOT NULL DEFAULT 'COM3',
        baud_rate INTEGER DEFAULT 9600,
        protocol TEXT DEFAULT 'cas', /* cas, toledo, massak */
        is_active INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      )
    `);

    // 3. Очередь печати
    db.exec(`
      CREATE TABLE IF NOT EXISTS printer_queue (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        receipt_id TEXT,
        report_type TEXT, /* receipt, x_report, z_report */
        payload TEXT NOT NULL,
        status TEXT DEFAULT 'pending', /* pending, printed, failed */
        attempts INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      )
    `);

    // 4. Язык интерфейса в настройках
    try { db.exec(`ALTER TABLE settings ADD COLUMN language TEXT DEFAULT 'ru'`); } catch (_) { }

    // 5. Банк терминала в чеках
    try { db.exec(`ALTER TABLE receipts ADD COLUMN terminal_bank TEXT`); } catch (_) { }
  });

  transaction();
}

function migrationV7(db: Database.Database) {
  // Добавляем казахское название товара
  try { db.exec(`ALTER TABLE products ADD COLUMN name_kk TEXT`); } catch (_) { }
}

function migrationV8(db: Database.Database) {
  // Добавление столбца для JSON разрешений (кастомный доступ к вкладкам)
  try {
    db.exec(`ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '{}'`);
    log.info('Added permissions column to users table');
  } catch (err: any) {
    if (!err.message.includes('duplicate column name')) {
      throw err;
    }
  }
}

function migrationV9(db: Database.Database) {
  const transaction = db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS revisions (
        id TEXT PRIMARY KEY, /* UUID */
        company_id TEXT NOT NULL,
        warehouse_id TEXT DEFAULT 'main', /* Временно ставим 'main' */
        revision_type TEXT NOT NULL, /* full, partial, category */
        status TEXT NOT NULL DEFAULT 'draft', /* draft, in_progress, completed, cancelled */
        responsible_user_id TEXT,
        started_at DATETIME,
        completed_at DATETIME,
        total_items INTEGER DEFAULT 0,
        matched_items INTEGER DEFAULT 0,
        shortage_amount REAL DEFAULT 0,
        surplus_amount REAL DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (responsible_user_id) REFERENCES users(id)
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS revision_items (
        id TEXT PRIMARY KEY, /* UUID */
        revision_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        system_quantity REAL NOT NULL,
        actual_quantity REAL,
        difference REAL, /* actual - system */
        unit_price REAL DEFAULT 0,
        difference_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'pending', /* pending, counted */
        FOREIGN KEY (revision_id) REFERENCES revisions(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);
  });

  transaction();
}
