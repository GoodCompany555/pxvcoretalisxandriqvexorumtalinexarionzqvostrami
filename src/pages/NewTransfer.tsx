import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Trash2, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { CustomSelect } from '../components/ui/CustomSelect';
import { WarehouseModal } from '../components/WarehouseModal';
import { KeyboardIcon } from '../components/KeyboardIcon';

export default function NewTransfer() {
  const { t } = useTranslation();
  const { company, user } = useAuthStore();
  const companyId = company?.id;
  const navigate = useNavigate();

  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [docNumber, setDocNumber] = useState(`TR-${Date.now()}`);

  const [items, setItems] = useState<{ productId: string, product: any, quantity: number }[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);

  useEffect(() => {
    if (companyId) {
      loadWarehouses();
      loadProducts();
    }
  }, [companyId]);

  const loadWarehouses = async () => {
    const res = await window.electronAPI.warehouses.getAll(companyId!);
    if (res.success) {
      setWarehouses(res.data || []);
      const main = (res.data || []).find((w: any) => w.is_main === 1);
      if (main) {
        setFromWarehouseId(main.id);
      }
    }
  };

  const loadProducts = async () => {
    const res = await window.electronAPI.inventory.getProducts(companyId!);
    if (res.success) {
      setProducts(res.data || []);
    }
  };

  const handleAddItem = (product: any) => {
    if (items.find(i => i.productId === product.id)) {
      toast.error('Товар уже добавлен');
      return;
    }
    setItems([...items, { productId: product.id, product, quantity: 1 }]);
    setSearchTerm('');
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const handleUpdateQuantity = (index: number, qty: string) => {
    const newItems = [...items];
    const parsedQty = parseFloat(qty) || 0;
    newItems[index].quantity = Math.min(1000000, Math.max(0, parsedQty));
    setItems(newItems);
  };

  const handleSave = async () => {
    if (!fromWarehouseId || !toWarehouseId) return toast.error('Укажите склады');
    if (fromWarehouseId === toWarehouseId) return toast.error('Склады не могут совпадать');
    if (items.length === 0) return toast.error('Добавьте товары');
    if (items.some(i => i.quantity <= 0)) return toast.error('Количество должно быть больше 0');

    try {
      setIsSubmitting(true);
      const res = await window.electronAPI.transfers.create({
        companyId: companyId!,
        userId: user?.id,
        fromWarehouseId,
        toWarehouseId,
        docNumber,
        items
      });

      if (res.success) {
        toast.success('Перемещение создано');
        navigate('/transfers');
      } else {
        toast.error(res.error || 'Ошибка сохранения');
      }
    } catch (error) {
      toast.error('Ошибка сервера');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.barcode && p.barcode.includes(searchTerm))
  ).slice(0, 10); // Show max 10 to avoid huge lists

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Новое перемещение</h1>
            <p className="text-gray-500 mt-1">Документ внутреннего перемещения</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsWarehouseModalOpen(true)}
            className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-medium transition-colors shadow-sm flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Новый склад
          </button>
          <button
            onClick={handleSave}
            disabled={isSubmitting}
            className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-xl font-medium transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
          >
            <Save className="w-5 h-5" />
            Сохранить черновик
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 col-span-2 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Склад-отправитель</label>
            <CustomSelect
              value={fromWarehouseId}
              onChange={(val) => setFromWarehouseId(val)}
              className="w-full"
              placeholder="Выберите склад..."
              options={[
                { value: '', label: 'Выберите склад...' },
                ...warehouses.map(w => ({ value: w.id, label: w.name }))
              ]}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Склад-получатель</label>
            <CustomSelect
              value={toWarehouseId}
              onChange={(val) => setToWarehouseId(val)}
              className="w-full"
              placeholder="Выберите склад..."
              options={[
                { value: '', label: 'Выберите склад...' },
                ...warehouses.map(w => ({ value: w.id, label: w.name }))
              ]}
            />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <label className="block text-sm font-medium text-gray-700 mb-1">Номер документа</label>
          <input
            type="text"
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none bg-gray-50"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Поиск товара по названию или штрихкоду..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
            />
            {searchTerm && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-100 z-20 max-h-60 overflow-auto">
                {filteredProducts.map(p => (
                  <div
                    key={p.id}
                    onClick={() => handleAddItem(p)}
                    className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex justify-between items-center border-b last:border-0"
                  >
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.barcode}</div>
                    </div>
                    <Plus className="w-4 h-4 text-primary" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {items.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
              Добавьте товары для перемещения
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-sm font-semibold text-gray-600 border-b">Штрихкод</th>
                  <th className="px-4 py-2 text-sm font-semibold text-gray-600 border-b">Наименование</th>
                  <th className="px-4 py-2 text-sm font-semibold text-gray-600 border-b w-32">Количество</th>
                  <th className="px-4 py-2 text-sm font-semibold text-gray-600 border-b w-16"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index} className="border-b last:border-0">
                    <td className="px-4 py-3 text-sm text-gray-500">{item.product.barcode}</td>
                    <td className="px-4 py-3 font-medium">{item.product.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="1000000"
                            step="1"
                            value={item.quantity}
                            onChange={(e) => handleUpdateQuantity(index, e.target.value)}
                            className="w-24 px-2 py-1.5 pr-8 border rounded-lg text-right focus:ring-2 focus:ring-primary outline-none"
                          />
                          <KeyboardIcon />
                        </div>
                        <span className="text-sm text-gray-500 min-w-[20px]">{item.product.measure_unit || 'шт'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleRemoveItem(index)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <WarehouseModal
        isOpen={isWarehouseModalOpen}
        onClose={() => setIsWarehouseModalOpen(false)}
        onSuccess={() => {
          // Refresh warehouses when a new one is added
          if (companyId) {
            window.electronAPI.warehouses.getAll(companyId).then((res: any) => {
              if (res.success && res.data) setWarehouses(res.data);
            });
          }
        }}
        companyId={companyId!}
      />
    </div>
  );
}
