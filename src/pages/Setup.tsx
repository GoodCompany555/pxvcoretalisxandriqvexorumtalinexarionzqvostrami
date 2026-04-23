import { useState, useEffect } from 'react';
import { Building2, User, Lock, Eye, EyeOff, Loader2, CheckCircle, ShieldCheck, Database, Wifi, WifiOff, Globe, Check, Copy, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { Input } from '../components/ui/input';
import { KeyboardIcon } from '../components/KeyboardIcon';
import { useCompanyStore } from '../store/companyStore';
import { useSettingsStore } from '../store/settings';
import { useTranslation } from 'react-i18next';

interface SetupProps {
  onComplete: () => void;
}

export default function Setup({ onComplete }: SetupProps) {
  const setSidebarName = useCompanyStore(state => state.setCompanyName);
  const { setCompanyDetails } = useSettingsStore();

  const [companyName, setCompanyName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1 = company, 2 = admin, 3 = password, 4 = recovery key
  const [recoveryKey, setRecoveryKey] = useState('');
  const [savedConfirmed, setSavedConfirmed] = useState(false);

  // Network modal
  const { t, i18n } = useTranslation();
  const [showNetwork, setShowNetwork] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [networkMode, setNetworkMode] = useState<string>('standalone');
  const [serverIP, setServerIP] = useState('');
  const [networkLoading, setNetworkLoading] = useState(false);

  useEffect(() => {
    const loadNetworkStatus = async () => {
      try {
        const res = await window.electronAPI.network.status();
        if (res.success && res.data) {
          setNetworkMode(res.data.mode);
          if (res.data.serverUrl) setServerIP(res.data.serverUrl.replace(/:8765$/, ''));
        }
      } catch { }
    };
    loadNetworkStatus();
  }, []);

  const handleConnect = async () => {
    if (!serverIP.trim()) { toast.error(t('setup.enterIPError')); return; }
    setNetworkLoading(true);
    try {
      const res = await window.electronAPI.network.connect(serverIP.trim());
      if (res.success) {
        toast.success(t('setup.connectSuccess'));
        window.location.reload();
      } else {
        toast.error(res.error || t('setup.connectError'));
      }
    } catch { toast.error(t('setup.connectError')); }
    finally { setNetworkLoading(false); }
  };

  const handleDisconnect = async () => {
    try {
      await window.electronAPI.network.disconnect();
      toast.success(t('setup.disconnectSuccess'));
      setServerIP('');
      const res = await window.electronAPI.network.status();
      if (res.success && res.data) setNetworkMode(res.data.mode);
      setShowNetwork(false);
    } catch { }
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    setShowLangMenu(false);
  };

  const handleSubmit = async () => {
    if (!companyName.trim()) return toast.error(t('setup.enterShopNameError'));
    if (!adminName.trim()) return toast.error(t('setup.enterAdminNameError'));
    if (password.length < 6) return toast.error(t('setup.passwordLengthError'));
    if (password !== confirmPassword) return toast.error(t('setup.passwordsNoMatch'));

    setLoading(true);
    try {
      const res = await window.electronAPI.auth.completeSetup({
        companyName: companyName.trim(),
        adminName: adminName.trim(),
        password,
      });
      if (res.success && res.data?.recoveryKey) {
        setSidebarName(companyName.trim());
        setCompanyDetails({ companyName: companyName.trim() });
        setRecoveryKey(res.data.recoveryKey);
        setStep(4);
      } else {
        toast.error(res.error || t('setup.saveError'));
      }
    } catch {
      toast.error(t('setup.systemError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gray-300/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gray-400/10 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-lg w-full">
        {/* Language Switcher */}
        <div className="absolute top-0 right-0 z-50">
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:border-primary transition-all shadow-sm"
            >
              <Globe className="w-3.5 h-3.5" />
              {i18n.language.toLowerCase().includes('en') || i18n.language.toLowerCase().includes('gb') ? 'EN' : i18n.language.toUpperCase()}
            </button>
            {showLangMenu && (
              <div className="absolute top-10 right-0 w-32 bg-white border border-gray-100 rounded-xl shadow-2xl py-2 animate-in fade-in zoom-in-95 duration-150">
                {[
                  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
                  { code: 'kk', label: 'Қазақша', flag: '🇰🇿' },
                  { code: 'en', label: 'English', flag: 'EN' }
                ].map(item => (
                  <button
                    key={item.code}
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

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white border border-gray-100 mb-4 shadow-xl">
            {step === 4 ? (
              <ShieldCheck className="w-10 h-10 text-emerald-500" />
            ) : (
              <ShieldCheck className="w-10 h-10 text-blue-600" />
            )}
          </div>
          <h1 className="text-3xl font-black text-gray-900 mb-2">
            {step === 4 ? t('recovery.title') : t('setup.welcomeTitle')}
          </h1>
          <p className="text-gray-500 text-sm">
            {step === 4 ? t('recovery.subtitle') : t('setup.welcomeSubtitle')}
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex justify-center gap-3 mb-8">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${step > s ? 'bg-green-500 text-white scale-90' :
                step === s ? (s === 4 ? 'bg-emerald-600 text-white scale-110 ring-4 ring-emerald-600/20' : 'bg-blue-600 text-white scale-110 ring-4 ring-blue-600/20') :
                  'bg-gray-200 text-gray-400'
                }`}>
                {step > s ? <CheckCircle className="w-5 h-5" /> : s}
              </div>
              {s < 4 && <div className={`w-8 h-0.5 rounded-full transition-all ${step > s ? 'bg-green-500' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-visible">
          <div className="p-8">
            {/* Step 1: Company */}
            {step === 1 && (
              <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="text-center mb-6">
                  <Building2 className="w-12 h-12 text-blue-500 mx-auto mb-3" />
                  <h2 className="text-xl font-bold text-gray-900">{t('setup.step1Title')}</h2>
                  <p className="text-gray-500 text-sm mt-1">{t('setup.step1Subtitle')}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">{t('setup.shopNameLabel')}</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value.substring(0, 75))}
                      className="w-full pl-10 pr-10 py-3 border-2 border-gray-200 rounded-xl text-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                      placeholder={t('setup.shopNamePlaceholder')}
                      maxLength={75}
                      autoFocus
                    />
                    <KeyboardIcon />
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (!companyName.trim()) return toast.error(t('setup.enterShopNameError'));
                    setStep(2);
                  }}
                  className="w-full py-3.5 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/25 active:scale-[0.98]"
                >
                  {t('setup.next')}
                </button>
              </div>
            )}

            {/* Step 2: Admin Name */}
            {step === 2 && (
              <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="text-center mb-6">
                  <User className="w-12 h-12 text-indigo-500 mx-auto mb-3" />
                  <h2 className="text-xl font-bold text-gray-900">{t('setup.step2Title')}</h2>
                  <p className="text-gray-500 text-sm mt-1">{t('setup.step2Subtitle')}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">{t('setup.adminNameLabel')}</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      value={adminName}
                      onChange={e => setAdminName(e.target.value.substring(0, 75))}
                      className="w-full pl-10 pr-10 py-3 border-2 border-gray-200 rounded-xl text-lg focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                      placeholder={t('setup.adminNamePlaceholder')}
                      maxLength={75}
                      autoFocus
                    />
                    <KeyboardIcon />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep(1)} className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all">
                    {t('setup.back')}
                  </button>
                  <button
                    onClick={() => {
                      if (!adminName.trim()) return toast.error(t('setup.enterNameError'));
                      setStep(3);
                    }}
                    className="flex-1 py-3.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/25 active:scale-[0.98]"
                  >
                    {t('setup.next')}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Password */}
            {step === 3 && (
              <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="text-center mb-6">
                  <Lock className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                  <h2 className="text-xl font-bold text-gray-900">{t('setup.step3Title')}</h2>
                  <p className="text-gray-500 text-sm mt-1">{t('setup.step3Subtitle')}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">{t('setup.passwordLabel')}</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full pl-10 pr-20 py-3 border-2 border-gray-200 rounded-xl text-lg focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all"
                      placeholder={t('setup.passwordPlaceholder')}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-10 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <KeyboardIcon />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">{t('setup.confirmPasswordLabel')}</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className={`w-full pl-10 pr-10 py-3 border-2 rounded-xl text-lg transition-all ${confirmPassword && confirmPassword === password
                        ? 'border-green-400 focus:border-green-500 focus:ring-4 focus:ring-green-500/10'
                        : confirmPassword
                          ? 'border-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
                          : 'border-gray-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'
                        }`}
                      placeholder={t('setup.confirmPasswordPlaceholder')}
                    />
                    <KeyboardIcon />
                  </div>
                  {confirmPassword && confirmPassword !== password && (
                    <p className="text-red-500 text-xs mt-1.5 font-medium">{t('setup.passwordsNoMatch')}</p>
                  )}
                  {confirmPassword && confirmPassword === password && (
                    <p className="text-green-600 text-xs mt-1.5 font-medium flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> {t('setup.passwordsMatch')}
                    </p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(2)} className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all">
                    {t('setup.back')}
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={loading || !password || password !== confirmPassword}
                    className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                    {t('setup.finish')}
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Recovery Key */}
            {step === 4 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="p-6 bg-emerald-50 border-2 border-emerald-100 rounded-2xl text-center space-y-4">
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">{t('recovery.keyLabel')}</span>
                  <div className="bg-white border-2 border-emerald-200 py-4 px-2 rounded-xl shadow-sm">
                    <span className="text-2xl md:text-3xl font-mono font-black text-gray-900 tracking-wider">
                      {recoveryKey}
                    </span>
                  </div>
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(recoveryKey);
                        toast.success(t('common.copied'));
                      }}
                      className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 transition-colors flex items-center gap-1.5"
                    >
                      <Copy className="w-3 h-3" /> {t('recovery.copy')}
                    </button>
                    <button
                      onClick={() => {
                        const blob = new Blob([`EASYKASSA RECOVERY KEY\n\nShop: ${companyName}\nAdmin: ${adminName}\nKey: ${recoveryKey}\n\nKEEP THIS IN A SAFE PLACE!`], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `recovery_key_${companyName}.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 transition-colors flex items-center gap-1.5"
                    >
                      <Download className="w-3 h-3" /> {t('recovery.download')}
                    </button>
                  </div>
                </div>

                <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex gap-3 text-red-700">
                  <ShieldCheck className="w-6 h-6 flex-shrink-0" />
                  <p className="text-xs font-medium leading-relaxed">
                    {t('recovery.important')}
                  </p>
                </div>

                <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors border border-gray-200">
                  <input
                    type="checkbox"
                    checked={savedConfirmed}
                    onChange={e => setSavedConfirmed(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm font-semibold text-gray-700">
                    {t('recovery.saveConfirm')}
                  </span>
                </label>

                <button
                  onClick={() => {
                    toast.success(t('setup.setupCompleteMsg'));
                    onComplete();
                  }}
                  disabled={!savedConfirmed}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl transition-all shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-6 h-6" />
                  {t('setup.finish')}
                </button>
              </div>
            )}
          </div>

          <div className="bg-gray-50 px-8 py-4 border-t border-gray-100 flex justify-between items-center">
            <p className="text-xs text-gray-500">
              {t('setup.copyright')} {new Date().getFullYear()}
            </p>
            <button
              onClick={() => setShowNetwork(true)}
              className="flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-blue-600 transition-colors"
            >
              <Database className="w-3.5 h-3.5" />
              {t('setup.dbConnection')}
              <span className={`w-1.5 h-1.5 rounded-full ${networkMode === 'client' ? 'bg-blue-500' : 'bg-gray-300'}`}></span>
            </button>
          </div>
        </div>
      </div>

      {/* Network Modal */}
      {showNetwork && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 bg-gray-50 flex justify-between items-center border-b">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-500" /> {t('setup.terminalConnection')}
              </h3>
              <button onClick={() => setShowNetwork(false)} className="text-gray-400 hover:text-gray-600 font-bold">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-500 leading-relaxed">{t('setup.terminalDesc')}</p>

              {networkMode === 'client' ? (
                <>
                  <div className="p-3 bg-blue-50 text-blue-800 rounded-xl text-sm border border-blue-200 font-medium">
                    ✅ {t('setup.terminalConnectedTo')} {serverIP}
                  </div>
                  <button onClick={handleDisconnect} className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-medium border border-red-200 flex justify-center items-center gap-2 transition-colors">
                    <WifiOff className="w-4 h-4" /> {t('setup.disconnect')}
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('setup.serverIPLabel')}</label>
                    <Input
                      value={serverIP}
                      onChange={(e) => setServerIP(e.target.value)}
                      placeholder={t('setup.serverIPPlaceholder')}
                      className="font-mono bg-gray-50"
                    />
                  </div>
                  <button onClick={handleConnect} disabled={networkLoading} className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold flex justify-center items-center gap-2 transition-colors shadow-md shadow-blue-500/20 disabled:opacity-50">
                    {networkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                    {t('setup.connect')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
