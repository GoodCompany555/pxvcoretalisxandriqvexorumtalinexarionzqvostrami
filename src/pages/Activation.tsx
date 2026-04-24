import { useState, useEffect } from 'react';
import { useLicenseStore } from '../store/license';
import { ShieldAlert, Loader2, KeyRound, Building2, User, Key, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { KeyboardIcon } from '../components/KeyboardIcon';
import { Input } from '../components/ui/input';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';


export default function Activation() {
  const { error, activate, checkLicense, isChecking } = useLicenseStore();
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const { t, i18n } = useTranslation();
  const [showLangMenu, setShowLangMenu] = useState(false);

  useEffect(() => {
    checkLicense();
  }, [checkLicense]);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      toast.error(t('activation.enterKeyError'));
      return;
    }

    setLoading(true);
    setLastError(null);
    const res = await activate(key.trim());
    setLoading(false);

    if (res.success) {
      toast.success(t('activation.success'));
    } else {
      const errMsg = res.message || t('activation.error');
      setLastError(errMsg);
      toast.error(errMsg);
    }
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    setShowLangMenu(false);
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="bg-primary/5 py-6 flex flex-col items-center border-b border-gray-100 relative">
          {/* Language Switcher */}
          <div className="absolute top-4 right-4 z-50">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLangMenu(!showLangMenu)}
                className="flex items-center gap-2 px-2 py-1 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-600 hover:border-primary transition-all shadow-sm"
              >
                <Globe className="w-3 h-3" />
                {i18n.language.toLowerCase().includes('en') || i18n.language.toLowerCase().includes('gb') ? 'EN' : i18n.language.toUpperCase()}
              </button>
              {showLangMenu && (
                <div className="absolute top-8 right-0 w-32 bg-white border border-gray-100 rounded-xl shadow-2xl py-2 animate-in fade-in zoom-in-95 duration-150">
                  {[
                    { code: 'ru', label: 'Русский', flag: '🇷🇺' },
                    { code: 'kk', label: 'Қазақша', flag: '🇰🇿' },
                    { code: 'en', label: 'English', flag: 'EN' }
                  ].map(item => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => handleLanguageChange(item.code)}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between group"
                    >
                      <span className="flex items-center gap-2">
                        <span>{item.flag}</span>
                        <span className={i18n.language === item.code ? 'font-bold text-primary' : ''}>{item.label}</span>
                      </span>
                      {i18n.language === item.code && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <img src="./easykassa.png" alt="EasyKassa" className="h-14 w-auto object-contain mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 text-center">{t('activation.title')}</h2>
          <p className="text-red-600 text-center mt-2 font-medium">
            {error === 'not_activated' ? t('activation.required') :
              error === 'offline_expired' ? t('activation.offlineExpired') :
                t('activation.invalid')}
          </p>
        </div>

        <div className="p-6">
          <form onSubmit={handleActivate} className="space-y-4">
            <div>
              <label htmlFor="key" className="block text-sm font-medium text-gray-700 mb-1">
                {t('activation.label')}
              </label>
              <div className="relative">
                <KeyRound className="absolute w-5 h-5 text-gray-400 left-3 top-1/2 -translate-y-1/2" />
                <Input
                  id="key"
                  type="text"
                  value={key}
                  onChange={(e) => setKey(e.target.value.substring(0, 75))}
                  className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-all font-mono tracking-wider"
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  maxLength={75}
                  required
                />
                <KeyboardIcon />
              </div>
            </div>

            {lastError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <p className="break-all">{lastError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !key}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-6"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                t('activation.button')
              )}
            </button>
          </form>
        </div>

        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100">
          <p className="text-xs text-center text-gray-400">
            EasyKassa© {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}


