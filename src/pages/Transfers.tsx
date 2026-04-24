import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { ArrowRightLeft, Plus, Search, FileText, XCircle, CheckCircle, Clock, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { WarehouseModal } from '../components/WarehouseModal';
import { TransferDetailsModal } from '../components/TransferDetailsModal';

export default function Transfers() {
  const { t } = useTranslation();
  const { company } = useAuthStore();
  const companyId = company?.id;
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [viewingTransferId, setViewingTransferId] = useState<string | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    danger?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
  });

  useEffect(() => {
    if (companyId) {
      loadTransfers();
    }
  }, [companyId]);

  const loadTransfers = async () => {
    try {
      setLoading(true);
      const res = await window.electronAPI.transfers.getAll(companyId!);
      if (res.success) {
        setTransfers(res.data || []);
      } else {
        toast.error(res.error || 'Ошибка загрузки перемещений');
      }
    } catch (error) {
      console.error(error);
      toast.error('Ошибка сервера');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Отмена перемещения',
      message: 'Вы уверены, что хотите отменить это перемещение?',
      confirmText: 'Да, отменить',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          const loader = toast.loading('Отмена перемещения...');
          const res = await window.electronAPI.transfers.cancel(companyId!, id);
          if (res.success) {
            toast.success('Перемещение отменено', { id: loader });
            loadTransfers();
          } else {
            toast.error(res.error || 'Ошибка отмены', { id: loader });
          }
        } catch (error) {
          console.error(error);
          toast.error('Ошибка сервера');
        }
      }
    });
  };

  const handleExecute = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Проведение перемещения',
      message: 'Вы уверены, что хотите провести это перемещение? Остатки на складах будут изменены.',
      confirmText: 'Провести',
      danger: false,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          const loader = toast.loading('Проведение перемещения...');
          const res = await window.electronAPI.transfers.execute(companyId!, id);
          if (res.success) {
            toast.success('Перемещение проведено', { id: loader });
            loadTransfers();
          } else {
            toast.error(res.error || 'Ошибка проведения', { id: loader });
          }
        } catch (error) {
          console.error(error);
          toast.error('Ошибка сервера');
        }
      }
    });
  };

  const filteredTransfers = transfers.filter(t =>
    t.doc_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.from_warehouse_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.to_warehouse_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Проведен</span>;
      case 'cancelled': return <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-medium flex items-center gap-1"><XCircle className="w-3 h-3" /> Отменен</span>;
      default: return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium flex items-center gap-1"><Clock className="w-3 h-3" /> Черновик</span>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ArrowRightLeft className="w-8 h-8 text-primary" />
            Перемещение товаров
          </h1>
          <p className="text-gray-500 mt-1">Документы перемещения между складами</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsWarehouseModalOpen(true)}
            className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Новый склад
          </button>
          <Link
            to="/transfers/new"
            className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-5 h-5" />
            Новое перемещение
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Поиск по номеру или складу..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 border-b">Дата</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 border-b">Документ</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 border-b">Склад-отправитель</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 border-b">Склад-получатель</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 border-b">Позиций</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 border-b">Статус</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 border-b text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">Загрузка...</td></tr>
              ) : filteredTransfers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-lg">Перемещения не найдены</p>
                  </td>
                </tr>
              ) : (
                filteredTransfers.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm">{new Date(t.date).toLocaleString('ru-RU')}</td>
                    <td className="px-6 py-4 font-medium">{t.doc_number}</td>
                    <td className="px-6 py-4 text-sm">{t.from_warehouse_name}</td>
                    <td className="px-6 py-4 text-sm">{t.to_warehouse_name}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className="font-medium">{t.total_quantity ?? t.items_count}</span>
                      <span className="text-gray-400 ml-1">ед. / {t.items_count} поз.</span>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(t.status)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setViewingTransferId(t.id)}
                          className="text-blue-600 hover:text-blue-800 p-1.5 hover:bg-blue-50 rounded transition-colors"
                          title="Просмотр"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        {t.status === 'draft' && (
                          <>
                            <button onClick={() => handleExecute(t.id)} className="text-green-600 hover:text-green-800 text-sm font-medium px-2 py-1 bg-green-50 rounded transition-colors">Провести</button>
                            <button onClick={() => handleCancel(t.id)} className="text-red-600 hover:text-red-800 text-sm font-medium px-2 py-1 bg-red-50 rounded transition-colors">Отменить</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        confirmText={confirmDialog.confirmText}
        danger={confirmDialog.danger}
      />

      <WarehouseModal
        isOpen={isWarehouseModalOpen}
        onClose={() => setIsWarehouseModalOpen(false)}
        onSuccess={() => {
          // If needed, refresh any data here. 
          // For Transfers.tsx we only show transfers, so no need to reload warehouses directly
        }}
        companyId={companyId!}
      />

      <TransferDetailsModal
        isOpen={!!viewingTransferId}
        onClose={() => setViewingTransferId(null)}
        transferId={viewingTransferId}
        companyId={companyId!}
      />
    </div>
  );
}
