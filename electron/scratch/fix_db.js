const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

// Путь к базе данных из ваших логов
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'EasyKassa', 'pos-system.sqlite');

try {
    const db = new Database(dbPath);
    console.log('Connecting to database at:', dbPath);

    // Проверяем наличие колонки
    const tableInfo = db.prepare("PRAGMA table_info(receipts)").all();
    const hasColumn = tableInfo.some(col => col.name === 'ofd_fiscal_number');

    if (!hasColumn) {
        console.log('Adding column ofd_fiscal_number to receipts table...');
        db.exec('ALTER TABLE receipts ADD COLUMN ofd_fiscal_number TEXT;');
        console.log('Column added successfully!');
    } else {
        console.log('Column ofd_fiscal_number already exists.');
    }

    db.close();
} catch (error) {
    console.error('Failed to update database:', error.message);
    process.exit(1);
}
