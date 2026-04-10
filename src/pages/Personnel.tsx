import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth';
import { Users, Plus, Edit2, Shield, EyeOff, Eye, Loader2, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { KeyboardIcon } from '../components/KeyboardIcon';
import { Input } from '../components/ui/input';


type UserRole = 'admin' | 'manager' | 'cashier' | 'accountant';

interface User {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  iin?: string;
  pin_code?: string;
  is_active: number;
  permissions?: Record<string, boolean>;
}

// Перечень прав доступа
const ALL_PERMISSIONS = [
  { key: 'pos', label: 'Касса (Продажи)' },
  { key: 'returns', label: 'Возвраты' },
  { key: 'inventory', label: 'Склад' },
  { key: 'purchases', label: 'Закупки' },
  { key: 'clients', label: 'Контрагенты' },
  { key: 'documents', label: 'Документы' },
  { key: 'reports', label: 'Отчёты' },
  { key: 'staff', label: 'Управление персоналом' },
  { key: 'settings', label: 'Настройки' },
] as const;

// Предустановленные права по ролям
const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ALL_PERMISSIONS.map(p => p.key),
  manager: ['pos', 'returns', 'inventory', 'purchases', 'clients', 'documents', 'reports', 'staff'],
  cashier: ['pos', 'returns'],
  accountant: ['reports', 'inventory', 'purchases', 'clients', 'documents'],
};

export default function Personnel() {
  const companyId = useAuthStore(state => state.company?.id);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('cashier');
  const [iin, setIin] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Дополнительные права (кастомные)
  const [extraPermissions, setExtraPermissions] = useState<Record<string, boolean>>({});

  const currentUserRole = useAuthStore(state => state.user?.role);

  const fetchUsers = async () => {
    if (!companyId || !window.electronAPI?.users) return;
    setLoading(true);
    const res = await window.electronAPI.users.getAll(companyId);
    if (res.success && res.data) {
      setUsers(res.data);
    } else {
      toast.error('Ошибка загрузки сотрудников');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, [companyId]);

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setUsername(user.username);
      setPassword(''); // Не показываем старый пароль
      setFullName(user.full_name);
      setRole(user.role);
      setIin(user.iin || '');
      setPinCode(user.pin_code || '');
      setIsActive(user.is_active === 1);
      setExtraPermissions(user.permissions || {});
    } else {
      setEditingUser(null);
      setUsername('');
      setPassword('');
      setFullName('');
      setRole('cashier');
      setIin('');
      setPinCode('');
      setIsActive(true);
      setExtraPermissions({});
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !window.electronAPI?.users) return;

    if (!editingUser && !password) {
      toast.error('Введите пароль для нового сотрудника');
      return;
    }

    const payload = {
      id: editingUser?.id,
      companyId,
      username,
      password: password || undefined,
      fullName,
      role,
      iin,
      pinCode,
      isActive,
      permissions: extraPermissions
    };

    const loadingToast = toast.loading('Сохранение...');

    let res;
    if (editingUser) {
      res = await window.electronAPI.users.update(payload);
    } else {
      res = await window.electronAPI.users.create(payload);
    }

    if (res.success) {
      toast.success(editingUser ? 'Изменения сохранены' : 'Сотрудник добавлен', { id: loadingToast });
      setIsModalOpen(false);
      fetchUsers();
    } else {
      toast.error(res.error || 'Ошибка', { id: loadingToast });
    }
  };

  const handleToggleStatus = async (user: User) => {
    if (!companyId || !window.electronAPI?.users) return;
    const newStatus = user.is_active === 1 ? false : true;
    const res = await window.electronAPI.users.toggleStatus(companyId, user.id, newStatus);
    if (res.success) {
      toast.success(`Сотрудник ${newStatus ? 'активирован' : 'деактивирован'}`);
      fetchUsers();
    } else {
      toast.error('Ошибка изменения статуса');
    }
  };

  const roleColors: Record<UserRole, string> = {
    admin: 'bg-purple-100 text-purple-800',
    manager: 'bg-amber-100 text-amber-800',
    cashier: 'bg-blue-100 text-blue-800',
    accountant: 'bg-emerald-100 text-emerald-800',
  };

  const roleNames: Record<UserRole, string> = {
    admin: 'Администратор',
    manager: 'Менеджер',
    cashier: 'Кассир',
    accountant: 'Бухгалтер',
  };

  // Получить права текущей выбранной роли
  const currentPermissions = ROLE_PERMISSIONS[role] || [];

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Персонал</h1>
          <p className="text-gray-500 mt-1">Управление сотрудниками, ролями и доступом</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl hover:bg-primary-hover transition-colors font-medium shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Добавить сотрудника
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Сотрудник</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Роль</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">ПИН-код</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Статус</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900">{user.full_name}</span>
                      <span className="text-sm text-gray-500">@{user.username}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${roleColors[user.role] || 'bg-gray-100 text-gray-800'}`}>
                      {roleNames[user.role] || user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-gray-500 text-sm">
                      <KeyRound className="w-4 h-4" />
                      {user.pin_code ? 'Установлен' : 'Нет'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${user.is_active === 1 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {user.is_active === 1 ? 'Активен' : 'Заблокирован'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleOpenModal(user)}
                      className="text-primary hover:text-primary-hover p-2 transition-colors mr-2"
                      title="Редактировать"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleToggleStatus(user)}
                      className={`${user.is_active === 1 ? 'text-red-500 hover:text-red-700' : 'text-green-500 hover:text-green-700'} p-2 transition-colors`}
                      title={user.is_active ? 'Заблокировать' : 'Активировать'}
                    >
                      {user.is_active === 1 ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <Users className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                    <p>Сотрудники не найдены</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">
                {editingUser ? 'Редактировать сотрудника' : 'Новый сотрудник'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ФИО</label>
                <div className="relative">
                  <Input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-2 pr-10 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="Иванов Иван"
                  />
                  <KeyboardIcon />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Логин</label>
                  <div className="relative">
                    <Input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-4 py-2 pr-10 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
                      placeholder="ivan"
                    />
                    <KeyboardIcon />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
                  <Input
                    type="password"
                    required={!editingUser}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder={editingUser ? 'Оставить старый' : '••••••'}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ПИН-код (цифры)</label>
                  <div className="relative">
                    <Input
                      type="text"
                      maxLength={4}
                      pattern="[0-9]*"
                      value={pinCode}
                      onChange={(e) => setPinCode(e.target.value)}
                      className="w-full px-4 py-2 pr-10 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
                      placeholder="1234"
                    />
                    <KeyboardIcon />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ИИН</label>
                  <div className="relative">
                    <Input
                      type="text"
                      maxLength={12}
                      value={iin}
                      onChange={(e) => setIin(e.target.value)}
                      className="w-full px-4 py-2 pr-10 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary font-mono"
                      placeholder="010101501501"
                    />
                    <KeyboardIcon />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Роль</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="admin">Администратор</option>
                  <option value="manager">Менеджер</option>
                  <option value="cashier">Кассир</option>
                  <option value="accountant">Бухгалтер</option>
                </select>
              </div>

              {/* Блок отображения прав по роли */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Права доступа для роли «{roleNames[role]}»
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_PERMISSIONS.map(perm => {
                    const isBasePermission = currentPermissions.includes(perm.key);
                    const isExtraGranted = extraPermissions[perm.key];
                    const isGranted = isBasePermission || isExtraGranted;

                    return (
                      <div key={perm.key} className="flex items-center gap-2 text-sm">
                        {currentUserRole === 'admin' ? (
                          <input
                            type="checkbox"
                            checked={isGranted}
                            disabled={isBasePermission} // Нельзя забрать базовые права роли
                            onChange={(e) => {
                              setExtraPermissions(prev => ({
                                ...prev,
                                [perm.key]: e.target.checked
                              }));
                            }}
                            className={`w-4 h-4 rounded focus:ring-primary ${isBasePermission ? 'text-gray-400 bg-gray-200' : 'text-primary'}`}
                          />
                        ) : (
                          <span className={`w-2 h-2 rounded-full ${isGranted ? 'bg-green-500' : 'bg-gray-300'}`} />
                        )}
                        <span className={isGranted ? 'text-gray-800' : 'text-gray-400'}>
                          {perm.label} {isExtraGranted && !isBasePermission && <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded ml-1">Доп</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {editingUser && (
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 text-primary bg-gray-100 border-gray-300 rounded focus:ring-primary"
                  />
                  <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                    Аккаунт активен
                  </label>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors border border-gray-200"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary text-white font-medium rounded-xl hover:bg-primary-hover transition-colors"
                >
                  {editingUser ? 'Сохранить' : 'Добавить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
