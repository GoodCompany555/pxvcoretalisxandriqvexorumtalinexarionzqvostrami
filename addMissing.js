const fs = require('fs');

const missing = {
  purchases: {
    ru: {
      "fillRequired": "Введите название поставщика",
      "saving": "Сохранение...",
      "deleting": "Удаление...",
      "noItemsError": "Добавьте хотя бы один товар",
      "creating": "Создание накладной...",
      "completing": "Проведение накладной..."
    },
    en: {
      "fillRequired": "Enter supplier name",
      "saving": "Saving...",
      "deleting": "Deleting...",
      "noItemsError": "Add at least one product",
      "creating": "Creating invoice...",
      "completing": "Completing invoice..."
    },
    kk: {
      "fillRequired": "Жеткізуші атауын енгізіңіз",
      "saving": "Сақтау...",
      "deleting": "Жою...",
      "noItemsError": "Кем дегенде бір тауарды қосыңыз",
      "creating": "Жүкқұжатты жасау...",
      "completing": "Жүкқұжатты өткізу..."
    }
  },
  common: {
    ru: { "ready": "Готово" },
    en: { "ready": "Ready" },
    kk: { "ready": "Дайын" }
  },
  inventory: {
    ru: { "product": "Товар(ов)" },
    en: { "product": "Product(s)" },
    kk: { "product": "Тауар(лар)" }
  },
  reports: {
    ru: { "topProducts": "Топ продаваемых товаров" },
    en: { "topProducts": "Top Selling Products" },
    kk: { "topProducts": "Көп сатылатын тауарлар" }
  }
};

const dirs = [
  { file: 'src/locales/ru.json', lang: 'ru' },
  { file: 'src/locales/en.json', lang: 'en' },
  { file: 'src/locales/kk.json', lang: 'kk' }
];

dirs.forEach(({ file, lang }) => {
  const json = JSON.parse(fs.readFileSync(file, 'utf-8'));

  if (!json.purchases) json.purchases = {};
  Object.assign(json.purchases, missing.purchases[lang]);

  if (!json.common) json.common = {};
  Object.assign(json.common, missing.common[lang]);

  if (!json.inventory) json.inventory = {};
  Object.assign(json.inventory, missing.inventory[lang]);

  if (!json.reports) json.reports = {};
  Object.assign(json.reports, missing.reports[lang]);

  fs.writeFileSync(file, JSON.stringify(json, null, 2), 'utf-8');
});

console.log("Successfully injected remaining keys!");
