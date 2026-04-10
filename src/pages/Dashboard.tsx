import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';

import {
  Banknote,
  ShoppingCart as CartIcon,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

export default function Dashboard() {
  const { user, company } = useAuthStore();
  const [stats, setStats] = useState({
    todaySales: 0,
    monthSales: 0,
    receiptCount: 0,
    lowStockItems: 0
  });
  const [chartData, setChartData] = useState<{ name: string; value: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; count: number; price: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAnalytics = async () => {
      if (!company?.id || !window.electronAPI?.analytics) {
        setLoading(false);
        return;
      }
      try {
        const res = await window.electronAPI.analytics.getStats(company.id);
        if (res.success && res.data) {
          setStats({
            todaySales: res.data.todaySales || 0,
            monthSales: res.data.monthSales || 0,
            receiptCount: res.data.receiptCount || 0,
            lowStockItems: res.data.lowStockItems || 0
          });
          if (res.data.chartData && res.data.chartData.length > 0) {
            setChartData(res.data.chartData);
          }
          if (res.data.topProducts && res.data.topProducts.length > 0) {
            setTopProducts(res.data.topProducts);
          }
        }
      } catch { }
      finally { setLoading(false); }
    };
    loadAnalytics();
  }, [company?.id]);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Добро пожаловать, {user?.full_name}</h1>
        <p className="text-gray-500 mt-1">Краткая сводка показателей магазина</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 mt-4 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center">
          <div className="p-3 bg-green-100 rounded-lg">
            <Banknote className="h-6 w-6 text-green-600" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500">Выручка сегодня</p>
            <p className="text-2xl font-bold text-gray-900">{stats.todaySales.toLocaleString('ru')} ₸</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center">
          <div className="p-3 bg-blue-100 rounded-lg">
            <TrendingUp className="h-6 w-6 text-blue-600" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500">Выручка за месяц</p>
            <p className="text-2xl font-bold text-gray-900">{stats.monthSales.toLocaleString('ru')} ₸</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center">
          <div className="p-3 bg-purple-100 rounded-lg">
            <CartIcon className="h-6 w-6 text-purple-600" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500">Чеков за сегодня</p>
            <p className="text-2xl font-bold text-gray-900">{stats.receiptCount}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center">
          <div className="p-3 bg-red-100 rounded-lg">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500">Мало на складе</p>
            <p className="text-2xl font-bold text-red-600">{stats.lowStockItems} товаров</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Динамика продаж (неделя)</h2>
          <div className="h-80 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} dy={10} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#6B7280' }}
                    tickFormatter={(value) => `${value / 1000}k`}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value.toLocaleString('ru')} ₸`, 'Выручка']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#0f172a"
                    strokeWidth={3}
                    dot={{ fill: '#0f172a', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <TrendingUp className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">Нет данных о продажах</p>
                  <p className="text-sm mt-1">Пробейте первый товар чтобы увидеть аналитику</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Топ продаваемых товаров</h2>
          <div className="space-y-4">
            {topProducts.length > 0 ? topProducts.map((item, i) => (
              <div key={i} className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-500 font-medium text-xs">
                    #{i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500">{item.price} ₸ / шт</p>
                  </div>
                </div>
                <div className="mt-2 sm:mt-0 px-2.5 py-1 bg-green-50 text-green-700 text-xs font-semibold rounded-full border border-green-100">
                  {item.count} шт
                </div>
              </div>
            )) : (
              <div className="text-center text-gray-400 py-8">
                <CartIcon className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">Пока нет продаж</p>
                <p className="text-sm mt-1">Данные появятся после первых чеков</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
