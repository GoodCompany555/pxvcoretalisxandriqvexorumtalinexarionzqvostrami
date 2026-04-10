import React, { useState, useEffect, useRef } from 'react';
import { Package, Search, Plus, Trash2, Edit, Printer, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import Barcode from 'react-barcode';
// @ts-ignore - bwip-js has no TS declarations but works at runtime
import bwipjs from 'bwip-js';
import { useAuthStore } from '../store/auth';
import { useCompanyStore } from '../store/companyStore';
import NktModal from '../components/NktModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { KeyboardIcon } from '../components/KeyboardIcon';
import { Input } from '../components/ui/input';


export default function Inventory() {
  const { company } = useAuthStore();
  const { companyName } = useCompanyStore();
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Форма добавления / редактирования
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    barcode: '',
    name: '',
    name_kk: '',
    price_purchase: '',
    price_retail: '',
    measure_unit: 'шт',
    is_weighable: false,
    is_marked: false,
    is_alcohol: false,
    alcohol_abv: '',
    alcohol_volume: '',
    initial_stock: '0',
  });
  const [useInitialStock, setUseInitialStock] = useState(true);
  const [isNktModalOpen, setIsNktModalOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    id: null as string | null,
    name: '',
  });

  // Форма изменения остатков
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [stockFormData, setStockFormData] = useState({
    type: 'add', // add, remove, set
    quantity: '',
    reason: ''
  });

  // Печать этикеток — генерируем штрихкод как картинку, печатаем через скрытый iframe
  const printLabel = async (data: {
    companyName: string;
    productName: string;
    productNameKz?: string;
    unit: string;
    price: number;
    barcode: string;
  }) => {
    const barcodeValue = data.barcode || '0000000000000';
    const priceFormatted = data.price.toLocaleString('ru-RU');

    // Генерируем штрихкод как маленькую PNG картинку
    let barcodeDataUrl = '';
    try {
      const canvas = document.createElement('canvas');
      bwipjs.toCanvas(canvas, {
        bcid: 'ean13',
        text: barcodeValue.padStart(13, '0').slice(0, 13),
        scale: 2,
        height: 5,
        includetext: true,
        textxalign: 'center',
        textsize: 8,
      });
      barcodeDataUrl = canvas.toDataURL('image/png');
    } catch (e) {
      console.error('Barcode generation error:', e);
      try {
        const canvas = document.createElement('canvas');
        bwipjs.toCanvas(canvas, {
          bcid: 'code128',
          text: barcodeValue,
          scale: 2,
          height: 5,
          includetext: true,
          textxalign: 'center',
          textsize: 8,
        });
        barcodeDataUrl = canvas.toDataURL('image/png');
      } catch (e2) {
        console.error('Barcode fallback error:', e2);
      }
    }

    const labelHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Этикетка</title>
        <style>
          @page {
            size: 58mm 40mm;
            margin: 0 !important;
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            width: 58mm;
            height: 40mm;
            margin: 0;
            padding: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: #000;
            background: #fff;
            overflow: hidden;
          }
          .label {
            width: 58mm;
            height: 40mm;
            padding: 1.5mm 2mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            overflow: hidden;
          }
          .header {
            font-size: 9px;
            font-weight: bold;
            border-bottom: 1px solid #000;
            width: 100%;
            text-align: center;
            padding-bottom: 1px;
            margin-bottom: 1px;
            text-transform: uppercase;
          }
          .product-name {
            font-size: 11px;
            font-weight: bold;
            text-align: center;
            line-height: 1.15;
            margin-top: 1px;
            max-height: 26px;
            overflow: hidden;
            word-break: break-word;
          }
          .product-name-kz {
            font-size: 9px;
            font-style: italic;
            text-align: center;
            line-height: 1.1;
          }
          .unit {
            font-size: 9px;
            text-align: center;
            margin-top: 1px;
          }
          .price {
            font-size: 18px;
            font-weight: 900;
            text-align: center;
            margin-top: 2px;
            line-height: 1;
          }
          .barcode-area {
            margin-top: 2px;
            text-align: center;
            width: 100%;
          }
          .barcode-area img {
            max-width: 48mm;
            max-height: 12mm;
            height: auto;
          }
        </style>
      </head>
      <body>
        <div class="label">
          <div class="header">${data.companyName || 'МАГАЗИН'}</div>
          <div class="product-name">${data.productName}</div>
          ${data.productNameKz ? `<div class="product-name-kz">${data.productNameKz}</div>` : ''}
          <div class="unit">1 ${data.unit || 'шт'}</div>
          <div class="price">${priceFormatted} ₸</div>
          <div class="barcode-area">
            ${barcodeDataUrl
        ? `<img src="${barcodeDataUrl}" alt="barcode" />`
        : `<div style="font-family:monospace;font-size:10px;margin-top:2px">${barcodeValue}</div>`}
          </div>
        </div>
      </body>
      </html>
    `;

    // Используем скрытый iframe вместо window.open (чтобы не было пустого окна Electron)
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      toast.error('Не удалось создать окно печати');
      document.body.removeChild(iframe);
      return;
    }

    iframeDoc.open();
    iframeDoc.write(labelHtml);
    iframeDoc.close();

    // Даём время на отрисовку, затем печатаем
    setTimeout(() => {
      try {
        iframe.contentWindow?.print();
      } catch (e) {
        console.error('Print error:', e);
      }
      // Убираем iframe после печати
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 2000);
    }, 300);
  };


  const loadProducts = async () => {
    if (!company?.id) return;
    setLoading(true);
    try {
      const res = await window.electronAPI.inventory.getProducts(company.id, search);
      if (res.success && res.data) {
        setProducts(res.data);
      } else {
        toast.error(res.error || 'Ошибка загрузки товаров');
      }
    } catch (error) {
      toast.error('Сбой при загрузке базы товаров');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Дебоунсинг для поиска
    const timeout = setTimeout(() => {
      loadProducts();
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, company?.id]);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company?.id) return;

    if (!formData.name || !formData.barcode || !formData.price_retail) {
      toast.error('Заполните обязательные поля');
      return;
    }

    const loadToast = toast.loading(editingProductId ? 'Обновление товара...' : 'Создание товара...');
    try {
      let res;
      if (editingProductId) {
        res = await window.electronAPI.inventory.updateProduct({
          companyId: company.id,
          productId: editingProductId,
          ...formData,
        });
      } else {
        res = await window.electronAPI.inventory.createProduct({
          ...formData,
          companyId: company.id,
        });
      }

      if (res.success) {
        toast.success(editingProductId ? 'Товар обновлён' : 'Товар успешно добавлен', { id: loadToast });
        setIsModalOpen(false);
        setEditingProductId(null);
        setUseInitialStock(true);
        setFormData({
          barcode: '',
          name: '',
          name_kk: '',
          price_purchase: '',
          price_retail: '',
          measure_unit: 'шт',
          is_weighable: false,
          is_marked: false,
          is_alcohol: false,
          alcohol_abv: '',
          alcohol_volume: '',
          initial_stock: '0',
        });
        loadProducts();
      } else {
        toast.error(res.error || 'Ошибка', { id: loadToast });
      }
    } catch (error) {
      toast.error('Что-то пошло не так', { id: loadToast });
    }
  };

  const handleDeleteClick = (id: string, name: string) => {
    setConfirmDialog({
      isOpen: true,
      id,
      name,
    });
  };

  const handleConfirmDelete = async () => {
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
    const { id } = confirmDialog;
    if (!company?.id || !id) return;

    const loadToast = toast.loading('Удаление...');
    try {
      const res = await window.electronAPI.inventory.deleteProduct(company.id, id);
      if (res.success) {
        toast.success('Удалено', { id: loadToast });

        setSelectedProduct(null);
        setEditingProductId(null);
        setIsModalOpen(false);
        setIsStockModalOpen(false);

        loadProducts();
      } else {
        toast.error(res.error || 'Ошибка при удалении', { id: loadToast });
      }
    } catch (e) {
      toast.error('Системная ошибка', { id: loadToast });
    }
  };

  const handleStockUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company?.id || !selectedProduct) return;
    if (!stockFormData.quantity || parseFloat(stockFormData.quantity) <= 0) {
      toast.error('Введите корректное количество');
      return;
    }

    const loadToast = toast.loading('Обновление остатков...');
    try {
      const res = await window.electronAPI.inventory.updateStock({
        companyId: company.id,
        productId: selectedProduct.id,
        type: stockFormData.type,
        quantity: stockFormData.quantity,
        reason: stockFormData.reason
      });

      if (res.success) {
        toast.success('Остатки обновлены', { id: loadToast });
        setIsStockModalOpen(false);
        setStockFormData({ type: 'add', quantity: '', reason: '' });
        loadProducts();
      } else {
        toast.error(res.error || 'Ошибка обновления', { id: loadToast });
      }
    } catch (error) {
      toast.error('Произошла ошибка', { id: loadToast });
    }
  };

  return (
    <div className="p-8 h-full flex flex-col bg-gray-50/50">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Package className="w-8 h-8 text-primary" />
            Склад и Товары
          </h1>
          <p className="text-gray-500 mt-1">Управление номенклатурой и остатками базы</p>
        </div>
      </div>

      {/* Фильтры и действия */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            type="text"
            placeholder="Поиск по штрихкоду или названию..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-sm transition-all"
          />
          <KeyboardIcon />
        </div>

        <button
          onClick={() => setIsNktModalOpen(true)}
          className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm whitespace-nowrap"
        >
          <Globe className="w-5 h-5 text-blue-500" />
          Нац. каталог
        </button>

        <button
          onClick={() => {
            setEditingProductId(null);
            setFormData({
              barcode: '',
              name: '',
              name_kk: '',
              price_purchase: '',
              price_retail: '',
              measure_unit: 'шт',
              is_weighable: false,
              is_marked: false,
              is_alcohol: false,
              alcohol_abv: '',
              alcohol_volume: '',
              initial_stock: '0',
            });
            setIsModalOpen(true);
          }}
          className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus className="w-5 h-5" />
          Новый товар
        </button>
      </div>

      {/* Таблица */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                <th className="px-6 py-4">Штрихкод</th>
                <th className="px-6 py-4">Наименование</th>
                <th className="px-6 py-4 min-w-[120px]">Категория</th>
                <th className="px-6 py-4 text-right">Закупка</th>
                <th className="px-6 py-4 text-right">Розница</th>
                <th className="px-6 py-4">Остаток</th>
                <th className="px-6 py-4 text-center">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-500">Загрузка...</td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-500">
                    Товары не найдены
                    <div className="mt-2 text-sm text-gray-400">Попробуйте изменить параметры поиска или добавить новый товар</div>
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-mono text-sm text-gray-600">{p.barcode}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{p.name}</div>
                      {p.name_kk && <div className="text-xs text-gray-500 mt-0.5">{p.name_kk}</div>}
                      <div className="flex gap-2 mt-1">
                        {p.is_weighable === 1 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">Весовой</span>}
                        {p.is_marked === 1 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 font-medium">Маркировка (КМ)</span>}
                        {p.is_alcohol === 1 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">Алкоголь</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{p.category_name || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 text-right">{p.price_purchase ? p.price_purchase.toLocaleString('ru') + ' ₸' : '-'}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 text-right">{p.price_retail.toLocaleString('ru')} ₸</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${p.stock_quantity <= 0 ? 'bg-red-50 text-red-600' :
                        p.stock_quantity < 10 ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'
                        }`}>
                        {p.stock_quantity} {p.measure_unit}
                      </span>
                    </td>
                    <td className="px-6 py-4 flex items-center justify-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedProduct(p);
                          setStockFormData({ type: 'add', quantity: '', reason: '' });
                          setIsStockModalOpen(true);
                        }}
                        className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                        title="Движение товара (Приход/Списание)"
                      >
                        <Package className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          printLabel({
                            companyName: companyName || company?.name || 'МАГАЗИН',
                            productName: p.name,
                            productNameKz: p.name_kk || '',
                            unit: p.measure_unit || 'шт',
                            price: p.price_retail,
                            barcode: p.barcode
                          });
                        }}

                        className="p-1.5 text-gray-400 hover:text-purple-500 hover:bg-purple-50 rounded transition-colors"
                        title="Печать этикетки"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingProductId(p.id);
                          setUseInitialStock(false);
                          setFormData({
                            barcode: p.barcode,
                            name: p.name,
                            name_kk: p.name_kk || '',
                            price_purchase: p.price_purchase?.toString() || '',
                            price_retail: p.price_retail?.toString() || '',
                            measure_unit: p.measure_unit || 'шт',
                            is_weighable: p.is_weighable === 1,
                            is_marked: p.is_marked === 1,
                            is_alcohol: p.is_alcohol === 1,
                            alcohol_abv: p.alcohol_abv?.toString() || '',
                            alcohol_volume: p.alcohol_volume?.toString() || '',
                            initial_stock: '',
                          });
                          setIsModalOpen(true);
                        }}
                        className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded transition-colors"
                        title="Редактировать"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(p.id, p.name)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="Удалить"
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
      </div>

      {/* Модалка создания */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                {editingProductId ? 'Редактирование товара' : 'Новая карточка товара'}
              </h2>
              <button onClick={() => { setIsModalOpen(false); setEditingProductId(null); }} className="text-gray-400 hover:text-gray-600 text-lg font-bold p-2">&times;</button>
            </div>

            <form onSubmit={handleCreateProduct} className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Наименование <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} type="text" className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" placeholder="Сникерс 50г" />
                    <KeyboardIcon />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Наименование (Қаз)</label>
                  <div className="relative">
                    <Input value={formData.name_kk} onChange={e => setFormData({ ...formData, name_kk: e.target.value })} type="text" className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" placeholder="Сникерс 50г" />
                    <KeyboardIcon />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Штрихкод <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Input required value={formData.barcode} onChange={e => setFormData({ ...formData, barcode: e.target.value })} type="text" className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" placeholder="460000000000" />
                    <KeyboardIcon />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Единица измерения</label>
                  <select value={formData.measure_unit} onChange={e => setFormData({ ...formData, measure_unit: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none bg-white">
                    <option value="шт">Штуки (шт)</option>
                    <option value="кг">Килограммы (кг)</option>
                    <option value="л">Литры (л)</option>
                    <option value="м">Метры (м)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Закупочная цена (₸)</label>
                  <div className="relative">
                    <Input value={formData.price_purchase} onChange={e => setFormData({ ...formData, price_purchase: e.target.value })} type="number" min="0" step="1" className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" placeholder="0" />
                    <KeyboardIcon />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Розничная цена (₸) <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Input required value={formData.price_retail} onChange={e => setFormData({ ...formData, price_retail: e.target.value })} type="number" min="0" step="1" className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" placeholder="0" />
                    <KeyboardIcon />
                  </div>
                </div>

                {!editingProductId && (
                  <div className="col-span-2 pt-2">
                    <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors border border-gray-100">
                      <input
                        type="checkbox"
                        checked={useInitialStock}
                        onChange={e => setUseInitialStock(e.target.checked)}
                        className="rounded text-primary focus:ring-primary w-5 h-5 cursor-pointer"
                      />
                      <span className="text-sm font-medium text-gray-800">Задать начальный остаток сразу</span>
                    </label>

                    {useInitialStock && (
                      <div className="mt-3 pl-[3.25rem] animate-in slide-in-from-top-2">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Количество на складе: </label>
                        <Input required min="0" value={formData.initial_stock} onChange={e => setFormData({ ...formData, initial_stock: Math.max(0, Number(e.target.value)).toString() })} type="number" step="any" className="w-48 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" />
                      </div>
                    )}
                  </div>
                )}

                <div className="col-span-2 border-t border-gray-100 pt-4 mt-2 grid grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1 p-3 border border-gray-100 rounded-lg cursor-pointer hover:bg-blue-50/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={formData.is_weighable} onChange={e => setFormData({ ...formData, is_weighable: e.target.checked })} className="rounded text-primary focus:ring-primary" />
                      <span className="text-sm border-b border-dashed border-gray-400 font-medium">Весовой товар</span>
                    </div>
                    <span className="text-xs text-gray-500 pl-6">Количество может быть дробным</span>
                  </label>

                  <label className="flex flex-col gap-1 p-3 border border-gray-100 rounded-lg cursor-pointer hover:bg-purple-50/50 transition-colors col-span-2">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={formData.is_marked} onChange={e => setFormData({ ...formData, is_marked: e.target.checked })} className="rounded text-primary focus:ring-primary" />
                      <span className="text-sm border-b border-dashed border-gray-400 font-medium">Подлежит маркировке (DataMatrix)</span>
                    </div>
                    <span className="text-xs text-gray-500 pl-6">Табак, обувь, алкоголь (контроль КМ)</span>
                  </label>

                  <div className="col-span-2 space-y-3">
                    <label className="flex flex-col gap-1 p-3 border border-gray-100 rounded-lg cursor-pointer hover:bg-red-50/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={formData.is_alcohol} onChange={e => setFormData({ ...formData, is_alcohol: e.target.checked })} className="rounded text-primary focus:ring-primary" />
                        <span className="text-sm border-b border-dashed border-gray-400 font-medium text-red-700">Алкогольная продукция</span>
                      </div>
                      <span className="text-xs text-gray-500 pl-6">Требует проверки возраста 21+ и учета объема</span>
                    </label>

                    {formData.is_alcohol && (
                      <div className="grid grid-cols-2 gap-4 pl-6 animate-in slide-in-from-top-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Крепость (% об.)</label>
                          <Input value={formData.alcohol_abv} onChange={e => setFormData({ ...formData, alcohol_abv: e.target.value })} type="number" step="0.1" className="w-full px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" placeholder="40.0" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Объем (л)</label>
                          <Input value={formData.alcohol_volume} onChange={e => setFormData({ ...formData, alcohol_volume: e.target.value })} type="number" step="0.001" className="w-full px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" placeholder="0.5" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors">Отмена</button>
                <button type="submit" className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium shadow-sm shadow-primary/30 transition-all active:scale-[0.98]">Сохранить в базу</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модалка Остатков */}
      {isStockModalOpen && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold">Движение товара</h2>
              <button onClick={() => setIsStockModalOpen(false)} className="text-gray-400 hover:text-gray-600 font-bold p-2">&times;</button>
            </div>

            <form onSubmit={handleStockUpdate} className="p-6 flex-1 space-y-4">
              <div className="bg-blue-50 text-blue-800 p-3 rounded-xl border border-blue-100 flex justify-between items-center mb-4">
                <span className="font-semibold">{selectedProduct.name}</span>
                <span className="font-mono bg-white px-2 py-1 rounded shadow-sm text-sm border border-blue-200">Текущий остаток: {selectedProduct.stock_quantity}</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Тип операции</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setStockFormData({ ...stockFormData, type: 'add' })}
                    className={`py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${stockFormData.type === 'add' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >Приход</button>
                  <button
                    type="button"
                    onClick={() => setStockFormData({ ...stockFormData, type: 'remove' })}
                    className={`py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${stockFormData.type === 'remove' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >Списание</button>
                  <button
                    type="button"
                    onClick={() => setStockFormData({ ...stockFormData, type: 'set' })}
                    className={`py-2 px-3 text-sm font-medium rounded-lg border transition-colors flex flex-col items-center justify-center ${stockFormData.type === 'set' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >Инвентариз.</button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {stockFormData.type === 'add' ? 'Какое количество добавить?' :
                    stockFormData.type === 'remove' ? 'Какое количество списать?' :
                      'Установить точный остаток:'}
                </label>
                <div className="flex items-center gap-3">
                  <Input required value={stockFormData.quantity} onChange={e => setStockFormData({ ...stockFormData, quantity: Math.max(0, Number(e.target.value)).toString() })} type="number" step="any" min="0" className="flex-1 px-4 py-3 text-xl font-bold bg-gray-50 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" />
                  <span className="text-gray-500 font-medium">{selectedProduct.measure_unit}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Основание / Комментарий (опционально)</label>
                <Input value={stockFormData.reason} onChange={e => setStockFormData({ ...stockFormData, reason: e.target.value })} type="text" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" placeholder="Приходная накладная №123" />
              </div>

              <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button type="button" onClick={() => setIsStockModalOpen(false)} className="px-5 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors">Отмена</button>
                <button type="submit" className={`px-5 py-2.5 text-white rounded-xl font-medium shadow-sm transition-all active:scale-[0.98] ${stockFormData.type === 'add' ? 'bg-green-600 hover:bg-green-700 shadow-green-600/30' :
                  stockFormData.type === 'remove' ? 'bg-red-600 hover:bg-red-700 shadow-red-600/30' :
                    'bg-blue-600 hover:bg-blue-700 shadow-blue-600/30'
                  }`}>
                  Провести
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* NKT Modal */}
      {isNktModalOpen && (
        <NktModal
          isOpen={true}
          onClose={() => setIsNktModalOpen(false)}
          onImport={(product) => {
            setIsNktModalOpen(false);
            setEditingProductId(null);
            setFormData({
              barcode: product.gtin || product.ntin || '',
              name: product.name || '',
              name_kk: '',
              price_purchase: '',
              price_retail: '',
              measure_unit: product.unit || 'шт',
              is_weighable: false,
              is_marked: false,
              is_alcohol: false,
              alcohol_abv: '',
              alcohol_volume: '',
              initial_stock: '0',
            });
            setUseInitialStock(true);
            setIsModalOpen(true);
            toast.success('✅ Товар импортирован из НКТ. Заполните цену и остатки.');
          }}
        />
      )}

      {/* Confirm Delete Modal */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Удалить товар?"
        message={`Вы уверены что хотите удалить "${confirmDialog.name}"? Это действие необратимо и может нарушить историю чеков.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        danger={true}
      />

    </div>
  );
}
