const db = require('better-sqlite3')('C:/Users/Pc/AppData/Roaming/easykassa/inventory.db');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='transfers'").get());
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='migrations'").get());
console.log(db.prepare("SELECT * FROM migrations").all());
