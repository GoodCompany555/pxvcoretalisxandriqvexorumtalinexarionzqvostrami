import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { BarChart3, Filter, FileSpreadsheet, Calendar, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { DatePicker } from '../components/DatePicker';
import { CustomSelect } from '../components/ui/CustomSelect';

export default function ValuationReport() {
  const { t } = useTranslation();
  const { company } = useAuthStore();
  const companyId = company?.id;

  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const [filter, setFilter] = useState({
    endDate: new Date().toISOString().split('T')[0],
    warehouseId: '',
    categoryId: ''
  });

  useEffect(() => {
    if (companyId) {
      loadFiltersData();
      loadReport();
    }
  }, [companyId]);

  const loadFiltersData = async () => {
    try {
      const wRes = await window.electronAPI.warehouses.getAll(companyId!);
      if (wRes.success) setWarehouses(wRes.data || []);

      const cRes = await window.electronAPI.inventory.getCategories(companyId!);
      if (cRes.success) setCategories(cRes.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadReport = async () => {
    try {
      setLoading(true);
      const res = await window.electronAPI.analytics.valuationReport(companyId!, filter);
      if (res.success) {
        setReportData(res.data);
      } else {
        toast.error(res.error || 'Ошибка формирования отчета');
      }
    } catch (error) {
      console.error(error);
      toast.error('Ошибка сервера');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (!reportData || !reportData.products) return;

    const exportData = reportData.products.map((p: any) => ({
      'Штрихкод': p.barcode,
      'Название': p.name,
      'Категория': p.category_name || 'Без категории',
      'Ед. изм.': p.measure_unit || 'шт',
      'Кол-во': p.quantity,
      'Себестоимость (₸)': p.price_purchase,
      'Сумма по себест. (₸)': p.purchase_value,
      'Розн. цена (₸)': p.price_retail,
      'Сумма по розн. (₸)': p.retail_value
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Оценка склада");
    XLSX.writeFile(wb, `Valuation_${filter.endDate}.xlsx`);
  };

  const filteredProducts = reportData?.products?.filter((p: any) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.barcode && p.barcode.includes(searchTerm))
  ) || [];

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-8 h-8 text-primary" />
            Оценка склада
          </h1>
          <p className="text-gray-500 mt-1">Оценка остатков по себестоимости и розничным ценам</p>
        </div>
        <button
          onClick={handleExportExcel}
          disabled={!reportData?.products?.length}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
        >
          <FileSpreadsheet className="w-5 h-5" />
          Экспорт в Excel
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex items-end gap-4">

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
            <Calendar className="w-4 h-4" /> На дату
          </label>
          <DatePicker
            value={filter.endDate}
            onChange={(val) => setFilter({ ...filter, endDate: val })}
            className="w-48"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Склад</label>
          <CustomSelect
            options={[
              { value: '', label: 'Все склады' },
              ...warehouses.map(w => ({ value: w.id, label: w.name }))
            ]}
            value={filter.warehouseId}
            onChange={(val) => setFilter({ ...filter, warehouseId: val })}
            className="w-48"
            placeholder="Все склады"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Категория</label>
          <CustomSelect
            options={[
              { value: '', label: 'Все категории' },
              ...categories.map(c => ({ value: c.id, label: c.name }))
            ]}
            value={filter.categoryId}
            onChange={(val) => setFilter({ ...filter, categoryId: val })}
            className="w-48"
            placeholder="Все категории"
          />
        </div>
        <button
          onClick={loadReport}
          className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <Filter className="w-5 h-5" />
          Сформировать
        </button>
      </div>

      {/* Summary Cards */}
      {reportData?.summary && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="text-sm text-gray-500 mb-1">Общее кол-во товаров</div>
            <div className="text-2xl font-bold text-gray-900">{reportData.summary.totalQuantity.toLocaleString('ru-RU')} шт</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="text-sm text-gray-500 mb-1">Оценка по себестоимости</div>
            <div className="text-2xl font-bold text-blue-600">{reportData.summary.totalPurchaseValue.toLocaleString('ru-RU')} ₸</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="text-sm text-gray-500 mb-1">Оценка по рознице</div>
            <div className="text-2xl font-bold text-green-600">{reportData.summary.totalRetailValue.toLocaleString('ru-RU')} ₸</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="text-sm text-gray-500 mb-1">Потенциальная прибыль</div>
            <div className="text-2xl font-bold text-purple-600">{reportData.summary.potentialProfit.toLocaleString('ru-RU')} ₸</div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex gap-4 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Поиск по названию или штрихкоду..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-600 border-b">Штрихкод</th>
                <th className="px-4 py-3 font-semibold text-gray-600 border-b">Название</th>
                <th className="px-4 py-3 font-semibold text-gray-600 border-b">Категория</th>
                <th className="px-4 py-3 font-semibold text-gray-600 border-b text-right">Кол-во</th>
                <th className="px-4 py-3 font-semibold text-gray-600 border-b text-right">Себестоимость</th>
                <th className="px-4 py-3 font-semibold text-gray-600 border-b text-right">Сумма (себест.)</th>
                <th className="px-4 py-3 font-semibold text-gray-600 border-b text-right">Розница</th>
                <th className="px-4 py-3 font-semibold text-gray-600 border-b text-right">Сумма (розница)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Загрузка...</td></tr>
              ) : filteredProducts.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Нет данных для отображения</td></tr>
              ) : (
                filteredProducts.map((p: any) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500">{p.barcode}</td>
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-gray-500">{p.category_name || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium">{p.quantity} {p.measure_unit}</td>
                    <td className="px-4 py-3 text-right">{p.price_purchase?.toLocaleString('ru-RU')} ₸</td>
                    <td className="px-4 py-3 text-right font-medium text-blue-600">{p.purchase_value?.toLocaleString('ru-RU')} ₸</td>
                    <td className="px-4 py-3 text-right">{p.price_retail?.toLocaleString('ru-RU')} ₸</td>
                    <td className="px-4 py-3 text-right font-medium text-green-600">{p.retail_value?.toLocaleString('ru-RU')} ₸</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
