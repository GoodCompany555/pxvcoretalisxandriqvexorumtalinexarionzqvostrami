import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useTranslation } from 'react-i18next';
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
  Shuffle,
  Minus,
  X,
  ArrowRightLeft,
  BarChart3
} from 'lucide-react';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore();
  const { companyName } = useCompanyStore();
  const location = useLocation();
  const { t } = useTranslation();

  const navigation = [
    { nameKey: 'nav.pos', href: '/pos', icon: ShoppingCart, permissionKey: 'pos' },
    { nameKey: 'purchaseHistory.title', href: '/history', icon: FileText, permissionKey: 'returns' },
    { nameKey: 'nav.inventory', href: '/inventory', icon: Package, permissionKey: 'inventory' },
    { nameKey: 'nav.purchases', href: '/purchases', icon: Truck, permissionKey: 'purchases' },
    { nameKey: 'revision.title', href: '/revisions', icon: ClipboardCheck, permissionKey: 'inventory' },
    { nameKey: 'resorting.title', href: '/resortings', icon: Shuffle, permissionKey: 'inventory' },
    { nameKey: 'warehouse.transfers', href: '/transfers', icon: ArrowRightLeft, permissionKey: 'inventory' },
    { nameKey: 'nav.clients', href: '/clients', icon: Building2, permissionKey: 'clients' },
    { nameKey: 'documents.title', href: '/documents', icon: FileSignature, permissionKey: 'documents' },
    { nameKey: 'staff.title', href: '/staff', icon: Users, permissionKey: 'staff' },
    { nameKey: 'nav.reports', href: '/reports', icon: FileText, permissionKey: 'reports' },
    { nameKey: 'valuation.title', href: '/valuation', icon: BarChart3, permissionKey: 'reports' },
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
      <div className="w-64 min-w-[256px] bg-white shadow-lg flex flex-col">
        {/* Logo — fixed at top */}
        <div className="h-20 flex-shrink-0 flex items-center justify-center p-3 bg-white border-b border-gray-100">
          <img src="./easykassa.png" alt="EasyKassa" className="h-full w-auto object-contain" />
        </div>

        {/* Company name */}
        <div className="px-4 py-3 flex-shrink-0">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            {t('app.company')}
          </div>
          <div className="text-sm font-medium text-gray-900 truncate">
            {companyName}
          </div>
        </div>

        {/* Navigation — scrollable area */}
        <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5 scrollbar-thin">
          {filteredNavigation.map((item) => {
            const active = location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.nameKey}
                to={item.href}
                className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-700 hover:bg-gray-100'
                  }`}
              >
                <item.icon
                  className={`mr-3 h-4.5 w-4.5 flex-shrink-0 ${active ? 'text-primary' : 'text-gray-400'}`}
                />
                <span className="truncate">{t(item.nameKey)}</span>
              </Link>
            );
          })}
        </nav>

        {/* User info — fixed at bottom */}
        <div className="flex-shrink-0 p-3 border-t border-gray-200">
          <div className="flex items-center mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold flex-shrink-0">
              {user?.full_name.charAt(0)}
            </div>
            <div className="ml-3 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">{user?.full_name}</p>
              <p className="text-xs text-gray-500">{roleLabel(user?.role)}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center px-3 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors"
          >
            <LogOut className="mr-3 h-5 w-5 text-red-500" />
            {t('nav.logout', 'Выйти')}
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

