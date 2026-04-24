import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import type { User, Company } from '../vite-env';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Loader2, Database, Wifi, WifiOff, ChevronDown, ShieldCheck, KeyRound, CheckCircle } from 'lucide-react';
import { KeyboardIcon } from '../components/KeyboardIcon';
import { Input } from '../components/ui/input';
import { useCompanyStore } from '../store/companyStore';
import { useSettingsStore } from '../store/settings';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';


export default function Login() {
  const setSidebarName = useCompanyStore(state => state.setCompanyName);
  const { setCompanyDetails } = useSettingsStore();

  const [users, setUsers] = useState<Pick<User, 'id' | 'username' | 'full_name' | 'role'>[]>([]);
  const [company, setCompany] = useState<Company | null>(null);

  const [selectedUser, setSelectedUser] = useState<string>('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Recovery process
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState(1); // 1 = enter key, 2 = new password
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);

  // Custom dropdown
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Network modal
  const [showNetwork, setShowNetwork] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const { t, i18n } = useTranslation();
  const [networkMode, setNetworkMode] = useState<string>('standalone');
  const [serverIP, setServerIP] = useState('');
  const [networkLoading, setNetworkLoading] = useState(false);

  const setAuth = useAuthStore((state) => state.setAuth);
  const navigate = useNavigate();

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadNetworkStatus = async () => {
    try {
      const res = await window.electronAPI.network.status();
      if (res.success && res.data) {
        setNetworkMode(res.data.mode);
        if (res.data.serverUrl) setServerIP(res.data.serverUrl.replace(/:8765$/, ''));
      }
    } catch { }
  };

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const companyRes = await window.electronAPI.auth.getDefaultCompany();
      if (companyRes.success && companyRes.data) {
        setCompany(companyRes.data);
        // Синхронизируем название во всех хранилищах
        setSidebarName(companyRes.data.name);
        setCompanyDetails({ companyName: companyRes.data.name });

        const usersRes = await window.electronAPI.auth.getUsers(companyRes.data.id);
        if (usersRes.success && usersRes.data) {
          setUsers(usersRes.data);
        } else {
          toast.error(usersRes.error || t('login.dbError'));
        }
      } else {
        toast.error(companyRes.error || t('login.companyError'));
      }
    } catch (error) {
      toast.error(t('login.networkError'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
    loadNetworkStatus();
  }, []);

  const handleConnect = async () => {
    if (!serverIP.trim()) { toast.error(t('setup.enterIPError')); return; }
    setNetworkLoading(true);
    try {
      const res = await window.electronAPI.network.connect(serverIP.trim());
      if (res.success) {
        toast.success(t('setup.connectSuccess'));
        loadNetworkStatus();
        setShowNetwork(false);
        // Перезагружаем список пользователей с сервера
        setIsLoading(true);
        await fetchInitialData();
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
      loadNetworkStatus();
      setShowNetwork(false);
      // Перезагружаем список пользователей локальной БД
      setIsLoading(true);
      await fetchInitialData();
    } catch { }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !password) {
      toast.error(t('login.enterDetailsError'));
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await window.electronAPI.auth.login(selectedUser, password);

      if (res.success && res.data && company) {
        setAuth(res.data, company);
        toast.success(`${t('login.welcome')}, ${res.data.full_name}!`);
        navigate('/dashboard');
      } else {
        toast.error(res.error || t('login.authError'));
      }
    } catch (error) {
      toast.error(t('login.systemError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyKey = async () => {
    if (!recoveryKeyInput.trim()) return;
    setRecoveryLoading(true);
    try {
      const res = await window.electronAPI.auth.verifyRecoveryKey(recoveryKeyInput.trim().toUpperCase());
      if (res.success) {
        setRecoveryStep(2);
      } else {
        toast.error(t('recovery.keyError'));
      }
    } catch {
      toast.error(t('login.systemError'));
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 6) return toast.error(t('setup.passwordLengthError'));
    if (newPassword !== confirmNewPassword) return toast.error(t('setup.passwordsNoMatch'));

    setRecoveryLoading(true);
    try {
      const res = await window.electronAPI.auth.resetAdminPassword(recoveryKeyInput.trim().toUpperCase(), newPassword);
      if (res.success) {
        toast.success(t('recovery.success'));
        setShowRecovery(false);
        setRecoveryStep(1);
        setRecoveryKeyInput('');
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        toast.error(res.error || t('login.systemError'));
      }
    } catch {
      toast.error(t('login.systemError'));
    } finally {
      setRecoveryLoading(false);
    }
  };

  const selectedUserObj = users.find(u => u.id === selectedUser);

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    setShowLangMenu(false);
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return t('login.admin');
      case 'cashier': return t('login.cashier');
      case 'manager': return t('login.manager');
      case 'accountant': return t('login.accountant');
      default: return role;
    }
  };

  if (isLoading) {
    return <div className="h-screen w-full flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>;
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header — осветлённый фон */}
        <div
          className="px-8 py-10 text-center relative"
          style={{ background: 'hsl(222, 47%, 22%)' }}
        >
          {/* Language Switcher */}
          <div className="absolute top-4 right-4 z-50">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLangMenu(!showLangMenu)}
                className="flex items-center gap-2 px-2 py-1 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-[10px] font-bold text-white transition-all shadow-sm"
              >
                <Globe className="w-3" />
                {i18n.language.toLowerCase().includes('en') || i18n.language.toLowerCase().includes('gb') ? 'EN' : i18n.language.toUpperCase()}
              </button>
              {showLangMenu && (
                <div className="absolute top-8 right-0 w-32 bg-white border border-gray-100 rounded-xl shadow-2xl py-2 animate-in fade-in zoom-in-95 duration-150">
                  {[
                    { code: 'ru', label: 'Русский', flag: '🇷🇺' },
                    { code: 'kk', label: 'Қазақша', flag: '🇰🇿' },
                    { code: 'en', label: 'English', flag: 'en' }
                  ].map(item => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => handleLanguageChange(item.code)}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between group"
                    >
                      <span className="flex items-center gap-2">
                        <span>{item.flag}</span>
                        <span className={i18n.language === item.code ? 'font-bold text-primary' : 'text-gray-700'}>{item.label}</span>
                      </span>
                      {i18n.language === item.code && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <img src="./easykassa.png" alt="EasyKassa" className="h-14 w-auto mx-auto mb-3 object-contain" />
          <p className="text-white/80">{company?.name || t('login.title')}</p>
        </div>

        <form onSubmit={handleLogin} className="px-8 py-8 space-y-6">
          {/* Кастомный выпадающий список */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('login.employee')}</label>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => !isSubmitting && setDropdownOpen(!dropdownOpen)}
                disabled={isSubmitting}
                className={`w-full px-4 py-3 rounded-lg border bg-white text-left flex items-center justify-between transition-colors
                  ${dropdownOpen ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-300 hover:border-gray-400'}
                  ${isSubmitting ? 'bg-gray-100 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <span className={selectedUserObj ? 'text-gray-900' : 'text-gray-400'}>
                  {selectedUserObj
                    ? `${selectedUserObj.full_name} (${getRoleLabel(selectedUserObj.role)})`
                    : t('login.selectEmployee')}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                  {/* Пустой пункт */}
                  <div
                    onClick={() => { setSelectedUser(''); setDropdownOpen(false); }}
                    className="px-4 py-3 text-gray-400 hover:bg-gray-50 cursor-pointer transition-colors text-sm"
                  >
                    {t('login.selectEmployee')}
                  </div>
                  {users.map(user => (
                    <div
                      key={user.id}
                      onClick={() => { setSelectedUser(user.id); setDropdownOpen(false); }}
                      className={`px-4 py-3 cursor-pointer transition-colors text-sm flex items-center justify-between
                        ${user.id === selectedUser
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-50'
                        }
                      `}
                    >
                      <span className="font-medium">{user.full_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${user.id === selectedUser ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                        }`}>
                        {getRoleLabel(user.role)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Поле пароля с иконкой глаза */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('login.password')}</label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value.substring(0, 75))}
                className="w-full px-4 py-3 pr-20 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder={t('login.passwordPlaceholder')}
                maxLength={75}
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-10 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
              >
                {showPassword
                  ? <EyeOff className="w-4 h-4" />
                  : <Eye className="w-4 h-4" />
                }
              </button>
              <KeyboardIcon />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !selectedUser || !password}
            className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-4 rounded-lg shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
          >
            {isSubmitting ? (
              <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
            ) : (
              t('login.button')
            )}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setShowRecovery(true);
                setRecoveryStep(1);
              }}
              className="text-xs font-semibold text-gray-500 hover:text-primary transition-colors hover:underline"
            >
              {t('recovery.forgotPassword')}
            </button>
          </div>
        </form>

        {/* Network Button */}
        <div className="px-8 pb-8 flex justify-center">
          <button
            onClick={() => setShowNetwork(true)}
            className="flex items-center justify-center gap-2 text-sm font-medium text-gray-500 hover:text-primary transition-colors"
          >
            <Database className="w-4 h-4" />
            {t('setup.dbConnection')}
            <span className={`ml-1 w-2 h-2 rounded-full ${networkMode === 'client' ? 'bg-blue-500' : 'bg-gray-400'}`}></span>
          </button>
        </div>
      </div>

      {/* Network Modal */}
      {showNetwork && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 bg-gray-50 flex justify-between items-center border-b">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" /> {t('setup.terminalConnection')}
              </h3>
              <button onClick={() => setShowNetwork(false)} className="text-gray-400 hover:text-gray-600 font-bold">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-500">{t('setup.terminalDesc')}</p>

              {networkMode === 'client' ? (
                <>
                  <div className="p-3 bg-blue-50 text-blue-800 rounded-lg text-sm border border-blue-200 font-medium">
                    ✅ {t('setup.terminalConnectedTo')} {serverIP}
                  </div>
                  <button onClick={handleDisconnect} className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-medium border border-red-200 flex justify-center items-center gap-2 transition-colors">
                    <WifiOff className="w-4 h-4" /> {t('setup.disconnect')}
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('setup.serverIPLabel')}</label>
                    <Input
                      value={serverIP}
                      onChange={(e) => setServerIP(e.target.value)}
                      placeholder={t('setup.serverIPPlaceholder')}
                      className="font-mono"
                    />
                  </div>
                  <button onClick={handleConnect} disabled={networkLoading} className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium flex justify-center items-center gap-2 transition-colors disabled:opacity-50">
                    {networkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                    {t('setup.connect')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Recovery Modal */}
      {showRecovery && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b bg-gray-50 flex justify-between items-center text-center">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                {t('recovery.modalTitle')}
              </h3>
              <button
                onClick={() => !recoveryLoading && setShowRecovery(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-xl"
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-6">
              {recoveryStep === 1 ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                  <div className="text-center space-y-2">
                    <KeyRound className="w-10 h-10 text-emerald-500 mx-auto" />
                    <p className="text-sm text-gray-500">{t('recovery.enterKey')}</p>
                  </div>
                  <div className="relative">
                    <Input
                      value={recoveryKeyInput}
                      onChange={e => {
                        const val = e.target.value.toUpperCase();
                        // Разрешаем только буквы, цифры и тире
                        setRecoveryKeyInput(val.replace(/[^A-Z0-9-]/g, ''));
                      }}
                      placeholder={t('recovery.keyPlaceholder')}
                      className="text-center font-mono text-lg tracking-wider border-2 focus:border-emerald-500 rounded-xl py-6"
                      maxLength={25}
                      autoFocus
                    />
                    <KeyboardIcon />
                  </div>
                  <button
                    onClick={handleVerifyKey}
                    disabled={recoveryLoading || recoveryKeyInput.length < 10}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {recoveryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {t('recovery.verifyButton')}
                  </button>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                  <div className="text-center space-y-2">
                    <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
                    <h4 className="font-bold text-gray-900">{t('recovery.resetTitle')}</h4>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-tight">{t('recovery.newPassword')}</label>
                      <div className="relative">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          className="w-full py-3 border-2 focus:border-emerald-500 rounded-xl"
                          placeholder={t('login.passwordPlaceholder')}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-10 top-1/2 -translate-y-1/2 p-2 text-gray-400"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <KeyboardIcon />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-tight">{t('recovery.repeatPassword')}</label>
                      <div className="relative">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          value={confirmNewPassword}
                          onChange={e => setConfirmNewPassword(e.target.value)}
                          className={`w-full py-3 border-2 rounded-xl ${confirmNewPassword && newPassword === confirmNewPassword ? 'border-green-500' : 'focus:border-emerald-500'}`}
                        />
                        <KeyboardIcon />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleResetPassword}
                    disabled={recoveryLoading || !newPassword || newPassword !== confirmNewPassword}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {recoveryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {t('recovery.resetButton')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
