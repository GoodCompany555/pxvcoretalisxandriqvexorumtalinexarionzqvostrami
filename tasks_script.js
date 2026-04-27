const fs = require('fs');
const path = require('path');

// --- TASK 3: Input replacement ---
const dirs = ['src/pages', 'src/components'];
function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (!fullPath.includes('ui')) processDir(fullPath); // skip ui folder itself
    } else if (fullPath.endsWith('.tsx') && !fullPath.includes('KeyboardIcon.tsx') && !fullPath.includes('OnScreenKeyboard.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let modified = false;
      content = content.replace(/<input([\s\S]*?)>/g, (match, attrs) => {
        if (attrs.includes('type="checkbox"') || attrs.includes("type='checkbox'") || attrs.includes('type="radio"') || attrs.includes("type='radio'")) {
          return match;
        }
        modified = true;
        return `<Input${attrs}>`;
      });
      content = content.replace(/<\/input>/g, (match) => {
        return modified ? '</Input>' : match;
      });

      if (modified) {
        const relPath = path.relative(path.dirname(fullPath), path.join(process.cwd(), 'src/components/ui/input.tsx')).replace(/\\/g, '/');
        const importStr = `import { Input } from '${relPath.startsWith('.') ? relPath : './' + relPath}';\n`;
        const importStrNoExt = importStr.replace('.tsx', '');

        if (!content.includes('import { Input }')) {
          const lines = content.split('\n');
          let lastImportIdx = -1;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('import ')) lastImportIdx = i;
          }
          if (lastImportIdx !== -1) {
            lines.splice(lastImportIdx + 1, 0, importStrNoExt);
            content = lines.join('\n');
          } else {
            content = importStrNoExt + '\n' + content;
          }
        }
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}
dirs.forEach(d => processDir(path.join(process.cwd(), d)));

// --- TASK 4: Merge kk.json ---
const kkPath = path.join(process.cwd(), 'src/locales/kk.json');
let kk = JSON.parse(fs.readFileSync(kkPath, 'utf8'));

const newKeys = {
  "sidebar": {
    "pos": "Касса",
    "history": "Тарих",
    "warehouse": "Қойма",
    "purchase": "Сатып алу",
    "revision": "Ревизия",
    "counterparties": "Контрагенттер",
    "documents": "Құжаттар",
    "employees": "Қызметкерлер",
    "reports": "Есептер",
    "settings": "Баптаулар"
  },
  "common": {
    "save": "Сақтау",
    "cancel": "Бас тарту",
    "delete": "Жою",
    "edit": "Өңдеу",
    "add": "Қосу",
    "search": "Іздеу",
    "close": "Жабу",
    "confirm": "Растау",
    "yes": "Иә",
    "no": "Жоқ",
    "error": "Қате",
    "success": "Сәтті",
    "loading": "Жүктелуде...",
    "total": "Барлығы",
    "date": "Күні",
    "name": "Атауы",
    "price": "Бағасы",
    "quantity": "Саны",
    "actions": "Әрекеттер"
  },
  "revision": {
    "title": "Ревизия",
    "new": "Жаңа ревизия",
    "start": "Ревизияны бастау",
    "cancel": "Ревизиядан бас тарту",
    "complete": "Аяқтау",
    "print": "Актіні басып шығару",
    "status": {
      "draft": "Жоба",
      "in_progress": "Орындалуда",
      "completed": "Аяқталды",
      "cancelled": "Болдырылмады"
    }
  },
  "warehouse": {
    "title": "Қойма",
    "new_product": "Жаңа тауар",
    "national_catalog": "Ұлттық каталог",
    "barcode": "Штрихкод",
    "category": "Санат",
    "purchase_price": "Сатып алу бағасы",
    "retail_price": "Бөлшек баға",
    "remainder": "Қалдық"
  },
  "pos": {
    "payment": "Төлем",
    "cash": "Қолма-қол",
    "card": "Карта",
    "qr": "QR код",
    "change": "Қайтарым",
    "receipt": "Чек",
    "cancel_sale": "Сатуды болдырмау"
  }
};

for (let key in newKeys) {
  if (kk[key]) {
    kk[key] = { ...kk[key], ...newKeys[key] };
  } else {
    kk[key] = newKeys[key];
  }
}

fs.writeFileSync(kkPath, JSON.stringify(kk, null, 2));

console.log('✅ Updated all inputs and merged kk.json');
