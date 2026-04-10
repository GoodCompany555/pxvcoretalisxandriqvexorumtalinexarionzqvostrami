import React, { useState, useEffect } from 'react';
import { FileText, PlayCircle, StopCircle, RefreshCcw, DollarSign, Clock, Users, TrendingUp, Download, BarChart2, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/auth';
import { useShiftStore } from '../store/shift';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Input } from '../components/ui/input';


export default function Reports() {
  const { company, user } = useAuthStore();
  const { currentShift, setCurrentShift, clearShift } = useShiftStore();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'current' | 'xreport' | 'history' | 'stats'>('current');
  const [loading, setLoading] = useState(false);

  const [startCashInput, setStartCashInput] = useState('');
  const [cashOpType, setCashOpType] = useState<'in' | 'out'>('in');
  const [cashOpAmount, setCashOpAmount] = useState('');
  const [shiftsHistory, setShiftsHistory] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // X-report
  const [xReportData, setXReportData] = useState<any>(null);
  const [xReportLoading, setXReportLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);

  useEffect(() => {
    if (company?.id && user?.id) checkCurrentShift();
  }, [company, user]);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
    else if (activeTab === 'stats') loadStats();
    else if (activeTab === 'xreport') loadXReport();
  }, [activeTab]);

  const checkCurrentShift = async () => {
    if (!company?.id || !user?.id) return;
    try {
      const res = await window.electronAPI.shifts.getCurrent(company.id, user.id);
      if (res.success) setCurrentShift(res.data);
    } catch { }
  };

  const loadStats = async () => {
    if (!company?.id) return;
    setStatsLoading(true);
    try {
      const res = await window.electronAPI.analytics.getStats(company.id);
      if (res.success && res.data) setStats(res.data);
    } catch { toast.error(t('common.error')); }
    finally { setStatsLoading(false); }
  };

  const loadHistory = async () => {
    if (!company?.id) return;
    setLoading(true);
    try {
      const res = await window.electronAPI.shifts.getHistory(company.id);
      if (res.success && res.data) setShiftsHistory(res.data);
    } catch { toast.error(t('common.error')); }
    finally { setLoading(false); }
  };

  // ====== X-ОТЧЁТ ======
  const loadXReport = async () => {
    if (!company?.id || !currentShift?.id) { setXReportData(null); return; }
    setXReportLoading(true);
    try {
      const res = await window.electronAPI.reports.xReport(company.id, currentShift.id);
      if (res.success) setXReportData(res.data);
      else toast.error(res.error || t('common.error'));
    } catch { toast.error(t('common.error')); }
    finally { setXReportLoading(false); }
  };

  const handleOpenShift = async () => {
    if (!company?.id || !user?.id) return;
    const startCash = parseFloat(startCashInput) || 0;
    if (startCash < 0) return toast.error(t('reports.insufficientFunds'));

    const loader = toast.loading(t('common.loading'));
    try {
      const res = await window.electronAPI.shifts.open(company.id, user.id, startCash);
      if (res.success) {
        toast.success(t('reports.shiftOpenedMsg'), { id: loader });
        setStartCashInput('');
        await checkCurrentShift();
      } else toast.error(res.error || t('common.error'), { id: loader });
    } catch { toast.error(t('common.error'), { id: loader }); }
  };

  // ====== Z-ОТЧЁТ (ЗАКРЫТИЕ СМЕНЫ) ======
  const handleCloseShiftClick = () => {
    if (!company?.id || !currentShift?.id) return;
    setConfirmDialog(true);
  };

  const handleConfirmCloseShift = async () => {
    setConfirmDialog(false);
    if (!company?.id || !currentShift?.id) return;

    const loader = toast.loading(t('common.loading'));
    try {
      // Используем reports:z-report вместо shifts:close
      const res = await window.electronAPI.reports.zReport(company.id, currentShift.id);
      if (res.success) {
        toast.success(t('reports.zReportSent'), { id: loader });
        clearShift();
      } else {
        // Если WebKassa не настроена — показать ошибку
        if (res.error?.includes('WebKassa')) {
          toast.error(res.error, { id: loader, duration: 6000, icon: '⚠️' });
        } else {
          toast.error(res.error || t('common.error'), { id: loader });
        }
      }
    } catch { toast.error(t('common.error'), { id: loader }); }
  };

  const handleCashOperation = async () => {
    if (!company?.id || !currentShift?.id) return;
    const amount = parseFloat(cashOpAmount);
    if (!amount || amount <= 0) return toast.error(t('reports.insufficientFunds'));
    if (cashOpType === 'out' && amount > currentShift.end_cash) {
      return toast.error(`${t('reports.insufficientFunds')}: ${currentShift.end_cash} ₸`);
    }

    const loader = toast.loading(t('common.loading'));
    try {
      const res = await window.electronAPI.shifts.cashOperation(company.id, currentShift.id, cashOpType, amount);
      if (res.success) {
        toast.success(t('reports.opDone'), { id: loader });
        setCashOpAmount('');
        await checkCurrentShift();
      } else toast.error(res.error || t('common.error'), { id: loader });
    } catch { toast.error(t('common.error'), { id: loader }); }
  };

  const exportStatsToCSV = () => {
    if (!stats?.topProducts?.length) return;
    const headers = ['Название', 'Штрихкод', 'Кол-во продаж', 'Выручка', 'Класс ABC'];
    const rows = stats.topProducts.map((p: any) => [
      `"${p.name.replace(/"/g, '""')}"`, p.barcode, p.sold_qty, p.revenue, p.abcClass
    ]);
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF"
      + headers.join(';') + '\n'
      + rows.map((e: string[]) => e.join(';')).join('\n');
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `abc_analysis_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-8 h-full flex flex-col bg-gray-50/50">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-primary" /> {t('reports.title')}
          </h1>
          <p className="text-gray-500 mt-1">{t('reports.subtitle')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-200/50 p-1 rounded-xl w-fit mb-6">
        {[
          { id: 'current' as const, label: t('reports.currentShift'), icon: Clock },
          { id: 'xreport' as const, label: t('reports.xReport'), icon: FileText },
          { id: 'history' as const, label: t('reports.history'), icon: HistoryIcon2 },
          { id: 'stats' as const, label: t('reports.analytics'), icon: TrendingUp },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
            <tab.icon className="w-4 h-4 mr-2" /> {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">

        {/* ====== CURRENT SHIFT ====== */}
        {activeTab === 'current' && (
          <div className="p-8 flex-1 overflow-auto">
            {!currentShift ? (
              <div className="max-w-md mx-auto mt-20 text-center">
                <div className="w-24 h-24 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <PlayCircle className="w-12 h-12" />
                </div>
                <h2 className="text-2xl font-bold mb-2">{t('reports.shiftClosed')}</h2>
                <p className="text-gray-500 mb-8">{t('reports.openShiftHint')}</p>
                <div className="bg-gray-50 p-6 rounded-xl text-left border border-gray-100">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('reports.startCash')}</label>
                  <Input type="number" value={startCashInput} onChange={e => setStartCashInput(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary mb-4 text-lg font-bold" placeholder="0" />
                  <button onClick={handleOpenShift} className="w-full bg-primary hover:bg-primary/90 text-white py-3 rounded-lg font-bold text-lg transition-colors shadow-sm">
                    {t('reports.openShift')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                      </span>
                      <h2 className="text-xl font-bold text-green-600 uppercase tracking-wider">{t('reports.shiftOpened')}</h2>
                    </div>
                    <p className="text-gray-500 text-sm">{t('reports.opened')}: {new Date(currentShift.opened_at).toLocaleString('ru-RU')}</p>
                  </div>
                  <button onClick={handleCloseShiftClick} className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-sm transition-colors">
                    <StopCircle className="w-5 h-5" /> {t('reports.closeShift')} (F9)
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-6 mb-8">
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-2xl text-white shadow-md shadow-blue-500/20">
                    <div className="text-blue-100 font-medium mb-1">{t('reports.revenue')}</div>
                    <div className="text-3xl font-black">{currentShift.total_sales.toLocaleString('ru')} ₸</div>
                  </div>
                  <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-6 rounded-2xl text-white shadow-md shadow-purple-500/20">
                    <div className="text-purple-100 font-medium mb-1">{t('reports.returns')}</div>
                    <div className="text-3xl font-black">{currentShift.total_returns.toLocaleString('ru')} ₸</div>
                  </div>
                  <div className="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-2xl text-white shadow-md shadow-green-500/20">
                    <div className="text-green-100 font-medium mb-1">{t('reports.cashInRegister')}</div>
                    <div className="text-3xl font-black">{currentShift.end_cash.toLocaleString('ru')} ₸</div>
                  </div>
                </div>

                <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-gray-400" /> {t('reports.cashOps')}
                  </h3>
                  <div className="flex gap-4">
                    <select value={cashOpType} onChange={e => setCashOpType(e.target.value as 'in' | 'out')}
                      className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary bg-white font-medium">
                      <option value="in">{t('reports.deposit')}</option>
                      <option value="out">{t('reports.withdrawal')}</option>
                    </select>
                    <Input type="number" value={cashOpAmount} onChange={e => setCashOpAmount(e.target.value)} placeholder="Сумма"
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary font-bold text-lg" />
                    <button onClick={handleCashOperation} className="bg-gray-800 hover:bg-gray-900 text-white px-8 py-3 rounded-lg font-bold transition-colors">
                      {t('reports.execute')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====== X-ОТЧЁТ ====== */}
        {activeTab === 'xreport' && (
          <div className="p-8 flex-1 overflow-auto">
            {!currentShift ? (
              <div className="text-center text-gray-400 py-20">
                <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-lg font-medium">{t('reports.shiftMustOpen')}</p>
              </div>
            ) : xReportLoading ? (
              <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
            ) : !xReportData ? (
              <div className="text-center text-gray-400 py-20">{t('reports.noSales')}</div>
            ) : (
              <div className="max-w-2xl mx-auto">
                <div className="bg-gray-900 text-white p-6 rounded-t-2xl text-center">
                  <h2 className="text-2xl font-black tracking-wider">{t('reports.xReportTitle')}</h2>
                  <p className="text-gray-400 text-sm mt-1">{t('reports.xReportSubtitle')}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-b-2xl p-6 font-mono text-sm space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-gray-600 pb-3 border-b border-dashed border-gray-300">
                    <p>{t('reports.date')}: <b>{xReportData.date}</b></p>
                    <p>{t('reports.time')}: <b>{xReportData.time}</b></p>
                    <p>{t('reports.cashier')}: <b>{xReportData.cashierName}</b></p>
                    <p>{t('reports.register')}: <b>{xReportData.znm}</b></p>
                  </div>

                  <div>
                    <h3 className="font-bold text-gray-800 mb-2 text-base">{t('reports.salesSection')}</h3>
                    <div className="space-y-1 text-gray-600">
                      <div className="flex justify-between"><span>{t('reports.receiptsQty')}:</span><b>{xReportData.salesCount}</b></div>
                      <div className="flex justify-between"><span>{t('reports.productsQty')}:</span><b>{xReportData.productsCount}</b></div>
                      <div className="flex justify-between"><span>{t('reports.cashTotal')}:</span><b>{xReportData.cashSales?.toLocaleString('ru')} ₸</b></div>
                      <div className="flex justify-between"><span>{t('reports.cardTotal')}:</span><b>{xReportData.cardSales?.toLocaleString('ru')} ₸</b></div>
                      {xReportData.cardByBank && Object.entries(xReportData.cardByBank).map(([bank, amount]: [string, any]) => (
                        <div key={bank} className="flex justify-between text-gray-400 pl-4"><span>{bank}:</span><span>{amount?.toLocaleString('ru')} ₸</span></div>
                      ))}
                      <div className="flex justify-between"><span>{t('reports.qrTotal')}:</span><b>{xReportData.qrSales?.toLocaleString('ru')} ₸</b></div>
                      <div className="flex justify-between border-t border-gray-200 pt-2 font-bold text-gray-800">
                        <span>{t('reports.totalSales')}:</span><span>{xReportData.totalSales?.toLocaleString('ru')} ₸</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-gray-800 mb-2 text-base">{t('reports.returnsSection')}</h3>
                    <div className="space-y-1 text-gray-600">
                      <div className="flex justify-between"><span>{t('reports.returnsQty')}:</span><b>{xReportData.returnsCount}</b></div>
                      <div className="flex justify-between"><span>{t('reports.returnsCash')}:</span><b>{xReportData.returnsCash?.toLocaleString('ru')} ₸</b></div>
                      <div className="flex justify-between"><span>{t('reports.returnsCard')}:</span><b>{xReportData.returnsCard?.toLocaleString('ru')} ₸</b></div>
                      <div className="flex justify-between border-t border-gray-200 pt-2 font-bold text-gray-800">
                        <span>{t('reports.totalReturns')}:</span><span>{xReportData.totalReturns?.toLocaleString('ru')} ₸</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-900 text-white p-5 rounded-xl text-center">
                    <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">{t('reports.netRevenue')}</p>
                    <p className="text-4xl font-black">{xReportData.netRevenue?.toLocaleString('ru')} ₸</p>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-center pt-2">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-500">{t('reports.deposits')}</div>
                      <div className="font-bold">{xReportData.deposits?.toLocaleString('ru')} ₸</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-500">{t('reports.withdrawals')}</div>
                      <div className="font-bold">{xReportData.withdrawals?.toLocaleString('ru')} ₸</div>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                      <div className="text-xs text-green-600">{t('reports.cashBalance')}</div>
                      <div className="font-bold text-green-700">{xReportData.cashBalance?.toLocaleString('ru')} ₸</div>
                    </div>
                  </div>
                </div>

                <button onClick={loadXReport} className="mt-4 px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium text-gray-600 transition-colors flex items-center gap-2 mx-auto">
                  <RefreshCcw className="w-4 h-4" /> {t('reports.printReport')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ====== HISTORY ====== */}
        {activeTab === 'history' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <h2 className="font-bold text-gray-700">{t('reports.closedShifts')}</h2>
              <button onClick={loadHistory} className="p-2 hover:bg-white rounded-lg text-gray-500 transition-colors border border-transparent hover:border-gray-200 shadow-sm">
                <RefreshCcw className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {loading ? (
                <div className="flex justify-center py-10"><RefreshCcw className="w-6 h-6 animate-spin text-gray-400" /></div>
              ) : shiftsHistory.length === 0 ? (
                <div className="text-center py-10 text-gray-400">{t('reports.noShiftData')}</div>
              ) : (
                <div className="space-y-3">
                  {shiftsHistory.map((shift) => (
                    <div key={shift.id} className="bg-white border text-left border-gray-200 p-5 rounded-xl flex items-center justify-between hover:border-primary/30 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${shift.is_closed ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-600'}`}>
                          {shift.is_closed ? <FileText className="w-6 h-6" /> : <PlayCircle className="w-6 h-6" />}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900">{new Date(shift.opened_at).toLocaleDateString('ru-RU')}</div>
                          <div className="text-sm text-gray-500">
                            {t('reports.opened')}: {new Date(shift.opened_at).toLocaleTimeString('ru-RU')}
                            {shift.is_closed && ` — ${new Date(shift.closed_at).toLocaleTimeString('ru-RU')}`}
                          </div>
                          <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                            <Users className="w-3 h-3" /> {shift.cashier_name}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold">{t('reports.revenue')}</div>
                        <div className="text-xl font-black text-gray-900">{shift.total_sales.toLocaleString('ru')} ₸</div>
                        {shift.is_closed && <div className="text-xs text-green-600 font-medium mt-1">{t('reports.balanceInRegister')}: {shift.end_cash.toLocaleString('ru')} ₸</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====== STATS ====== */}
        {activeTab === 'stats' && (
          <div className="flex-1 flex flex-col overflow-auto bg-gray-50/30">
            {statsLoading ? (
              <div className="flex-1 flex justify-center items-center"><RefreshCcw className="w-8 h-8 animate-spin text-gray-400" /></div>
            ) : !stats ? (
              <div className="flex-1 flex justify-center items-center text-gray-400">{t('reports.noSales')}</div>
            ) : (
              <div className="p-8 max-w-6xl mx-auto w-full space-y-6">
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <div className="text-gray-500 text-sm font-medium mb-1">{t('reports.totalRevenue')}</div>
                    <div className="text-2xl font-bold text-gray-900">{stats.kpis.totalSales.toLocaleString('ru')} ₸</div>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <div className="text-gray-500 text-sm font-medium mb-1">{t('reports.receiptsCount')}</div>
                    <div className="text-2xl font-bold text-gray-900">{stats.kpis.receiptsCount} {t('common.pcs')}</div>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <div className="text-gray-500 text-sm font-medium mb-1">{t('reports.avgTicket')}</div>
                    <div className="text-2xl font-bold text-gray-900">{Math.round(stats.kpis.avgTicket).toLocaleString('ru')} ₸</div>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <div className="text-gray-500 text-sm font-medium mb-1">{t('reports.returnsTotal')}</div>
                    <div className="text-2xl font-bold text-red-600">{stats.kpis.totalReturns.toLocaleString('ru')} ₸</div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div>
                      <h3 className="font-bold text-lg flex items-center gap-2">
                        <BarChart2 className="w-5 h-5 text-gray-400" /> {t('reports.abcTitle')}
                      </h3>
                      <p className="text-sm text-gray-500">{t('reports.abcDesc')}</p>
                    </div>
                    <button onClick={exportStatsToCSV} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm">
                      <Download className="w-4 h-4" /> {t('reports.exportCSV')}
                    </button>
                  </div>
                  <div className="overflow-auto max-h-[500px]">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-white sticky top-0 z-10 border-b border-gray-200 text-xs uppercase text-gray-500">
                        <tr>
                          <th className="px-6 py-4">{t('reports.product')}</th>
                          <th className="px-6 py-4 text-center">{t('reports.soldQty')}</th>
                          <th className="px-6 py-4 text-right">{t('reports.revenueCol')}</th>
                          <th className="px-6 py-4 text-right">{t('reports.share')}</th>
                          <th className="px-6 py-4 text-center">{t('reports.class')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {stats.topProducts.map((p: any, idx: number) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-6 py-3">
                              <div className="font-medium text-gray-900">{p.name}</div>
                              <div className="text-xs text-gray-500 mt-0.5">{p.barcode}</div>
                            </td>
                            <td className="px-6 py-3 text-center text-gray-600 font-medium">{p.sold_qty}</td>
                            <td className="px-6 py-3 text-right font-medium text-gray-800">{Number(p.revenue).toLocaleString('ru')} ₸</td>
                            <td className="px-6 py-3 text-right text-gray-500 text-sm">{Number(p.percent).toFixed(1)}%</td>
                            <td className="px-6 py-3 text-center">
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${p.abcClass === 'A' ? 'bg-green-100 text-green-700' : p.abcClass === 'B' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                                }`}>{p.abcClass}</span>
                            </td>
                          </tr>
                        ))}
                        {stats.topProducts.length === 0 && (
                          <tr><td colSpan={5} className="text-center py-6 text-gray-400">{t('reports.noSales')}</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmDialog}
        title={t('reports.closeShift') || 'Закрытие смены'}
        message={t('reports.closeConfirm') || 'Снять Z-отчёт?'}
        onConfirm={handleConfirmCloseShift}
        onCancel={() => setConfirmDialog(false)}
        danger={true}
        confirmText={t('reports.closeShift') || 'Закрыть смену'}
      />
    </div>
  );
}

function HistoryIcon2(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}
