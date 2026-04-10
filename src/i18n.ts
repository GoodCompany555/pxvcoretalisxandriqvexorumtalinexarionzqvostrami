import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ru from './locales/ru.json';
import kk from './locales/kk.json';

// Получить сохранённый язык
const savedLang = localStorage.getItem('pos-language') || 'ru';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ru: { translation: ru },
      kk: { translation: kk },
    },
    lng: savedLang,
    fallbackLng: 'ru',
    interpolation: {
      escapeValue: false, // React уже экранирует
    },
  });

// Подписка на смену языка — сохранять в localStorage
i18n.on('languageChanged', (lng) => {
  localStorage.setItem('pos-language', lng);
});

export default i18n;
