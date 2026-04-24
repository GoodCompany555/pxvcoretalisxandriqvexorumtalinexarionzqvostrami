const fs = require('fs');
const files = [
  'src/pages/Inventory.tsx',
  'src/pages/Purchases.tsx',
  'src/pages/Returns.tsx',
  'src/pages/Dashboard.tsx',
  'src/pages/Activation.tsx',
  'src/components/Layout.tsx'
];
const regex = /t\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?\s*\)/g;
const keys = {};

files.forEach(f => {
  const code = fs.readFileSync(f, 'utf-8');
  let match;
  while ((match = regex.exec(code)) !== null) {
    const key = match[1];
    const def = match[2] || '';
    if (!key.startsWith('common.') && !key.startsWith('reports.') && !key.startsWith('pos.') && !key.startsWith('nav.') && !key.startsWith('staff.') && !key.startsWith('documents.') && !key.startsWith('inventory.')) {
      if (!keys[key]) keys[key] = { def, file: f };
    }
  }
});
console.log(JSON.stringify(keys, null, 2));
