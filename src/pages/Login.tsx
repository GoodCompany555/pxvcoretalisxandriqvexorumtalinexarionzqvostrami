import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import type { User, Company } from '../vite-env';
import toast from 'react-hot-toast';
import easykassaLogo from '../assets/easykassa.png';
import { KeyboardIcon } from '../components/KeyboardIcon';
import { Input } from '../components/ui/input';
import { Database, Wifi, WifiOff, Loader2, ChevronDown, Eye, EyeOff } from 'lucide-react';


export default function Login() {
  const [users, setUsers] = useState<Pick<User, 'id' | 'username' | 'full_name' | 'role'>[]>([]);
  const [company, setCompany] = useState<Company | null>(null);

  const [selectedUser, setSelectedUser] = useState<string>('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);

  // Custom dropdown
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Network modal
  const [showNetwork, setShowNetwork] = useState(false);
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

        const usersRes = await window.electronAPI.auth.getUsers(companyRes.data.id);
        if (usersRes.success && usersRes.data) {
          setUsers(usersRes.data);
        } else {
          toast.error(usersRes.error || 'Не удалось загрузить пользователей');
        }
      } else {
        toast.error(companyRes.error || 'Не найдена компания');
      }
    } catch (error) {
      toast.error('Ошибка связи с сервером');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
    loadNetworkStatus();
  }, []);

  const handleConnect = async () => {
    if (!serverIP.trim()) { toast.error('Введите IP адрес сервера'); return; }
    setNetworkLoading(true);
    try {
      const res = await window.electronAPI.network.connect(serverIP.trim());
      if (res.success) {
        toast.success('Подключено к серверу!');
        loadNetworkStatus();
        setShowNetwork(false);
        // Перезагружаем список пользователей с сервера
        setIsLoading(true);
        await fetchInitialData();
      } else {
        toast.error(res.error || 'Ошибка подключения');
      }
    } catch { toast.error('Ошибка подключения'); }
    finally { setNetworkLoading(false); }
  };

  const handleDisconnect = async () => {
    try {
      await window.electronAPI.network.disconnect();
      toast.success('Отключено от сервера');
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
      toast.error('Выберите пользователя и введите пароль');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await window.electronAPI.auth.login(selectedUser, password);

      if (res.success && res.data && company) {
        setAuth(res.data, company);
        toast.success(`Добро пожаловать, ${res.data.full_name}!`);
        navigate('/dashboard');
      } else {
        toast.error(res.error || 'Ошибка авторизации');
      }
    } catch (error) {
      toast.error('Внутренняя ошибка');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedUserObj = users.find(u => u.id === selectedUser);

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Администратор';
      case 'cashier': return 'Кассир';
      case 'manager': return 'Менеджер';
      case 'accountant': return 'Бухгалтер';
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
          className="px-8 py-10 text-center"
          style={{ background: 'hsl(222, 47%, 22%)' }}
        >
          <img src={easykassaLogo} alt="EasyKassa" className="h-14 w-auto mx-auto mb-3 object-contain" />
          <p className="text-white/80">{company?.name || 'Система автоматизации'}</p>
        </div>

        <form onSubmit={handleLogin} className="px-8 py-8 space-y-6">
          {/* Кастомный выпадающий список */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Сотрудник</label>
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
                    : '-- Выберите пользователя --'}
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
                    -- Выберите пользователя --
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Пароль</label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 pr-20 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="Введите пароль"
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
              'Войти в систему'
            )}
          </button>
        </form>

        {/* Network Button */}
        <div className="px-8 pb-8 flex justify-center">
          <button
            onClick={() => setShowNetwork(true)}
            className="flex items-center justify-center gap-2 text-sm font-medium text-gray-500 hover:text-primary transition-colors"
          >
            <Database className="w-4 h-4" />
            Подключение к базе
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
                <Database className="w-4 h-4 text-primary" /> Подключение к серверу
              </h3>
              <button onClick={() => setShowNetwork(false)} className="text-gray-400 hover:text-gray-600 font-bold">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-500">Если на другом компьютере запущен сервер базы данных, введите его IP-адрес здесь.</p>

              {networkMode === 'client' ? (
                <>
                  <div className="p-3 bg-blue-50 text-blue-800 rounded-lg text-sm border border-blue-200 font-medium">
                    ✅ Сейчас подключено к {serverIP}
                  </div>
                  <button onClick={handleDisconnect} className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-medium border border-red-200 flex justify-center items-center gap-2 transition-colors">
                    <WifiOff className="w-4 h-4" /> Отключиться от сервера
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">IP-адрес сервера</label>
                    <Input
                      value={serverIP}
                      onChange={(e) => setServerIP(e.target.value)}
                      placeholder="Например: 192.168.1.100"
                      className="font-mono"
                    />
                  </div>
                  <button onClick={handleConnect} disabled={networkLoading} className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium flex justify-center items-center gap-2 transition-colors disabled:opacity-50">
                    {networkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                    Подключиться
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
