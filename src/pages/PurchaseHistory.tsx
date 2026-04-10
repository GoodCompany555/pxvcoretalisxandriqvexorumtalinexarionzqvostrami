import React, { useState, useEffect, useRef } from 'react';
import { FileText, Printer, Undo2, Eye, ChevronLeft, Loader2, Search, RefreshCcw, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/auth';
import { useSettingsStore } from '../store/settings';
import { useShiftStore } from '../store/shift';
import { useTranslation } from 'react-i18next';
import { PrintableReceipt } from '../components/PrintableReceipt';
import { useReactToPrint } from 'react-to-print';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Input } from '../components/ui/input';


export default function PurchaseHistory() {
  const { company, user } = useAuthStore();
  const { currentShift } = useShiftStore();
  const { t } = useTranslation();

  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    receipt: null as any,
  });

  useEffect(() => {
    if (company?.id) loadReceipts();
  }, [company?.id]);

  const loadReceipts = async () => {
    if (!company?.id) return;
    setLoading(true);
    try {
      const res = await window.electronAPI.pos.getReceipts(company.id);
      if (res.success && res.data) setReceipts(res.data);
      else toast.error(res.error || 'Ошибка');
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  };

  const openReceiptDetails = async (receiptId: string) => {
    if (!company?.id) return;
    setDetailLoading(true);
    try {
      const res = await window.electronAPI.pos.getReceiptDetails(company.id, receiptId);
      if (res.success && res.data) setSelectedReceipt(res.data);
      else toast.error(res.error || 'Ошибка');
    } catch { toast.error('Ошибка загрузки деталей'); }
    finally { setDetailLoading(false); }
  };

  const printDuplicate = async (receiptId: string) => {
    if (!company) return;
    try {
      if ((window as any).electronAPI?.resetPrinter) {
        await (window as any).electronAPI.resetPrinter();
      }

      const res = await window.electronAPI.pos.reprintReceipt(company.id, receiptId);
      if (res.success && res.data) {
        setCompletedReceiptData({ ...res.data, isDuplicate: true });
        // Printing is automatically triggered by the useEffect below
      } else {
        toast.error(res.error || 'Ошибка загрузки данных чека');
      }
    } catch (error: any) {
      toast.error('Ошибка печати чека');
    }
  };

  const receiptPrintRef = useRef<HTMLDivElement>(null);
  const [completedReceiptData, setCompletedReceiptData] = useState<any>(null);

  const performPrint = useReactToPrint({
    contentRef: receiptPrintRef,
    documentTitle: 'Дубликат чека',
    onAfterPrint: () => setCompletedReceiptData(null)
  });

  useEffect(() => {
    if (completedReceiptData) {
      setTimeout(() => performPrint(), 300);
    }
  }, [completedReceiptData, performPrint]);

  const handleReprint = async (receiptId: string) => {
    if (!company?.id) return;
    const loader = toast.loading('Формирование дубликата...');
    try {
      const res = await window.electronAPI.pos.reprintReceipt(company.id, receiptId);
      if (res.success && res.data) {
        toast.success(`Дубликат чека #${res.data.receipt_number} готов`, { id: loader });

        // Форматируем данные для компонента печати
        setCompletedReceiptData({
          companyName: company.name,
          companyBin: company.bin,
          companyAddress: company.address,
          cashierName: res.data.cashier_name,
          receiptNumber: res.data.receipt_number,
          items: (res.data.items || []).map((i: any) => ({
            name: i.name || 'Товар',
            name_kk: i.name_kk || '',
            quantity: i.quantity,
            price: i.price,
            total: i.total
          })),
          totalAmount: res.data.total_amount,
          vatAmount: Math.round(res.data.total_amount * 16 / 116),
          cashAmount: res.data.cash_amount,
          cardAmount: res.data.card_amount,
          paymentType: res.data.payment_type,
          ofdTicketUrl: res.data.ofd_ticket_url,
          date: new Date(res.data.created_at).toLocaleString('ru-RU'),
          type: res.data.type // Важно для вывода Возврат
        });
      } else {
        toast.error(res.error || 'Ошибка', { id: loader });
      }
    } catch { toast.error('Ошибка печати', { id: loader }); }
  };

  const handleReturnClick = (receipt: any) => {
    if (!company?.id || !user?.id || !currentShift?.id) {
      toast.error('Невозможно оформить возврат: смена не открыта');
      return;
    }

    if (!receipt.items || receipt.items.length === 0) {
      toast.error('Нет позиций для возврата');
      return;
    }

    setConfirmDialog({ isOpen: true, receipt });
  };

  const handleConfirmReturn = async () => {
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
    const { receipt } = confirmDialog;
    if (!company?.id || !user?.id || !currentShift?.id || !receipt) return;

    const loader = toast.loading('Оформляем возврат...');
    try {
      const res = await window.electronAPI.returns.process({
        companyId: company.id,
        shiftId: currentShift.id,
        userId: user.id,
        originalReceiptId: receipt.id,
        paymentType: receipt.payment_type,
        returnCashAmount: Number(receipt.cash_amount) || 0,
        returnCardAmount: Number(receipt.card_amount) || 0,
        items: receipt.items.map((item: any) => ({
          id: item.product_id,
          product_name: item.name,
          quantity: item.quantity,
          price: item.price,
          discount: item.discount || 0,
          total: item.total,
          mark_code: item.mark_code || null,
        })),
      });
      if (res.success) {
        toast.success(`Возврат оформлен! Чек возврата: #${res.data?.receiptId?.slice(0, 8)}`, { id: loader });
        loadReceipts();
        setSelectedReceipt(null);
        if (res.data?.receiptId) {
          handleReprint(res.data.receiptId);
        }
      } else {
        toast.error(res.error || 'Ошибка возврата', { id: loader });
      }
    } catch { toast.error('Ошибка оформления возврата', { id: loader }); }
  };

  // Фильтрация
  const filteredReceipts = receipts.filter(r => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(r.receipt_number).includes(q) ||
      (r.cashier_name || '').toLowerCase().includes(q) ||
      (r.payment_type || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">
      {/* Список чеков */}
      <div className="w-[480px] bg-white flex flex-col border-r border-gray-200">
        <div className="p-5 border-b border-gray-100">
          <h1 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" /> История покупок
          </h1>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="Поиск по номеру чека..."
              />
            </div>
            <button onClick={loadReceipts} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors">
              <RefreshCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : filteredReceipts.length === 0 ? (
            <div className="text-center text-gray-400 py-20">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-200" />
              <p className="font-medium">Чеков нет</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredReceipts.map(receipt => (
                <button
                  key={receipt.id}
                  onClick={() => openReceiptDetails(receipt.id)}
                  className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${selectedReceipt?.id === receipt.id ? 'bg-primary/5 border-l-4 border-primary' : ''}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900">#{receipt.receipt_number}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${receipt.type === 'sale' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {receipt.type === 'sale' ? 'Продажа' : 'Возврат'}
                      </span>
                    </div>
                    <span className="font-bold text-gray-900">{Number(receipt.total_amount).toLocaleString('ru')} ₸</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>{receipt.cashier_name || 'Кассир'}</span>
                    <span>{new Date(receipt.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded ${receipt.payment_type === 'cash' ? 'bg-green-50 text-green-600' :
                      receipt.payment_type === 'card' ? 'bg-blue-50 text-blue-600' :
                        receipt.payment_type === 'qr' ? 'bg-purple-50 text-purple-600' : 'bg-gray-50 text-gray-600'
                      }`}>
                      {receipt.payment_type === 'cash' ? '💵 Наличные' :
                        receipt.payment_type === 'card' ? '💳 Карта' :
                          receipt.payment_type === 'qr' ? '📱 QR' : '🔀 Смешанная'}
                    </span>
                    {receipt.terminal_bank && (
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{receipt.terminal_bank}</span>
                    )}
                    {receipt.ofd_status === 'sent' && (
                      <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded">✅ ОФД</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Детали чека */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : !selectedReceipt ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Eye className="w-16 h-16 mx-auto mb-4 text-gray-200" />
              <p className="text-lg font-medium mb-1">Выберите чек</p>
              <p className="text-sm">Нажмите на чек слева чтобы увидеть детали</p>
            </div>
          </div>
        ) : (
          <>
            {/* Заголовок чека */}
            <div className="bg-gray-900 text-white p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-2xl font-black">Чек #{selectedReceipt.receipt_number}</h2>
                  <p className="text-gray-400 text-sm mt-1">
                    {new Date(selectedReceipt.created_at).toLocaleString('ru-RU')} • {selectedReceipt.cashier_name}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-medium px-3 py-1 rounded-full ${selectedReceipt.type === 'sale' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {selectedReceipt.type === 'sale' ? '✅ Продажа' : '↩️ Возврат'}
                  </span>
                </div>
              </div>
              <div className="text-4xl font-black">{Number(selectedReceipt.total_amount).toLocaleString('ru')} ₸</div>
            </div>

            {/* Товары */}
            <div className="flex-1 overflow-y-auto p-6">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Package className="w-4 h-4" /> Товары в чеке ({selectedReceipt.items?.length || 0})
              </h3>
              <div className="space-y-3">
                {(selectedReceipt.items || []).map((item: any, idx: number) => (
                  <div key={idx} className="bg-white p-4 rounded-xl border border-gray-200 flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-bold text-gray-900">{item.name || 'Товар'}</div>
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-3">
                        {item.barcode && <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{item.barcode}</span>}
                        <span>{item.quantity} × {Number(item.price).toLocaleString('ru')} ₸</span>
                      </div>
                    </div>
                    <div className="font-bold text-gray-900 text-lg">
                      {Number(item.total).toLocaleString('ru')} ₸
                    </div>
                  </div>
                ))}
              </div>

              {/* Сводка */}
              <div className="mt-6 bg-gray-50 rounded-xl p-5 border border-gray-200 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Способ оплаты:</span>
                  <span className="font-medium">{
                    selectedReceipt.payment_type === 'cash' ? 'Наличные' :
                      selectedReceipt.payment_type === 'card' ? 'Карта' :
                        selectedReceipt.payment_type === 'qr' ? 'QR' : 'Смешанная'
                  }</span>
                </div>
                {selectedReceipt.terminal_bank && (
                  <div className="flex justify-between text-gray-600">
                    <span>Банк терминала:</span>
                    <span className="font-medium">{selectedReceipt.terminal_bank}</span>
                  </div>
                )}
                {selectedReceipt.cash_amount > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Наличные:</span>
                    <span className="font-medium">{Number(selectedReceipt.cash_amount).toLocaleString('ru')} ₸</span>
                  </div>
                )}
                {selectedReceipt.card_amount > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Карта:</span>
                    <span className="font-medium">{Number(selectedReceipt.card_amount).toLocaleString('ru')} ₸</span>
                  </div>
                )}
                {selectedReceipt.discount_amount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Скидка:</span>
                    <span className="font-medium">-{Number(selectedReceipt.discount_amount).toLocaleString('ru')} ₸</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-300">
                  <span>ИТОГО:</span>
                  <span className="text-lg">{Number(selectedReceipt.total_amount).toLocaleString('ru')} ₸</span>
                </div>
              </div>

              {/* Фискализация */}
              {selectedReceipt.ofd_ticket_url && (
                <div className="mt-4 bg-green-50 p-4 rounded-xl border border-green-200 text-sm">
                  <p className="text-green-700 font-medium mb-1">✅ Фискализирован</p>
                  <a href={selectedReceipt.ofd_ticket_url} target="_blank" rel="noopener" className="text-green-600 underline text-xs break-all">
                    {selectedReceipt.ofd_ticket_url}
                  </a>
                </div>
              )}
            </div>

            {/* Действия */}
            <div className="p-4 border-t border-gray-200 bg-white flex gap-3">
              <button onClick={() => setSelectedReceipt(null)}
                className="px-5 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium text-gray-600 transition-colors flex items-center gap-2">
                <ChevronLeft className="w-4 h-4" /> Назад
              </button>
              {/* Кнопки */}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => handleReprint(selectedReceipt.id)}
                  className="flex-1 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <Printer className="w-5 h-5" /> Печать дубликата
                </button>
                {selectedReceipt.type === 'sale' && (
                  <button
                    onClick={() => handleReturnClick(selectedReceipt)}
                    className="flex-1 bg-white border border-red-200 text-red-600 hover:bg-red-50 px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Undo2 className="w-5 h-5" /> Оформить возврат
                  </button>
                )}
              </div>
            </div>
            {/* Скрытый чек для печати */}
            <div className="hidden">
              <PrintableReceipt receiptData={completedReceiptData} ref={receiptPrintRef} showFiscalBadge={useSettingsStore.getState().showFiscalBadge} />
            </div>

            <ConfirmDialog
              isOpen={confirmDialog.isOpen}
              title="Оформить возврат?"
              message={`Вы уверены, что хотите оформить полный возврат по чеку #${confirmDialog.receipt?.receipt_number}?\nСумма возврата: ${Number(confirmDialog.receipt?.total_amount || 0).toLocaleString('ru')} ₸`}
              onConfirm={handleConfirmReturn}
              onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
              danger={true}
              confirmText="Оформить возврат"
            />
          </>
        )}
      </div>
    </div>
  );
}
