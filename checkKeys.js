const fs = require('fs');
const ru = JSON.parse(fs.readFileSync('src/locales/ru.json', 'utf8'));
const files = [
  'src/pages/Inventory.tsx',
  'src/pages/Purchases.tsx',
  'src/pages/Returns.tsx',
  'src/pages/Dashboard.tsx',
  'src/pages/Activation.tsx',
  'src/components/Layout.tsx'
];
const regex = /t\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?\s*\)/g;
const missing = [];
files.forEach(f => {
  const code = fs.readFileSync(f, 'utf-8');
  let match;
  while ((match = regex.exec(code)) !== null) {
    const fullKey = match[1];
    const def = match[2] || '';
    const parts = fullKey.split('.');
    if (parts.length > 1) {
      if (!ru[parts[0]] || !ru[parts[0]][parts[1]]) {
        missing.push({ key: fullKey, def: def });
      }
    }
  }
});
console.log('Missing count:', missing.length);
if (missing.length > 0) {
  const result = {};
  missing.forEach(m => {
    const p = m.key.split('.');
    if (!result[p[0]]) result[p[0]] = {};
    result[p[0]][p[1]] = m.def;
  });
  console.log(JSON.stringify(result, null, 2));
}
