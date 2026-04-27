import React, { useState, useEffect } from 'react';
import { Truck, Search, Plus, Trash2, Edit, FileText, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/auth';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { KeyboardIcon } from '../components/KeyboardIcon';
import { Input } from '../components/ui/input';
import { useTranslation } from 'react-i18next';
import { formatPhone } from '../utils/formatters';
import { CustomSelect } from '../components/ui/CustomSelect';

export default function Purchases() {
  const { t } = useTranslation();
  const { company, user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'purchases' | 'suppliers'>('purchases');

  // States
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Load data
  const loadSuppliers = async () => {
    if (!company?.id) return;
    try {
      const res = await window.electronAPI.suppliers.getAll(company.id);
      if (res.success && res.data) setSuppliers(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadPurchases = async () => {
    if (!company?.id) return;
    setLoading(true);
    try {
      const res = await window.electronAPI.purchases.getAll(company.id);
      if (res.success && res.data) setPurchases(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
    loadPurchases();
  }, [company?.id]);

  // SUPPLIERS MODAL
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [supplierFormData, setSupplierFormData] = useState({ name: '', bin: '', phone: '', email: '', address: '' });

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company?.id) return;
    if (!supplierFormData.name) return toast.error(t('purchases.fillRequired', 'Введите название поставщика'));

    const loader = toast.loading(t('purchases.saving', 'Сохранение...'));
    try {
      let res;
      if (editingSupplierId) {
        res = await window.electronAPI.suppliers.update({
          ...supplierFormData,
          id: editingSupplierId,
          companyId: company.id
        });
      } else {
        res = await window.electronAPI.suppliers.create({
          ...supplierFormData,
          companyId: company.id
        });
      }

      if (res.success) {
        toast.success(editingSupplierId ? t('purchases.supplierSaved', 'Поставщик обновлён') : t('purchases.supplierSaved', 'Поставщик добавлен'), { id: loader });
        setIsSupplierModalOpen(false);
        setEditingSupplierId(null);
        setSupplierFormData({ name: '', bin: '', phone: '', email: '', address: '' });
        loadSuppliers();
      } else {
        toast.error(res.error || t('common.error', 'Ошибка'), { id: loader });
      }
    } catch (e) {
      toast.error(t('purchases.saveError', 'Ошибка сохранения'), { id: loader });
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!company?.id) return;
    setConfirmDialog({
      isOpen: true,
      title: t('purchases.supplierDeleteTitle', 'Удалить поставщика?'),
      message: t('purchases.supplierDeleteMessage', 'Вы уверены? Это действие нельзя отменить.'),
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        const loader = toast.loading(t('purchases.deleting', 'Удаление...'));
        try {
          const res = await window.electronAPI.suppliers.delete(company.id, id);
          if (res.success) {
            toast.success(t('purchases.supplierDeleted', 'Поставщик удален'), { id: loader });
            loadSuppliers();
            window.dispatchEvent(new Event('blur'));
            setTimeout(() => window.dispatchEvent(new Event('focus')), 50);
          } else {
            toast.error(res.error || t('purchases.supplierDeleteError', 'Ошибка удаления'), { id: loader });
          }
        } catch (e) {
          toast.error(t('common.error', 'Ошибка'), { id: loader });
        }
      }
    });
  };

  // PURCHASES MODAL
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [purchaseFormData, setPurchaseFormData] = useState<any>({ supplierId: '', notes: '', items: [] });
  // Search products for purchase items
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [foundProducts, setFoundProducts] = useState<any[]>([]);

  useEffect(() => {
    const search = async () => {
      if (!company?.id || productSearchTerm.length < 2) {
        setFoundProducts([]);
        return;
      }
      const res = await window.electronAPI.inventory.getProducts(company.id, productSearchTerm);
      if (res.success && res.data) setFoundProducts(res.data);
    };
    const to = setTimeout(search, 300);
    return () => clearTimeout(to);
  }, [productSearchTerm, company?.id]);

  const addPurchaseItem = (product: any) => {
    const existing = purchaseFormData.items.find((i: any) => i.productId === product.id);
    if (existing) {
      toast.error('Товар уже добавлен в накладную');
      return;
    }
    setPurchaseFormData({
      ...purchaseFormData,
      items: [...purchaseFormData.items, {
        productId: product.id,
        name: product.name,
        barcode: product.barcode,
        quantity: '1',
        price: product.price_purchase?.toString() || '0'
      }]
    });
    setProductSearchTerm('');
    setFoundProducts([]);
  };

  const updatePurchaseItem = (index: number, field: string, value: string) => {
    const newItems = [...purchaseFormData.items];
    newItems[index][field] = value;
    setPurchaseFormData({ ...purchaseFormData, items: newItems });
  };

  const removePurchaseItem = (index: number) => {
    const newItems = [...purchaseFormData.items];
    newItems.splice(index, 1);
    setPurchaseFormData({ ...purchaseFormData, items: newItems });
  };

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company?.id || !user?.id) return;
    if (!purchaseFormData.supplierId) return toast.error(t('purchases.selectSupplier', 'Выберите поставщика'));
    if (purchaseFormData.items.length === 0) return toast.error(t('purchases.noItemsError', 'Добавьте хотя бы один товар'));

    const loader = toast.loading(t('purchases.creating', 'Создание накладной...'));
    try {
      const res = await window.electronAPI.purchases.create({
        companyId: company.id,
        userId: user.id,
        supplierId: purchaseFormData.supplierId,
        notes: purchaseFormData.notes,
        items: purchaseFormData.items
      });
      if (res.success) {
        toast.success(t('purchases.saved', 'Накладная создана (Черновик)'), { id: loader });
        setIsPurchaseModalOpen(false);
        setPurchaseFormData({ supplierId: '', notes: '', items: [] });
        loadPurchases();
      } else {
        toast.error(res.error || t('common.error', 'Ошибка'), { id: loader });
      }
    } catch (e) {
      toast.error(t('common.error', 'Ошибка'), { id: loader });
    }
  };

  // CONFIRM DIALOG
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
  });

  const handleCompletePurchase = async (id: string) => {
    if (!company?.id) return;
    setConfirmDialog({
      isOpen: true,
      title: t('purchases.completeTitle', 'Провести накладную'),
      message: t('purchases.completeMessage', 'Вы уверены, что хотите провести эту накладную? Товары поступят на склад. Это действие необратимо.'),
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        const loader = toast.loading(t('purchases.completing', 'Проведение накладной...'));
        try {
          const res = await window.electronAPI.purchases.complete(company.id, id);
          if (res.success) {
            toast.success(t('purchases.completed', 'Накладная проведена!'), { id: loader });
            loadPurchases();
          } else {
            toast.error(res.error || t('common.error', 'Ошибка'), { id: loader });
          }
        } catch (e) {
          toast.error(t('common.error', 'Ошибка'), { id: loader });
        }
      }
    });
  };

  const handleDeletePurchase = async (id: string) => {
    if (!company?.id) return;
    setConfirmDialog({
      isOpen: true,
      title: t('purchases.deleteTitle', 'Удалить черновик'),
      message: t('purchases.deleteMessage', 'Отменить и удалить черновик?'),
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        const loader = toast.loading(t('purchases.deleting', 'Удаление...'));
        try {
          const res = await window.electronAPI.purchases.delete(company.id, id);
          if (res.success) {
            toast.success(t('purchases.deleted', 'Удалено'), { id: loader });
            loadPurchases();
            window.dispatchEvent(new Event('blur'));
            setTimeout(() => window.dispatchEvent(new Event('focus')), 50);
          } else {
            toast.error(res.error || t('common.error', 'Ошибка'), { id: loader });
          }
        } catch (e) {
          toast.error(t('common.error', 'Ошибка'), { id: loader });
        }
      }
    });
  };


  return (
    <div className="p-8 h-full flex flex-col bg-gray-50/50">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Truck className="w-8 h-8 text-primary" />
            {t('purchases.title', 'Закупки')}
          </h1>
          <p className="text-gray-500 mt-1">{t('purchases.subtitle', 'Приходные накладные и база поставщиков')}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingSupplierId(null);
              setSupplierFormData({ name: '', bin: '', phone: '', email: '', address: '' });
              setIsSupplierModalOpen(true);
            }}
            className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> {t('purchases.addSupplier', 'Добавить поставщика')}
          </button>
          <button
            onClick={() => setIsPurchaseModalOpen(true)}
            className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-colors shadow-sm"
          >
            <FileText className="w-5 h-5" /> {t('purchases.newPurchase', 'Новая приемка')}
          </button>
        </div>
      </div>

      <div className="flex bg-white rounded-lg p-1 w-fit shadow-inner mb-6 space-x-1">
        <button
          onClick={() => setActiveTab('purchases')}
          className={`px-6 py-2 rounded-md font-medium text-sm transition-all ${activeTab === 'purchases' ? 'bg-primary text-white shadow' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
        >
          {t('purchases.title', 'Приходные накладные')}
        </button>
        <button
          onClick={() => setActiveTab('suppliers')}
          className={`px-6 py-2 rounded-md font-medium text-sm transition-all ${activeTab === 'suppliers' ? 'bg-primary text-white shadow' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
        >
          {t('purchases.suppliers', 'База поставщиков')}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex-1 overflow-hidden flex flex-col">
        {activeTab === 'purchases' && (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                  <th className="px-6 py-4">{t('purchases.date', 'Дата / №')}</th>
                  <th className="px-6 py-4">{t('purchases.supplier', 'Поставщик')}</th>
                  <th className="px-6 py-4">{t('purchases.total', 'Сумма')}</th>
                  <th className="px-6 py-4 text-center">{t('purchases.status', 'Статус')}</th>
                  <th className="px-6 py-4 text-center">{t('purchases.actions', 'Действия')}</th>
                  <th className="px-6 py-4 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-500">{t('purchases.loading', 'Загрузка...')}</td></tr>
                ) : purchases.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-500">{t('purchases.empty', 'Нет накладных')}</td></tr>
                ) : (
                  purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{new Date(p.created_at).toLocaleString('ru-RU')}</div>
                        <div className="text-xs text-gray-500 font-mono mt-1">ID: {p.id.split('-')[0]}</div>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-800">{p.supplier_name || t('purchases.noSupplier', 'Не указан')}</td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">{p.total_amount.toLocaleString('ru')} ₸</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${p.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                          }`}>
                          {p.status === 'completed' ? t('purchases.statusCompleted', 'Проведена') : t('purchases.statusDraft', 'Черновик')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 text-center">{p.user_name}</td>
                      <td className="px-6 py-4 flex items-center justify-center gap-3">
                        {p.status === 'draft' && (
                          <>
                            <button
                              onClick={() => handleCompletePurchase(p.id)}
                              className="text-green-600 hover:text-green-800 hover:bg-green-50 p-1.5 rounded transition-colors"
                              title={t('purchases.complete', 'Провести накладную')}
                            >
                              <CheckCircle className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDeletePurchase(p.id)}
                              className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors"
                              title={t('purchases.cancel', 'Отменить')}
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'suppliers' && (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                  <th className="px-6 py-4">{t('purchases.supplierName', 'Название')}</th>
                  <th className="px-6 py-4">{t('purchases.supplierBin', 'БИН/ИИН')}</th>
                  <th className="px-6 py-4">{t('purchases.supplierPhone', 'Контакты')}</th>
                  <th className="px-6 py-4">{t('purchases.supplierAddress', 'Адрес')}</th>
                  <th className="px-6 py-4 text-center">{t('purchases.actions', 'Действия')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {suppliers.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-10 text-gray-500">{t('purchases.supplierEmpty', 'Нет поставщиков')}</td></tr>
                ) : (
                  suppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{s.name}</td>
                      <td className="px-6 py-4 font-mono text-sm text-gray-600">{s.bin || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <div>{s.phone || '-'}</div>
                        <div className="text-xs">{s.email}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{s.address || '-'}</td>
                      <td className="px-6 py-4 flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            setEditingSupplierId(s.id);
                            setSupplierFormData({
                              name: s.name,
                              bin: s.bin || '',
                              phone: s.phone || '',
                              email: s.email || '',
                              address: s.address || ''
                            });
                            setIsSupplierModalOpen(true);
                          }}
                          className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteSupplier(s.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Модалка поставщика */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold">{editingSupplierId ? t('purchases.editSupplier', 'Редактирование поставщика') : t('purchases.newSupplier', 'Новый поставщик')}</h2>
              <button onClick={() => setIsSupplierModalOpen(false)} className="text-gray-400 hover:text-gray-600 font-bold p-2">&times;</button>
            </div>

            <form onSubmit={handleCreateSupplier} className="p-6 flex-1 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('purchases.supplierName', 'Название/ИП')} <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Input required value={supplierFormData.name} onChange={e => setSupplierFormData({ ...supplierFormData, name: e.target.value.substring(0, 75) })} type="text" className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" maxLength={75} />
                  <KeyboardIcon />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('purchases.supplierBin', 'БИН/ИИН')}</label>
                <div className="relative">
                  <Input value={supplierFormData.bin} onChange={e => setSupplierFormData({ ...supplierFormData, bin: e.target.value.replace(/\D/g, '').substring(0, 12) })} type="text" className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" maxLength={12} />
                  <KeyboardIcon />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('purchases.supplierPhone', 'Телефон')}</label>
                  <div className="relative">
                    <Input value={supplierFormData.phone} onChange={e => setSupplierFormData({ ...supplierFormData, phone: formatPhone(e.target.value) })} type="text" className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" />
                    <KeyboardIcon />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <Input value={supplierFormData.email} onChange={e => setSupplierFormData({ ...supplierFormData, email: e.target.value })} type="email" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('purchases.supplierAddress', 'Юр. Адрес')}</label>
                <div className="relative">
                  <Input value={supplierFormData.address} onChange={e => setSupplierFormData({ ...supplierFormData, address: e.target.value.substring(0, 75) })} type="text" className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" maxLength={75} />
                  <KeyboardIcon />
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button type="button" onClick={() => setIsSupplierModalOpen(false)} className="px-5 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors">{t('purchases.cancel', 'Отмена')}</button>
                <button type="submit" className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium shadow-sm transition-all active:scale-[0.98]">{t('purchases.save', 'Сохранить')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модалка Приемки */}
      {isPurchaseModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                <FileText className="w-5 h-5 text-primary" />
                {t('purchases.newPurchase', 'Новая приходная накладная')}
              </h2>
              <button onClick={() => setIsPurchaseModalOpen(false)} className="text-gray-400 hover:text-gray-600 font-bold p-2">&times;</button>
            </div>

            <form onSubmit={handleCreatePurchase} className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('purchases.supplier', 'Поставщик')} <span className="text-red-500">*</span></label>
                  <CustomSelect
                    value={purchaseFormData.supplierId}
                    onChange={(val) => setPurchaseFormData({ ...purchaseFormData, supplierId: val })}
                    className="w-full"
                    placeholder={t('purchases.selectSupplier', 'Выберите поставщика...')}
                    options={[
                      { value: '', label: t('purchases.selectSupplier', 'Выберите поставщика...') },
                      ...suppliers.map(s => ({
                        value: s.id,
                        label: `${s.name} ${s.bin ? `(БИН: ${s.bin})` : ''}`
                      }))
                    ]}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий / № ТТН</label>
                  <Input value={purchaseFormData.notes} onChange={e => setPurchaseFormData({ ...purchaseFormData, notes: e.target.value.substring(0, 75) })} type="text" className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" placeholder="Счет-фактура №123..." maxLength={75} />
                </div>
              </div>

              {/* Поиск товаров */}
              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 relative">
                <label className="block text-sm font-bold text-gray-800 mb-2">{t('purchases.addProduct', 'Добавить товары')}</label>
                <div className="relative">
                  <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="text"
                    placeholder={t('purchases.searchProduct', 'Найти товар по названию или штрихкоду...')}
                    value={productSearchTerm}
                    onChange={e => setProductSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                {/* Результаты поиска */}
                {foundProducts.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 bg-white border rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto w-[calc(100%-2rem)] mx-auto">
                    {foundProducts.map(p => (
                      <div key={p.id} onClick={() => addPurchaseItem(p)} className="p-3 border-b hover:bg-gray-50 cursor-pointer flex justify-between items-center group">
                        <div>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-gray-500 font-mono">{p.barcode} • В наличии: {p.stock_quantity}</div>
                        </div>
                        <Plus className="w-5 h-5 text-gray-300 group-hover:text-primary" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Таблица позиций */}
              <div className="border rounded-xl flex-1 overflow-hidden min-h-[200px] flex flex-col">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3">{t('purchases.productName', 'Товар')}</th>
                      <th className="px-4 py-3 w-32">{t('purchases.quantity', 'Кол-во')}</th>
                      <th className="px-4 py-3 w-40">{t('purchases.price', 'Цена закуп. (₸)')}</th>
                      <th className="px-4 py-3 w-32">{t('purchases.sum', 'Сумма (₸)')}</th>
                      <th className="px-4 py-3 w-16 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {purchaseFormData.items.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-10 text-gray-400">{t('purchases.noItems', 'Список пуст')}</td></tr>
                    ) : (
                      purchaseFormData.items.map((item: any, i: number) => {
                        const qty = parseFloat(item.quantity) || 0;
                        const prc = parseFloat(item.price) || 0;
                        const total = qty * prc;
                        return (
                          <tr key={item.productId} className="bg-white">
                            <td className="px-4 py-3">
                              <div className="font-medium">{item.name}</div>
                              <div className="text-xs text-gray-400 font-mono">{item.barcode}</div>
                            </td>
                            <td className="px-4 py-3">
                              <Input type="number" min="0.001" max="1000000" step="any" value={item.quantity} onChange={e => updatePurchaseItem(i, 'quantity', Math.min(1000000, parseFloat(e.target.value) || 0).toString())} className="w-full px-2 py-1.5 border rounded focus:ring-1 outline-none text-center" />
                            </td>
                            <td className="px-4 py-3">
                              <Input type="number" min="0" max="1000000" step="any" value={item.price} onChange={e => {
                                const val = Math.min(100000000, parseFloat(e.target.value) || 0).toString();
                                updatePurchaseItem(i, 'price', val);
                              }} className="w-full px-2 py-1.5 border rounded focus:ring-1 outline-none text-right font-medium" />
                            </td>
                            <td className="px-4 py-3 font-bold text-gray-800 text-right">
                              {total.toLocaleString('ru')}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button type="button" onClick={() => removePurchaseItem(i)} className="text-gray-400 hover:text-red-500 p-1">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Итог и Кнопки */}
              <div className="flex justify-between items-center pt-4 border-t border-gray-100 mt-auto">
                <div className="text-lg">
                  Итого к оплате: <span className="text-2xl font-black text-gray-900 ml-2">
                    {purchaseFormData.items.reduce((sum: number, i: any) => sum + ((parseFloat(i.quantity) || 0) * (parseFloat(i.price) || 0)), 0).toLocaleString('ru')} ₸
                  </span>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setIsPurchaseModalOpen(false)} className="px-5 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors">{t('purchases.cancel', 'Отмена')}</button>
                  <button type="submit" className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium shadow-sm transition-all shadow-primary/30">{t('purchases.save', 'Сохранить черновик')}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модалка Подтверждения (Confirm Dialog) */}
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
