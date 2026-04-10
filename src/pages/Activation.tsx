import { useState, useEffect } from 'react';
import { useLicenseStore } from '../store/license';
import { ShieldAlert, Loader2, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { KeyboardIcon } from '../components/KeyboardIcon';
import easykassaLogo from '../assets/easykassa.png';
import { Input } from '../components/ui/input';


export default function Activation() {
  const { error, activate, checkLicense, isChecking } = useLicenseStore();
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    checkLicense();
  }, [checkLicense]);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      toast.error('Введите ключ активации');
      return;
    }

    setLoading(true);
    setLastError(null);
    const res = await activate(key.trim());
    setLoading(false);

    if (res.success) {
      toast.success('Программа успешно активирована!');
    } else {
      const errMsg = res.message || 'Ошибка активации';
      setLastError(errMsg);
      toast.error(errMsg);
    }
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
        <div className="bg-primary/5 py-6 flex flex-col items-center border-b border-gray-100">
          <img src={easykassaLogo} alt="EasyKassa" className="h-14 w-auto object-contain mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 text-center">Требуется активация</h2>
          <p className="text-red-600 text-center mt-2 font-medium">
            {error === 'not_activated' ? 'Лицензия не установлена' :
              error === 'offline_expired' ? 'Истек срок работы без интернета (24 ч)' :
                error || 'Лицензия недействительна'}
          </p>
        </div>

        <div className="p-6">
          <form onSubmit={handleActivate} className="space-y-4">
            <div>
              <label htmlFor="key" className="block text-sm font-medium text-gray-700 mb-1">
                Ключ активации
              </label>
              <div className="relative">
                <KeyRound className="absolute w-5 h-5 text-gray-400 left-3 top-1/2 -translate-y-1/2" />
                <Input
                  id="key"
                  type="text"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-all font-mono tracking-wider"
                  placeholder="XXXX-XXXX-XXXX-XXXX"
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
                'Активировать программу'
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


