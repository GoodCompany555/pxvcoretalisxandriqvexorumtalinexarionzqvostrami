import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth';
import { Users, Plus, Edit2, Trash2, Building2, Phone, Mail, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { KeyboardIcon } from '../components/KeyboardIcon';
import { Input } from '../components/ui/input';


interface Client {
  id: string;
  name: string;
  bin?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export default function Clients() {
  const companyId = useAuthStore(state => state.company?.id);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [bin, setBin] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Confirm dialog (avoid native confirm in Electron)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

  const fetchClients = async () => {
    if (!companyId || !window.electronAPI?.clients) return;
    setLoading(true);
    const res = await window.electronAPI.clients.getAll(companyId);
    if (res.success && res.data) {
      setClients(res.data);
    } else {
      toast.error('Ошибка загрузки контрагентов');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchClients();
  }, [companyId]);

  const handleOpenModal = (client?: Client) => {
    if (client) {
      setEditingClient(client);
      setName(client.name);
      setBin(client.bin || '');
      setAddress(client.address || '');
      setPhone(client.phone || '');
      setEmail(client.email || '');
    } else {
      setEditingClient(null);
      setName('');
      setBin('');
      setAddress('');
      setPhone('');
      setEmail('');
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !window.electronAPI?.clients) return;

    const payload = {
      id: editingClient?.id,
      companyId,
      name,
      bin,
      address,
      phone,
      email,
    };

    const loadingToast = toast.loading('Сохранение...');

    let res;
    if (editingClient) {
      res = await window.electronAPI.clients.update(payload);
    } else {
      res = await window.electronAPI.clients.create(payload);
    }

    if (res.success) {
      toast.success('Успешно сохранено', { id: loadingToast });
      setIsModalOpen(false);
      fetchClients();
    } else {
      toast.error(res.error || 'Ошибка', { id: loadingToast });
    }
  };

  const handleDelete = (client: Client) => {
    if (!companyId || !window.electronAPI?.clients) return;
    setConfirmDialog({
      isOpen: true,
      title: 'Удалить контрагента',
      message: `Вы уверены, что хотите удалить контрагента "${client.name}"?`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        const res = await window.electronAPI.clients.delete(companyId!, client.id);
        if (res.success) {
          toast.success('Контрагент удален');
          fetchClients();
          window.dispatchEvent(new Event('blur'));
          setTimeout(() => window.dispatchEvent(new Event('focus')), 50);
        } else {
          toast.error('Ошибка удаления');
        }
      },
    });
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Контрагенты</h1>
          <p className="text-gray-500 mt-1">Управление клиентами и партнерами (B2B)</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl hover:bg-primary-hover transition-colors font-medium shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Добавить клиента
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Наименование</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">БИН / ИИН</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Контакты</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-5 h-5 text-blue-500" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{client.name}</span>
                        {client.address && <span className="text-sm text-gray-500 truncate max-w-[200px]">{client.address}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-700 font-medium font-mono">{client.bin || '—'}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1 text-sm text-gray-600">
                      {client.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-gray-400" />
                          {client.phone}
                        </div>
                      )}
                      {client.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-gray-400" />
                          {client.email}
                        </div>
                      )}
                      {!client.phone && !client.email && <span className="text-gray-400">—</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleOpenModal(client)}
                      className="text-primary hover:text-primary-hover p-2 transition-colors mr-2"
                      title="Редактировать"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(client)}
                      className="text-red-500 hover:text-red-700 p-2 transition-colors"
                      title="Удалить"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                    <Users className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                    <p>Список контрагентов пуст</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">
                {editingClient ? 'Редактировать клиента' : 'Новый клиент'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Наименование компании (или ФИО)</label>
                <div className="relative">
                  <Input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2 pr-10 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="ТОО Ромашка"
                  />
                  <KeyboardIcon />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">БИН / ИИН</label>
                <div className="relative">
                  <Input
                    type="text"
                    value={bin}
                    onChange={(e) => setBin(e.target.value)}
                    className="w-full px-4 py-2 pr-10 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary font-mono"
                    placeholder="010101501501"
                    maxLength={12}
                  />
                  <KeyboardIcon />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Адрес (Юридический / Фактический)</label>
                <div className="relative">
                  <Input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-4 py-2 pr-10 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="г. Алматы, ул. Абая 1"
                  />
                  <KeyboardIcon />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="+7 (...)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="mail@example.kz"
                  />
                </div>
              </div>

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
                  {editingClient ? 'Сохранить' : 'Добавить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        danger={true}
      />
    </div>
  );
}

