import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useTranslation } from 'react-i18next';
import easykassaLogo from '../assets/easykassa.png';
import { useCompanyStore } from '../store/companyStore';
import {
  LayoutDashboard,
  ShoppingCart,
  Undo2,
  Package,
  Users,
  Building2,
  FileSignature,
  FileText,
  Settings,
  LogOut,
  Truck,
  ClipboardCheck,
  Minus,
  X
} from 'lucide-react';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore();
  const { companyName } = useCompanyStore();
  const location = useLocation();
  const { t } = useTranslation();

  const navigation = [
    { nameKey: 'nav.pos', href: '/pos', icon: ShoppingCart, permissionKey: 'pos' },
    { nameKey: 'История', href: '/history', icon: FileText, permissionKey: 'returns' },
    { nameKey: 'nav.inventory', href: '/inventory', icon: Package, permissionKey: 'inventory' },
    { nameKey: 'nav.purchases', href: '/purchases', icon: Truck, permissionKey: 'purchases' },
    { nameKey: 'Ревизия', href: '/revisions', icon: ClipboardCheck, permissionKey: 'inventory' },
    { nameKey: 'nav.clients', href: '/clients', icon: Building2, permissionKey: 'clients' },
    { nameKey: 'documents.title', href: '/documents', icon: FileSignature, permissionKey: 'documents' },
    { nameKey: 'staff.title', href: '/staff', icon: Users, permissionKey: 'staff' },
    { nameKey: 'nav.reports', href: '/reports', icon: FileText, permissionKey: 'reports' },
    { nameKey: 'nav.settings', href: '/settings', icon: Settings, permissionKey: 'settings' },
  ];

  // Предустановленные права по ролям (дубль из Personnel, можно вынести в константы)
  const ROLE_PERMISSIONS: Record<string, string[]> = {
    admin: ['pos', 'returns', 'inventory', 'purchases', 'clients', 'documents', 'reports', 'staff', 'settings'],
    manager: ['pos', 'returns', 'inventory', 'purchases', 'clients', 'documents', 'reports', 'staff'],
    cashier: ['pos', 'returns'],
    accountant: ['reports', 'inventory', 'purchases', 'clients', 'documents'],
  };

  const filteredNavigation = navigation.filter(item => {
    if (!user) return false;

    // Администратор видит всё всегда
    if (user.role === 'admin') return true;

    // Проверяем, есть ли права в базе роли
    const basePermissions = ROLE_PERMISSIONS[user.role] || [];
    const hasBasePermission = basePermissions.includes(item.permissionKey);

    // Проверяем дополнительные права пользователя
    const hasExtraPermission = user.permissions && user.permissions[item.permissionKey] === true;

    return hasBasePermission || hasExtraPermission;
  });

  const roleLabel = (role?: string) => {
    switch (role) {
      case 'admin': return t('staff.admin');
      case 'manager': return t('staff.manager');
      case 'cashier': return t('staff.cashier');
      case 'accountant': return t('staff.accountant');
      default: return role || '';
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg flex flex-col justify-between">
        <div>
          <div className="h-24 flex items-center justify-center p-4 bg-white border-b border-gray-100">
            <img src={easykassaLogo} alt="EasyKassa" className="h-full w-auto object-contain" />
          </div>

          <div className="px-4 py-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {t('app.company')}
            </div>
            <div className="text-sm font-medium text-gray-900 truncate">
              {companyName}
            </div>
          </div>

          <nav className="px-3 mt-4 space-y-1">
            {filteredNavigation.map((item) => {
              const active = location.pathname.startsWith(item.href);
              return (
                <Link
                  key={item.nameKey}
                  to={item.href}
                  className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active
                    ? 'bg-primary/10 text-primary'
                    : 'text-gray-700 hover:bg-gray-100'
                    }`}
                >
                  <item.icon
                    className={`mr-3 h-5 w-5 ${active ? 'text-primary' : 'text-gray-400'}`}
                  />
                  {t(item.nameKey)}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
              {user?.full_name.charAt(0)}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-700 truncate w-36">{user?.full_name}</p>
              <p className="text-xs text-gray-500">{roleLabel(user?.role)}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center px-3 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors"
          >
            <LogOut className="mr-3 h-5 w-5 text-red-500" />
            {t('common.cancel') === 'Бас тарту' ? 'Шығу' : 'Выйти'}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden relative pt-10">
        <main className="flex-1 overflow-y-auto bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
}

