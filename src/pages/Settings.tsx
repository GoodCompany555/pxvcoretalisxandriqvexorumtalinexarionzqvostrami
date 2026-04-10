import React, { useEffect, useState } from 'react';
import { Save, Store, Link as LinkIcon, Wifi, WifiOff, Plus, Trash2, Scale, CreditCard, Globe, CheckCircle, XCircle, Eye, EyeOff, Loader2, Database, FolderOpen, RefreshCcw, Download, Upload } from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { KeyboardIcon } from '../components/KeyboardIcon';
import toast from 'react-hot-toast';
import { useSettingsStore } from '../store/settings';
import { useAuthStore } from '../store/auth';
import { useTranslation } from 'react-i18next';
import { useCompanyStore } from '../store/companyStore';
import { Input } from '../components/ui/input';


const BANKS = ['Halyk Bank', 'Kaspi Bank', 'Forte Bank', 'Jusan Bank', 'BCC', 'Freedom Bank'];
const BAUD_RATES = [9600, 19200, 38400, 57600, 115200];
const SCALE_PROTOCOLS = [
  { value: 'cas', label: 'CAS' },
  { value: 'toledo', label: 'Toledo' },
  { value: 'massak', label: 'Massa-K' },
];

export default function Settings() {
  const settings = useSettingsStore();
  const { company } = useAuthStore();
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<'company' | 'equipment' | 'fiscal' | 'language' | 'backup' | 'network'>('company');
  const { setCompanyName } = useCompanyStore();

  // Company form
  const [formData, setFormData] = useState({
    companyName: settings.companyName,
    bin: settings.bin,
    address: settings.address,
    ofdProvider: settings.ofdProvider,
    ofdApiKey: settings.ofdApiKey,
    ofdLogin: settings.ofdLogin,
    ofdPassword: settings.ofdPassword,
    ofdCashboxId: settings.ofdCashboxId,
  });
  const [showOfdPassword, setShowOfdPassword] = useState(false);
  const [webkassaStatus, setWebkassaStatus] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle');
  const [isLoading, setIsLoading] = useState(false);

  // Backup
  const [backupList, setBackupList] = useState<any[]>([]);
  const [backupDir, setBackupDir] = useState('');
  const [autoBackup, setAutoBackup] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState(false);

  // Network
  const [networkMode, setNetworkMode] = useState<string>('standalone');
  const [localIP, setLocalIP] = useState('');
  const [serverIP, setServerIP] = useState('');
  const [networkLoading, setNetworkLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle');
  const [allIPs, setAllIPs] = useState<string[]>([]);

  // Terminals
  const [terminals, setTerminals] = useState<any[]>([]);
  const [terminalStatuses, setTerminalStatuses] = useState<Record<string, boolean>>({});
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, id: '' });
  const [showAddTerminal, setShowAddTerminal] = useState(false);
  const [newTerminal, setNewTerminal] = useState({
    bankName: BANKS[0],
    model: '',
    connectionType: 'tcp' as 'tcp' | 'com',
    address: '',
    port: 8888,
    baudRate: 9600,
  });

  // Scales
  const [scaleSettings, setScaleSettings] = useState({
    comPort: 'COM3',
    baudRate: 9600,
    protocol: 'cas',
    isActive: false,
  });
  const [scaleStatus, setScaleStatus] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle');

  // Language
  const [currentLang, setCurrentLang] = useState(i18n.language);

  useEffect(() => {
    if (company?.id) {
      loadTerminals();
      loadScaleSettings();
    }
    loadBackupData();
    loadNetworkStatus();
  }, [company?.id]);

  // ====== TERMINALS ======
  const loadTerminals = async () => {
    if (!company?.id || !window.electronAPI?.terminals) return;
    try {
      const res = await window.electronAPI.terminals.getAll(company.id);
      if (res.success && res.data) {
        setTerminals(res.data);
        pingAllTerminals(res.data);
      }
    } catch { }
  };

  const pingAllTerminals = async (terms: any[]) => {
    if (!company?.id) return;
    const statuses: Record<string, boolean> = {};
    for (const t of terms) {
      try {
        const res = await window.electronAPI.terminals.ping(company.id, t.id);
        statuses[t.id] = res.success && res.data?.online === true;
      } catch {
        statuses[t.id] = false;
      }
    }
    setTerminalStatuses(statuses);
  };

  const handleAddTerminal = async () => {
    if (!company?.id || !newTerminal.address) return;
    try {
      const res = await window.electronAPI.terminals.create({
        companyId: company.id,
        bankName: newTerminal.bankName,
        model: newTerminal.model,
        connectionType: newTerminal.connectionType,
        address: newTerminal.address,
        port: newTerminal.port,
        baudRate: newTerminal.baudRate,
      });
      if (res.success) {
        toast.success('Терминал добавлен');
        setShowAddTerminal(false);
        setNewTerminal({ bankName: BANKS[0], model: '', connectionType: 'tcp', address: '', port: 8888, baudRate: 9600 });
        loadTerminals();
      } else {
        toast.error(res.error || 'Ошибка');
      }
    } catch { toast.error('Ошибка добавления'); }
  };

  const handleDeleteTerminalClick = (id: string) => {
    setConfirmDialog({ isOpen: true, id });
  };

  const handleConfirmDeleteTerminal = async () => {
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
    const { id } = confirmDialog;
    if (!company?.id || !id) return;

    await window.electronAPI.terminals.delete(company.id, id);
    loadTerminals();
  };

  // ====== SCALES ======
  const loadScaleSettings = async () => {
    if (!company?.id || !window.electronAPI?.scales) return;
    try {
      const res = await window.electronAPI.scales.getSettings(company.id);
      if (res.success && res.data) {
        setScaleSettings({
          comPort: res.data.com_port || 'COM3',
          baudRate: res.data.baud_rate || 9600,
          protocol: res.data.protocol || 'cas',
          isActive: !!res.data.is_active,
        });
      }
    } catch { }
  };

  const handleSaveScales = async () => {
    if (!company?.id) return;
    try {
      await window.electronAPI.scales.saveSettings({
        companyId: company.id,
        comPort: scaleSettings.comPort,
        baudRate: scaleSettings.baudRate,
        protocol: scaleSettings.protocol,
        isActive: scaleSettings.isActive,
      });
      toast.success(t('settings.saved'));
    } catch { toast.error(t('settings.saveError')); }
  };

  const handleTestScales = async () => {
    if (!company?.id) return;
    setScaleStatus('checking');
    try {
      const res = await window.electronAPI.scales.test(company.id);
      setScaleStatus(res.success && res.data?.connected ? 'ok' : 'fail');
    } catch { setScaleStatus('fail'); }
  };

  // ====== WEBKASSA ======
  const handleTestWebkassa = async () => {
    if (!company?.id) return;
    setWebkassaStatus('checking');
    try {
      const res = await window.electronAPI.reports.testWebkassa(company.id);
      if (res.success && res.data?.connected) {
        setWebkassaStatus('ok');
      } else {
        setWebkassaStatus('fail');
        toast.error(res.error || 'Ошибка подключения к WebKassa');
      }
    } catch {
      setWebkassaStatus('fail');
      toast.error('Серверная ошибка 1120');
    }
  };

  // ====== LANGUAGE ======
  const handleLanguageChange = (lang: string) => {
    setCurrentLang(lang);
    i18n.changeLanguage(lang);
  };

  // ====== BACKUP ======
  const loadBackupData = async () => {
    try {
      const [listRes, dirRes, autoRes] = await Promise.all([
        window.electronAPI.backup.list(),
        window.electronAPI.backup.getDir(),
        window.electronAPI.backup.getAuto(),
      ]);
      if (listRes.success) setBackupList(listRes.data || []);
      if (dirRes.success) setBackupDir(dirRes.data?.dir || '');
      if (autoRes.success) setAutoBackup(autoRes.data?.enabled || false);
    } catch { }
  };

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await window.electronAPI.backup.create();
      if (res.success) {
        toast.success(`Копия создана: ${res.data?.path?.split('\\').pop() || ''}`);
        loadBackupData();
      } else {
        toast.error(res.error || 'Ошибка создания копии');
      }
    } catch { toast.error('Ошибка создания копии'); }
    finally { setBackupLoading(false); }
  };

  const handleRestoreBackup = async () => {
    setRestoreConfirm(true);
  };

  const handleConfirmRestore = async () => {
    setRestoreConfirm(false);
    setBackupLoading(true);
    try {
      const res = await window.electronAPI.backup.restore();
      if (res.success) {
        toast.success('База данных восстановлена!');
      } else if (res.error !== 'Отменено') {
        toast.error(res.error || 'Ошибка восстановления');
      }
    } catch { toast.error('Ошибка восстановления'); }
    finally { setBackupLoading(false); }
  };

  const handleChooseBackupDir = async () => {
    try {
      const res = await window.electronAPI.backup.chooseDir();
      if (res.success && res.data?.dir) {
        setBackupDir(res.data.dir);
        toast.success('Папка изменена');
      }
    } catch { }
  };

  const handleToggleAutoBackup = async (enabled: boolean) => {
    try {
      await window.electronAPI.backup.setAuto(enabled);
      setAutoBackup(enabled);
      toast.success(enabled ? 'Автокопирование включено' : 'Автокопирование выключено');
    } catch { }
  };

  // ====== NETWORK ======
  const loadNetworkStatus = async () => {
    try {
      const res = await window.electronAPI.network.status();
      if (res.success && res.data) {
        setNetworkMode(res.data.mode);
        setLocalIP(res.data.localIP);
        setAllIPs((res.data as any).allIPs || []);
        if (res.data.serverUrl) setServerIP(res.data.serverUrl.replace(/:8765$/, ''));
      }
    } catch { }
  };

  const handleStartServer = async () => {
    setNetworkLoading(true);
    try {
      const res = await window.electronAPI.network.startServer();
      if (res.success) {
        toast.success(`Сервер запущен: ${res.ip}:${res.port}`);
        loadNetworkStatus();
      } else {
        toast.error(res.error || 'Ошибка запуска');
      }
    } catch { toast.error('Ошибка запуска сервера'); }
    finally { setNetworkLoading(false); }
  };

  const handleStopServer = async () => {
    try {
      await window.electronAPI.network.stopServer();
      toast.success('Сервер остановлен');
      loadNetworkStatus();
    } catch { }
  };

  const handleConnect = async () => {
    if (!serverIP.trim()) { toast.error('Введите IP адрес сервера'); return; }
    setNetworkLoading(true);
    try {
      const res = await window.electronAPI.network.connect(serverIP.trim());
      if (res.success) {
        toast.success('Подключено к серверу!');
        loadNetworkStatus();
      } else {
        toast.error(res.error || 'Ошибка подключения');
      }
    } catch { toast.error('Ошибка подключения'); }
    finally { setNetworkLoading(false); }
  };

  const handleDisconnect = async () => {
    try {
      await window.electronAPI.network.disconnect();
      toast.success('Отключено');
      setServerIP('');
      loadNetworkStatus();
    } catch { }
  };

  const handleTestConnection = async () => {
    setConnectionStatus('checking');
    try {
      const res = await window.electronAPI.network.test(serverIP.trim() || undefined);
      setConnectionStatus(res.success && res.data?.connected ? 'ok' : 'fail');
      if (res.success && res.data?.connected) {
        toast.success('Соединение успешно!');
      } else {
        toast.error(res.error || 'Нет связи с сервером');
      }
    } catch { setConnectionStatus('fail'); toast.error('Нет связи'); }
  };

  // ====== SAVE ======
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!company?.id) return;
    setIsLoading(true);
    try {
      const res = await window.electronAPI.settings.save({
        companyId: company.id,
        companyName: formData.companyName,
        bin: formData.bin,
        address: formData.address,
        ofdProvider: formData.ofdProvider,
        ofdApiKey: formData.ofdApiKey,
        ofdLogin: formData.ofdLogin,
        ofdPassword: formData.ofdPassword,
        ofdCashboxId: formData.ofdCashboxId,
      });

      if (!res.success) {
        throw new Error(res.error || 'Ошибка сохранения');
      }

      setCompanyName(formData.companyName);

      settings.setCompanyDetails({
        companyName: formData.companyName,
        bin: formData.bin,
        address: formData.address,
      });
      settings.setOfdCredentials({
        ofdProvider: formData.ofdProvider as any,
        ofdApiKey: formData.ofdApiKey,
        ofdLogin: formData.ofdLogin,
        ofdPassword: formData.ofdPassword,
        ofdCashboxId: formData.ofdCashboxId,
      });
      toast.success(t('settings.saved'));
    } catch {
      toast.error(t('settings.saveError'));
    } finally {
      setIsLoading(false);
    }
  };

  const tabs = [
    { id: 'company' as const, label: t('settings.company'), icon: Store },
    { id: 'equipment' as const, label: t('settings.equipment'), icon: CreditCard },
    { id: 'fiscal' as const, label: t('settings.fiscalization'), icon: LinkIcon },
    { id: 'backup' as const, label: 'Резервная копия', icon: Database },
    { id: 'network' as const, label: 'Сеть', icon: Wifi },
    { id: 'language' as const, label: t('settings.language'), icon: Globe },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 h-full overflow-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('settings.subtitle')}</p>
        </div>
        <button onClick={handleSave} disabled={isLoading} className="bg-primary text-white px-4 py-2 rounded-lg flex items-center hover:bg-primary/90 transition-colors disabled:opacity-50">
          <Save className="w-5 h-5 mr-2" /> {t('settings.save')}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-200/50 p-1 rounded-xl w-fit">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
            <tab.icon className="w-4 h-4 mr-2" /> {tab.label}
          </button>
        ))}
      </div>

      {/* ====== COMPANY TAB ====== */}
      {activeTab === 'company' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center">
            <Store className="w-5 h-5 text-primary mr-2" />
            <h2 className="font-semibold text-gray-800">{t('settings.company')}</h2>
          </div>
          <div className="p-6 space-y-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.shopName')}</label>
              <div className="relative">
                <Input type="text" name="companyName" value={formData.companyName} onChange={handleChange}
                  className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="ИП Иванов" />
                <KeyboardIcon />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.bin')}</label>
              <div className="relative">
                <Input type="text" name="bin" value={formData.bin} onChange={handleChange}
                  className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="000000000000" />
                <KeyboardIcon />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.legalAddress')}</label>
              <div className="relative">
                <Input type="text" name="address" value={formData.address} onChange={handleChange}
                  className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="г. Алматы, ул. Абая..." />
                <KeyboardIcon />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== EQUIPMENT TAB ====== */}
      {activeTab === 'equipment' && (
        <div className="space-y-6">
          {/* POS Terminals */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <div className="flex items-center">
                <CreditCard className="w-5 h-5 text-blue-500 mr-2" />
                <h2 className="font-semibold text-gray-800">{t('settings.terminals')}</h2>
              </div>
              <button onClick={() => setShowAddTerminal(!showAddTerminal)}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg flex items-center gap-1 transition-colors">
                <Plus className="w-4 h-4" /> {t('settings.addTerminal')}
              </button>
            </div>

            {showAddTerminal && (
              <div className="p-6 border-b border-gray-100 bg-blue-50/50">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.bankName')}</label>
                    <select value={newTerminal.bankName} onChange={e => setNewTerminal(p => ({ ...p, bankName: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-primary">
                      {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.terminalModel')}</label>
                    <Input type="text" value={newTerminal.model} onChange={e => setNewTerminal(p => ({ ...p, model: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary" placeholder="PAX S920" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.connectionType')}</label>
                    <select value={newTerminal.connectionType} onChange={e => setNewTerminal(p => ({ ...p, connectionType: e.target.value as any }))}
                      className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-primary">
                      <option value="tcp">TCP/IP</option>
                      <option value="com">COM-порт</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {newTerminal.connectionType === 'tcp' ? t('settings.ipAddress') : t('settings.comPort')}
                    </label>
                    <Input type="text" value={newTerminal.address} onChange={e => setNewTerminal(p => ({ ...p, address: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary"
                      placeholder={newTerminal.connectionType === 'tcp' ? '192.168.1.100' : 'COM5'} />
                  </div>
                  {newTerminal.connectionType === 'tcp' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.port')}</label>
                      <Input type="number" value={newTerminal.port} onChange={e => setNewTerminal(p => ({ ...p, port: parseInt(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary" />
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <button onClick={handleAddTerminal} className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors">
                    {t('common.add')}
                  </button>
                  <button onClick={() => setShowAddTerminal(false)} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors">
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            )}

            <div className="p-4">
              {terminals.length === 0 ? (
                <p className="text-gray-400 text-center py-6">Нет терминалов. Нажмите "{t('settings.addTerminal')}"</p>
              ) : (
                <div className="space-y-3">
                  {terminals.map(term => (
                    <div key={term.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className={`w-3 h-3 rounded-full ${terminalStatuses[term.id] ? 'bg-green-500' : 'bg-red-500'}`} />
                        <div>
                          <div className="font-bold">{term.bank_name}</div>
                          <div className="text-xs text-gray-500">{term.model} • {term.connection_type === 'tcp' ? `${term.address}:${term.port}` : term.address}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium px-2 py-1 rounded ${terminalStatuses[term.id] ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {terminalStatuses[term.id] ? `🟢 ${t('settings.terminalConnected')}` : `🔴 ${t('settings.terminalOffline')}`}
                        </span>
                        <button onClick={() => handleDeleteTerminalClick(term.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Scales */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center">
              <Scale className="w-5 h-5 text-orange-500 mr-2" />
              <h2 className="font-semibold text-gray-800">{t('settings.scales')}</h2>
            </div>
            <div className="p-6 space-y-4 max-w-lg">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">{t('settings.scales')}</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={scaleSettings.isActive} onChange={e => setScaleSettings(p => ({ ...p, isActive: e.target.checked }))} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.scalePort')}</label>
                <Input type="text" value={scaleSettings.comPort} onChange={e => setScaleSettings(p => ({ ...p, comPort: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary" placeholder="COM3" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.scaleBaud')}</label>
                <select value={scaleSettings.baudRate} onChange={e => setScaleSettings(p => ({ ...p, baudRate: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-primary">
                  {BAUD_RATES.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.scaleProtocol')}</label>
                <select value={scaleSettings.protocol} onChange={e => setScaleSettings(p => ({ ...p, protocol: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-primary">
                  {SCALE_PROTOCOLS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleSaveScales} className="px-6 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg font-medium transition-colors">
                  {t('common.save')}
                </button>
                <button onClick={handleTestScales} disabled={scaleStatus === 'checking'}
                  className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50">
                  {scaleStatus === 'checking' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
                  {t('settings.testScales')}
                </button>
              </div>
              {scaleStatus === 'ok' && <div className="text-green-600 text-sm font-medium flex items-center gap-1"><CheckCircle className="w-4 h-4" /> {t('settings.scalesConnected')}</div>}
              {scaleStatus === 'fail' && <div className="text-red-600 text-sm font-medium flex items-center gap-1"><XCircle className="w-4 h-4" /> {t('settings.scalesOff')}</div>}
            </div>
          </div>
        </div>
      )}

      {/* ====== FISCAL TAB ====== */}
      {activeTab === 'fiscal' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <div className="flex items-center">
              <LinkIcon className="w-5 h-5 text-blue-500 mr-2" />
              <h2 className="font-semibold text-gray-800">{t('settings.ofd')}</h2>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`w-2.5 h-2.5 rounded-full ${formData.ofdProvider !== 'none' ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-xs text-gray-500">{formData.ofdProvider !== 'none' ? t('settings.ofdActive') : t('settings.ofdDisabled')}</span>
            </div>
          </div>
          <div className="p-6 space-y-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.ofdProvider')}</label>
              <select name="ofdProvider" value={formData.ofdProvider} onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary bg-white">
                <option value="none">{t('settings.noFiscal')}</option>
                <option value="webkassa">{t('settings.webkassa')}</option>
                <option value="mock">{t('settings.mockOfd')}</option>
              </select>
            </div>

            {formData.ofdProvider === 'webkassa' && (
              <div className="pt-2 border-t border-gray-100 space-y-4">
                <div className="bg-orange-50 p-3 rounded-lg text-sm text-orange-800">
                  Перед проверкой подключения обязательно нажмите кнопку <b>"Сохранить"</b> в самом низу страницы.
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.cashierLogin')}</label>
                  <Input type="text" name="ofdLogin" value={formData.ofdLogin} onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary" placeholder="login@webkassa.kz" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.cashierPassword')}</label>
                  <div className="relative">
                    <Input type={showOfdPassword ? 'text' : 'password'} name="ofdPassword" value={formData.ofdPassword} onChange={handleChange}
                      className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-primary" />
                    <button type="button" onClick={() => setShowOfdPassword(!showOfdPassword)}
                      className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                      {showOfdPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.znm')}</label>
                  <Input type="text" name="ofdCashboxId" value={formData.ofdCashboxId} onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary" placeholder="Уникальный номер кассы" />
                </div>
                <div className="flex items-center gap-4 pt-2">
                  <button onClick={handleTestWebkassa} disabled={webkassaStatus === 'checking'}
                    className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50">
                    {webkassaStatus === 'checking' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                    {t('settings.testConnection')}
                  </button>
                  {webkassaStatus === 'ok' && (
                    <div className="text-green-600 text-sm font-medium flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" /> 🟢 {t('settings.connected')}
                      <span className="text-gray-400 ml-2 text-xs">{t('settings.tokenUpdated')}: {new Date().toLocaleString('ru-RU')}</span>
                    </div>
                  )}
                  {webkassaStatus === 'fail' && (
                    <div className="text-red-600 text-sm font-medium flex items-center gap-1">
                      <XCircle className="w-4 h-4" /> 🔴 {t('settings.notConnected')}
                    </div>
                  )}
                </div>
              </div>
            )}

            {formData.ofdProvider === 'mock' && (
              <div className="p-3 bg-blue-50 text-blue-700 text-sm rounded-lg">{t('settings.mockHint')}</div>
            )}

            {/* Показ фискального статуса на чеке */}
            <div className="pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">Показывать статус на чеке</label>
                  <p className="text-xs text-gray-400 mt-0.5">«Фискальный чек» / «Нефискальный чек»</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settings.showFiscalBadge} onChange={e => settings.setCompanyDetails({ showFiscalBadge: e.target.checked })} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== BACKUP TAB ====== */}
      {activeTab === 'backup' && (
        <div className="space-y-6">
          {/* Действия */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center">
              <Database className="w-5 h-5 text-amber-500 mr-2" />
              <h2 className="font-semibold text-gray-800">Резервная копия базы данных</h2>
            </div>
            <div className="p-6 space-y-6">
              {/* Папка хранения */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Папка для хранения копий</label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 truncate">
                    {backupDir || 'Загрузка...'}
                  </div>
                  <button
                    onClick={handleChooseBackupDir}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <FolderOpen className="w-4 h-4" /> Изменить
                  </button>
                </div>
              </div>

              {/* Кнопки */}
              <div className="flex gap-4">
                <button
                  onClick={handleCreateBackup}
                  disabled={backupLoading}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <Download className="w-5 h-5" />
                  {backupLoading ? 'Создание...' : 'Создать копию'}
                </button>
                <button
                  onClick={handleRestoreBackup}
                  disabled={backupLoading}
                  className="flex-1 bg-white border-2 border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <Upload className="w-5 h-5" />
                  Восстановить из копии
                </button>
              </div>

              {/* Автобэкап */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <div>
                  <label className="text-sm font-medium text-gray-700">Автоматическое копирование</label>
                  <p className="text-xs text-gray-400 mt-0.5">Создавать копию автоматически раз в сутки</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={autoBackup} onChange={e => handleToggleAutoBackup(e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-amber-400 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500" />
                </label>
              </div>
            </div>
          </div>

          {/* Список копий */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <RefreshCcw className="w-4 h-4 text-gray-400" />
                Последние копии
              </h2>
              <button onClick={loadBackupData} className="text-xs text-primary hover:underline">Обновить</button>
            </div>
            <div className="divide-y divide-gray-100">
              {backupList.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <Database className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                  <p>Резервных копий ещё нет</p>
                </div>
              ) : (
                backupList.map((item, idx) => (
                  <div key={idx} className="p-4 flex items-center justify-between hover:bg-gray-50">
                    <div>
                      <div className="text-sm font-medium text-gray-800 flex items-center gap-2">
                        {new Date(item.date).toLocaleString('ru-RU')}
                        {item.auto && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">авто</span>}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 truncate max-w-md">{item.path}</div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {(item.size / 1024 / 1024).toFixed(1)} МБ
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====== NETWORK TAB ====== */}
      {activeTab === 'network' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center">
            <Wifi className="w-5 h-5 text-green-500 mr-2" />
            <h2 className="font-semibold text-gray-800">Сетевой режим</h2>
            <span className={`ml-3 text-xs px-2 py-0.5 rounded-full font-medium ${networkMode === 'server' ? 'bg-green-100 text-green-700'
              : networkMode === 'client' ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-500'
              }`}>
              {networkMode === 'server' ? 'Сервер' : networkMode === 'client' ? 'Клиент' : 'Отключено'}
            </span>
          </div>
          <div className="p-6 space-y-8">

            {/* Сервер */}
            <div>
              <h3 className="text-base font-bold text-gray-800 mb-1">⚡ Главный компьютер (сервер)</h3>
              <p className="text-sm text-gray-500 mb-4">Включите режим сервера на одном компьютере. Остальные кассы подключатся к нему.</p>
              {networkMode === 'server' ? (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                    <div className="text-sm text-green-700 font-medium mb-2">✅ Сервер работает</div>
                    <div className="text-2xl font-bold text-green-800 font-mono">{localIP}</div>
                    <p className="text-xs text-green-600 mt-1">Сообщите этот адрес другим кассам для подключения</p>
                    {allIPs.length > 1 && (
                      <div className="mt-2 text-xs text-green-600">
                        Другие адреса: {allIPs.filter(ip => ip !== localIP).join(', ')}
                      </div>
                    )}
                  </div>
                  <button onClick={handleStopServer} className="px-6 py-2.5 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 rounded-xl font-medium transition-colors">
                    <WifiOff className="w-4 h-4 inline mr-2" />Остановить сервер
                  </button>
                </div>
              ) : networkMode === 'standalone' ? (
                <button onClick={handleStartServer} disabled={networkLoading} className="px-6 py-3 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl font-bold transition-colors flex items-center gap-2">
                  <Wifi className="w-5 h-5" />
                  {networkLoading ? 'Запуск...' : 'Включить режим сервера'}
                </button>
              ) : null}
            </div>

            <div className="border-t border-gray-100" />

            {/* Клиент */}
            <div>
              <h3 className="text-base font-bold text-gray-800 mb-1">💻 Подключиться к серверу</h3>
              <p className="text-sm text-gray-500 mb-4">Введите IP адрес главного компьютера и нажмите Подключиться</p>
              {networkMode === 'client' ? (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="text-sm text-blue-700 font-medium mb-1">✅ Подключено к серверу</div>
                    <div className="text-lg font-bold text-blue-800 font-mono">{serverIP}</div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={handleTestConnection} disabled={connectionStatus === 'checking'} className="px-5 py-2.5 bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 rounded-xl font-medium transition-colors flex items-center gap-2">
                      {connectionStatus === 'checking' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                      Проверить соединение
                    </button>
                    <button onClick={handleDisconnect} className="px-5 py-2.5 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 rounded-xl font-medium transition-colors">
                      <WifiOff className="w-4 h-4 inline mr-2" />Отключиться
                    </button>
                  </div>
                </div>
              ) : networkMode === 'standalone' ? (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <Input type="text" placeholder="192.168.1.100" value={serverIP} onChange={e => setServerIP(e.target.value)}
                      className="flex-1 px-4 py-2.5 border rounded-xl text-lg font-mono" />
                    <button onClick={handleConnect} disabled={networkLoading} className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl font-bold transition-colors flex items-center gap-2">
                      {networkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                      Подключиться
                    </button>
                  </div>
                  <button onClick={handleTestConnection} disabled={!serverIP.trim() || connectionStatus === 'checking'} className="px-5 py-2 bg-gray-50 text-gray-600 border hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-40">
                    {connectionStatus === 'checking' ? <Loader2 className="w-3 h-3 animate-spin" /> : connectionStatus === 'ok' ? <CheckCircle className="w-3 h-3 text-green-500" /> : connectionStatus === 'fail' ? <XCircle className="w-3 h-3 text-red-500" /> : <Wifi className="w-3 h-3" />}
                    Проверить соединение
                  </button>
                </div>
              ) : null}
            </div>

            {/* Инструкция */}
            <div className="border-t border-gray-100 pt-6">
              <h3 className="text-sm font-bold text-gray-600 mb-3">📖 Как подключить несколько касс</h3>
              <div className="space-y-2 text-sm text-gray-500">
                <div className="flex gap-3 items-start">
                  <span className="bg-primary text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">1</span>
                  <span>На <b>главном</b> компьютере нажмите <b>«Включить режим сервера»</b> — появится IP адрес</span>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="bg-primary text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">2</span>
                  <span>На <b>остальных</b> кассах введите этот IP и нажмите <b>«Подключиться»</b></span>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="bg-primary text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">3</span>
                  <span>Готово! Все кассы работают с единой базой данных</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ====== LANGUAGE TAB ====== */}
      {activeTab === 'language' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center">
            <Globe className="w-5 h-5 text-purple-500 mr-2" />
            <h2 className="font-semibold text-gray-800">{t('settings.language')}</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <button
                onClick={() => handleLanguageChange('ru')}
                className={`flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all ${currentLang === 'ru'
                  ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/20'
                  : 'border-gray-200 hover:border-primary/50 text-gray-600'}`}
              >
                <span className="text-4xl mb-3">🇷🇺</span>
                <span className="font-bold text-lg">{t('settings.langRu')}</span>
                {currentLang === 'ru' && <CheckCircle className="w-5 h-5 mt-2 text-primary" />}
              </button>
              <button
                onClick={() => handleLanguageChange('kk')}
                className={`flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all ${currentLang === 'kk'
                  ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/20'
                  : 'border-gray-200 hover:border-primary/50 text-gray-600'}`}
              >
                <span className="text-4xl mb-3">🇰🇿</span>
                <span className="font-bold text-lg">{t('settings.langKk')}</span>
                {currentLang === 'kk' && <CheckCircle className="w-5 h-5 mt-2 text-primary" />}
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-4">Язык сохраняется автоматически и применяется ко всему интерфейсу без перезапуска.</p>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Удалить терминал?"
        message="Вы уверены что хотите удалить данный банковский терминал? Это действие необратимо."
        onConfirm={handleConfirmDeleteTerminal}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        danger={true}
      />
      <ConfirmDialog
        isOpen={restoreConfirm}
        title="Восстановить базу данных?"
        message="Текущая база данных будет заменена выбранной резервной копией. Все текущие данные будут перезаписаны. Продолжить?"
        onConfirm={handleConfirmRestore}
        onCancel={() => setRestoreConfirm(false)}
        danger={true}
        confirmText="Восстановить"
      />
    </div>
  );
}
