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

  if (version < 14) {
    migrationV14(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(14, 'resortings_table');
    log.info('Migration V14 applied: resortings_table');
  }

  if (version < 15) {
    migrationV15(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(15, 'receipts_cash_details');
    log.info('Migration V15 applied: receipts_cash_details');
  }

  if (version < 16) {
    migrationV16(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(16, 'performance_indexes');
    log.info('Migration V16 applied: performance_indexes');
  }

  if (version < 17) {
    migrationV17(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(17, 'setup_complete_flag');
    log.info('Migration V17 applied: setup_complete_flag');
  }

  if (version < 18) {
    migrationV18(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(18, 'deferred_receipts');
    log.info('Migration V18 applied: deferred_receipts');
  }

  if (version < 19) {
    migrationV19(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(19, 'vat_and_taxes_settings');
    log.info('Migration V19 applied: vat_and_taxes_settings');
  }

  if (version < 20) {
    migrationV20(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(20, 'product_supplier_link');
    log.info('Migration V20 applied: product_supplier_link');
  }

  if (version < 21) {
    migrationV21(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(21, 'seed_default_categories');
    log.info('Migration V21 applied: seed_default_categories');
  }

  if (version < 22) {
    migrationV22(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(22, 'recovery_key_support');
    log.info('Migration V22 applied: recovery_key_support');
  }

  if (version < 23) {
    migrationV23(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(23, 'add_ofd_fiscal_number');
    log.info('Migration V23 applied: add_ofd_fiscal_number');
  }

  if (version < 24) {
    migrationV24(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(24, 'return_basis_details');
    log.info('Migration V24 applied: return_basis_details');
  }

  if (version < 25) {
    migrationV25(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(25, 'parent_receipt_id');
    log.info('Migration V25 applied: parent_receipt_id');
  }

  if (version < 26) {
    migrationV26(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(26, 'cash_operations_ofd_url');
    log.info('Migration V26 applied: cash_operations_ofd_url');
  }

  if (version < 27) {
    migrationV27(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(27, 'warehouses_and_transfers');
    log.info('Migration V27 applied: warehouses_and_transfers');
  }

  if (version < 29) {
    migrationV29(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(29, 'fix_schema_for_multi_warehouse');
    log.info('Migration V29 applied: fix_schema_for_multi_warehouse');
  }

  if (version < 30) {
    migrationV30(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(30, 'cleanup_duplicate_warehouses');
    log.info('Migration V30 applied: cleanup_duplicate_warehouses');
  }

  if (version < 31) {
    migrationV31(db);
    db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(31, 'scale_settings_lan');
    log.info('Migration V31 applied: scale_settings_lan');
  }
}

function migrationV31(db: Database.Database) {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(scale_settings)').all() as any[];
    const cols = tableInfo.map((c: any) => c.name);
    if (!cols.includes('connection_type')) {
      db.exec("ALTER TABLE scale_settings ADD COLUMN connection_type TEXT DEFAULT 'com'");
    }
    if (!cols.includes('lan_ip')) {
      db.exec("ALTER TABLE scale_settings ADD COLUMN lan_ip TEXT DEFAULT '192.168.1.100'");
    }
    if (!cols.includes('lan_port')) {
      db.exec('ALTER TABLE scale_settings ADD COLUMN lan_port INTEGER DEFAULT 4196');
    }
    log.info('Migration V31: LAN fields added to scale_settings');
  } catch (error) {
    log.error('Migration V31 error:', error);
  }
}

function migrationV22(db: Database.Database) {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(companies)').all() as any[];
    if (!tableInfo.some(col => col.name === 'recovery_key_hash')) {
      db.exec('ALTER TABLE companies ADD COLUMN recovery_key_hash TEXT');
      log.info('Added recovery_key_hash column to companies table');
    }
  } catch (error) {
    log.error('Migration V22 error:', error);
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
      ALTER TABLE products ADD COLUMN vat_rate INTEGER DEFAULT 16;
    `);

    // 2. Add vat_rate to receipt_items for historical accuracy
    db.exec(`
      ALTER TABLE receipt_items ADD COLUMN vat_rate INTEGER DEFAULT 16;
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

function migrationV14(db: Database.Database) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS resortings (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        source_product_id TEXT NOT NULL,
        target_product_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        source_price REAL DEFAULT 0,
        target_price REAL DEFAULT 0,
        price_diff REAL DEFAULT 0,
        reason TEXT,
        status TEXT DEFAULT 'completed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (source_product_id) REFERENCES products(id),
        FOREIGN KEY (target_product_id) REFERENCES products(id)
      )
    `);
  } catch (error) {
    log.error('Migration V14 error:', error);
  }
}

function migrationV15(db: Database.Database) {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(receipts)').all() as any[];
    const hasCashGiven = tableInfo.some(col => col.name === 'cash_given');
    if (!hasCashGiven) {
      db.exec('ALTER TABLE receipts ADD COLUMN cash_given REAL DEFAULT 0');
      db.exec('ALTER TABLE receipts ADD COLUMN change_amount REAL DEFAULT 0');
    }
  } catch (error) {
    log.error('Migration V15 error:', error);
  }
}

function migrationV16(db: Database.Database) {
  try {
    // Индексы для ускорения работы с базой при 10k+ товарах
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
      CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON receipts(created_at);
      CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt_id ON receipt_items(receipt_id);
    `);
  } catch (error) {
    log.error('Migration V16 error:', error);
  }
}

function migrationV17(db: Database.Database) {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(companies)').all() as any[];
    const hasSetupComplete = tableInfo.some(col => col.name === 'is_setup_complete');
    if (!hasSetupComplete) {
      db.exec('ALTER TABLE companies ADD COLUMN is_setup_complete INTEGER DEFAULT 0');
      // Для уже существующих баз (где уже есть товары/чеки/пользователи) — считаем настройку завершённой
      const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get() as any;
      if (admin) {
        // Проверяем, менял ли админ пароль (не дефолтный admin123)
        const user = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(admin.id) as any;
        const bcrypt = require('bcryptjs');
        const isDefault = bcrypt.compareSync('admin123', user.password_hash);
        if (!isDefault) {
          // Пароль уже сменён — настройка пройдена
          db.exec('UPDATE companies SET is_setup_complete = 1');
        }
        // Если пароль дефолтный — оставляем is_setup_complete = 0, покажем экран настройки
      }
    }
  } catch (error) {
    log.error('Migration V17 error:', error);
  }
}

function migrationV18(db: Database.Database) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS deferred_receipts (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        cart_data TEXT NOT NULL, /* JSON */
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      )
    `);
  } catch (error) {
    log.error('Migration V18 error:', error);
  }
}

function migrationV19(db: Database.Database) {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(settings)').all() as any[];
    const hasVat = tableInfo.some(col => col.name === 'is_vat_payer');
    if (!hasVat) {
      db.exec('ALTER TABLE settings ADD COLUMN is_vat_payer INTEGER DEFAULT 0');
      db.exec('ALTER TABLE settings ADD COLUMN vat_certificate_series TEXT');
      db.exec('ALTER TABLE settings ADD COLUMN vat_certificate_number TEXT');
      db.exec('ALTER TABLE settings ADD COLUMN vat_registered_at TEXT');
      db.exec('ALTER TABLE settings ADD COLUMN vat_certificate_issued_at TEXT');
      db.exec("ALTER TABLE settings ADD COLUMN tax_regime TEXT DEFAULT 'СНР'");
      db.exec('ALTER TABLE settings ADD COLUMN is_kpn_payer INTEGER DEFAULT 0');
      db.exec('ALTER TABLE settings ADD COLUMN is_excise_payer INTEGER DEFAULT 0');
      db.exec('ALTER TABLE settings ADD COLUMN accounting_policy_start_date TEXT');

      // Add vat_rate to products
      const prodInfo = db.prepare('PRAGMA table_info(products)').all() as any[];
      if (!prodInfo.some(col => col.name === 'vat_rate')) {
        db.exec('ALTER TABLE products ADD COLUMN vat_rate INTEGER DEFAULT 0');
      }
    }
  } catch (error) {
    log.error('Migration V19 error:', error);
  }
}

function migrationV20(db: Database.Database) {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(products)').all() as any[];
    if (!tableInfo.some(col => col.name === 'supplier_id')) {
      db.exec('ALTER TABLE products ADD COLUMN supplier_id TEXT');
      db.exec('CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id)');
    }
  } catch (error) {
    log.error('Migration V20 error:', error);
  }
}
function migrationV21(db: Database.Database) {
  try {
    const companies = db.prepare('SELECT id FROM companies').all() as { id: string }[];
    const defaultCategories = [
      'Молочные продукты', 'Мясные изделия', 'Морепродукты', 'Булочные изделия',
      'Фрукты и овощи', 'Напитки', 'Кондитерские изделия', 'Техника', 'Ткани и текстиль', 'Хозтовары'
    ];

    const checkStmt = db.prepare('SELECT COUNT(*) as count FROM categories WHERE company_id = ?');
    const insertStmt = db.prepare('INSERT INTO categories (id, company_id, name) VALUES (?, ?, ?)');

    for (const company of companies) {
      const { count } = checkStmt.get(company.id) as { count: number };
      if (count === 0) {
        for (const cat of defaultCategories) {
          insertStmt.run(uuidv4(), company.id, cat);
        }
        log.info(`Seeded ${defaultCategories.length} categories for company ${company.id}`);
      }
    }
  } catch (error) {
    log.error('Migration V21 error:', error);
  }
}

function migrationV23(db: Database.Database) {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(receipts)').all() as any[];
    if (!tableInfo.some(col => col.name === 'ofd_fiscal_number')) {
      db.exec('ALTER TABLE receipts ADD COLUMN ofd_fiscal_number TEXT');
      log.info('Added ofd_fiscal_number column to receipts table');
    }
  } catch (error) {
    log.error('Migration V23 error:', error);
  }
}

function migrationV24(db: Database.Database) {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(receipts)').all() as any[];
    if (!tableInfo.some(col => col.name === 'ofd_datetime')) {
      db.exec('ALTER TABLE receipts ADD COLUMN ofd_datetime TEXT');
      log.info('Added ofd_datetime column to receipts table');
    }
    if (!tableInfo.some(col => col.name === 'ofd_registration_number')) {
      db.exec('ALTER TABLE receipts ADD COLUMN ofd_registration_number TEXT');
      log.info('Added ofd_registration_number column to receipts table');
    }
  } catch (error) {
    log.error('Migration V24 error:', error);
  }
}

function migrationV25(db: Database.Database) {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(receipts)').all() as any[];
    if (!tableInfo.some(col => col.name === 'parent_receipt_id')) {
      db.exec('ALTER TABLE receipts ADD COLUMN parent_receipt_id TEXT');
      log.info('Added parent_receipt_id column to receipts table');
    }
  } catch (error) {
    log.error('Migration V25 error:', error);
  }
}

function migrationV26(db: Database.Database) {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(cash_operations)').all() as any[];
    if (!tableInfo.some(col => col.name === 'ofd_ticket_url')) {
      db.exec('ALTER TABLE cash_operations ADD COLUMN ofd_ticket_url TEXT');
      log.info('Added ofd_ticket_url column to cash_operations table');
    }
  } catch (error) {
    log.error('Migration V26 error:', error);
  }
}

function migrationV27(db: Database.Database) {
  const transaction = db.transaction(() => {
    // 1. Create warehouses table
    db.exec(`
      CREATE TABLE IF NOT EXISTS warehouses (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        is_main INTEGER DEFAULT 0,
        address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      )
    `);

    // 2. Create transfers table
    db.exec(`
      CREATE TABLE IF NOT EXISTS transfers (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        doc_number TEXT NOT NULL,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        from_warehouse_id TEXT NOT NULL,
        to_warehouse_id TEXT NOT NULL,
        status TEXT DEFAULT 'draft', /* draft, completed, cancelled */
        created_by TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id),
        FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    // 3. Create transfer_items table
    db.exec(`
      CREATE TABLE IF NOT EXISTS transfer_items (
        id TEXT PRIMARY KEY,
        transfer_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        FOREIGN KEY (transfer_id) REFERENCES transfers(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    // 4. Create Main Warehouse for all existing companies if not exists
    const companies = db.prepare('SELECT id FROM companies').all() as { id: string }[];
    for (const company of companies) {
      const existing = db.prepare('SELECT id FROM warehouses WHERE company_id = ? AND is_main = 1').get(company.id);
      if (!existing) {
        const warehouseId = uuidv4();
        db.prepare(`
          INSERT INTO warehouses (id, company_id, name, is_main)
          VALUES (?, ?, 'Основной склад', 1)
        `).run(warehouseId, company.id);
      }
    }

    // 5. Migrate inventory table to include warehouse_id
    const inventoryInfo = db.prepare('PRAGMA table_info(inventory)').all() as any[];
    const hasWarehouseId = inventoryInfo.some(col => col.name === 'warehouse_id');

    if (!hasWarehouseId) {
      db.exec(`
        CREATE TABLE inventory_new(
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          warehouse_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          quantity REAL DEFAULT 0,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(company_id) REFERENCES companies(id),
          FOREIGN KEY(warehouse_id) REFERENCES warehouses(id),
          FOREIGN KEY(product_id) REFERENCES products(id),
          UNIQUE(company_id, warehouse_id, product_id)
        )
          `);

      db.exec(`
        INSERT INTO inventory_new(id, company_id, warehouse_id, product_id, quantity, updated_at)
        SELECT 
          i.id,
          i.company_id,
          (SELECT id FROM warehouses WHERE company_id = i.company_id AND is_main = 1 LIMIT 1),
          i.product_id,
          i.quantity,
          i.updated_at
        FROM inventory i
      `);

      db.exec(`DROP TABLE inventory`);
      db.exec(`ALTER TABLE inventory_new RENAME TO inventory`);
    }
  });

  try {
    transaction();
    log.info('Migration V27 successfully executed (Warehouses & Transfers)');
  } catch (err) {
    log.error('Migration V27 failed:', err);
    throw err;
  }
}

function migrationV29(db: Database.Database) {
  const transaction = db.transaction(() => {
    // 1. Ensure warehouses has is_main and address columns
    const warehouseInfo = db.prepare('PRAGMA table_info(warehouses)').all() as any[];
    if (!warehouseInfo.some(col => col.name === 'is_main')) {
      db.exec('ALTER TABLE warehouses ADD COLUMN is_main INTEGER DEFAULT 0');
    }
    if (!warehouseInfo.some(col => col.name === 'address')) {
      db.exec('ALTER TABLE warehouses ADD COLUMN address TEXT');
    }

    // 2. Ensure each company has a main warehouse
    const companies = db.prepare('SELECT id FROM companies').all() as { id: string }[];
    for (const company of companies) {
      const existing = db.prepare('SELECT id FROM warehouses WHERE company_id = ? AND is_main = 1').get(company.id);
      if (!existing) {
        const warehouseId = uuidv4();
        db.prepare(`
          INSERT INTO warehouses (id, company_id, name, is_main)
          VALUES (?, ?, 'Основной склад', 1)
        `).run(warehouseId, company.id);
      }
    }

    // 3. Ensure inventory has warehouse_id
    const inventoryInfo = db.prepare('PRAGMA table_info(inventory)').all() as any[];
    const hasWarehouseId = inventoryInfo.some(col => col.name === 'warehouse_id');
    if (!hasWarehouseId) {
      db.exec(`
        CREATE TABLE inventory_new(
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          warehouse_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          quantity REAL DEFAULT 0,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(company_id) REFERENCES companies(id),
          FOREIGN KEY(warehouse_id) REFERENCES warehouses(id),
          FOREIGN KEY(product_id) REFERENCES products(id),
          UNIQUE(company_id, warehouse_id, product_id)
        )
      `);

      db.exec(`
        INSERT INTO inventory_new(id, company_id, warehouse_id, product_id, quantity, updated_at)
        SELECT 
          i.id,
          i.company_id,
          (SELECT id FROM warehouses WHERE company_id = i.company_id AND is_main = 1 LIMIT 1),
          i.product_id,
          i.quantity,
          i.updated_at
        FROM inventory i
      `);

      db.exec(`DROP TABLE inventory`);
      db.exec(`ALTER TABLE inventory_new RENAME TO inventory`);
    }

    // 4. Fix transfers table
    db.exec('DROP TABLE IF EXISTS transfer_items');
    db.exec('DROP TABLE IF EXISTS transfers');

    db.exec(`
      CREATE TABLE transfers (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        doc_number TEXT NOT NULL,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        from_warehouse_id TEXT NOT NULL,
        to_warehouse_id TEXT NOT NULL,
        status TEXT DEFAULT 'draft',
        created_by TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id),
        FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    db.exec(`
      CREATE TABLE transfer_items (
        id TEXT PRIMARY KEY,
        transfer_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        FOREIGN KEY (transfer_id) REFERENCES transfers(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);
  });

  try {
    transaction();
    log.info('Migration V29 successfully executed (Fix schema multi warehouse)');
  } catch (err) {
    log.error('Migration V29 failed:', err);
    throw err;
  }
}

function migrationV30(db: Database.Database) {
  const transaction = db.transaction(() => {
    const companies = db.prepare('SELECT id FROM companies').all() as { id: string }[];
    for (const company of companies) {
      const mainWarehouses = db.prepare("SELECT id FROM warehouses WHERE company_id = ? AND name = 'Основной склад' ORDER BY created_at ASC").all(company.id) as { id: string }[];

      if (mainWarehouses.length > 1) {
        const primaryId = mainWarehouses[0].id;
        for (let i = 1; i < mainWarehouses.length; i++) {
          const duplicateId = mainWarehouses[i].id;

          // Reassign inventory from duplicate to primary
          db.prepare('UPDATE OR IGNORE inventory SET warehouse_id = ? WHERE warehouse_id = ?').run(primaryId, duplicateId);
          // Delete any conflicting leftover inventory rows for the duplicate
          db.prepare('DELETE FROM inventory WHERE warehouse_id = ?').run(duplicateId);

          // Reassign transfers
          db.prepare('UPDATE transfers SET from_warehouse_id = ? WHERE from_warehouse_id = ?').run(primaryId, duplicateId);
          db.prepare('UPDATE transfers SET to_warehouse_id = ? WHERE to_warehouse_id = ?').run(primaryId, duplicateId);

          // Delete duplicate warehouse
          db.prepare('DELETE FROM warehouses WHERE id = ?').run(duplicateId);
        }
      }
    }
  });

  try {
    transaction();
    log.info('Migration V30 successfully executed (Cleanup duplicate main warehouses)');
  } catch (err) {
    log.error('Migration V30 failed:', err);
    throw err;
  }
}
