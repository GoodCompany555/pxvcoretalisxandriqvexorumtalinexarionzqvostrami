import React, { useState, useRef, useEffect } from 'react';
import { Undo2, Search, Receipt, CheckCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/auth';
import { useShiftStore } from '../store/shift';
import { useSettingsStore } from '../store/settings';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Input } from '../components/ui/input';
import { PrintableReceipt } from '../components/PrintableReceipt';
import { useReactToPrint } from 'react-to-print';

export default function Returns() {
  const { company, user } = useAuthStore();
  const { currentShift, setCurrentShift } = useShiftStore();
  const [searchReceiptNumber, setSearchReceiptNumber] = useState('');
  const [receipt, setReceipt] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Состояние возвращаемых позиций: { [itemId]: quantityToReturn }
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [confirmDialog, setConfirmDialog] = useState(false);

  const receiptPrintRef = useRef<HTMLDivElement>(null);
  const [completedReceiptData, setCompletedReceiptData] = useState<any>(null);

  const performPrint = useReactToPrint({
    contentRef: receiptPrintRef,
    documentTitle: 'Чек возврата',
    onAfterPrint: () => setCompletedReceiptData(null)
  });

  useEffect(() => {
    if (company?.id && user?.id) {
      window.electronAPI.shifts.getCurrent(company.id, user.id)
        .then(res => {
          if (res.success) setCurrentShift(res.data);
        })
        .catch(() => { });
    }
  }, [company?.id, user?.id]);

  useEffect(() => {
    if (completedReceiptData) {
      setTimeout(() => performPrint(), 300);
    }
  }, [completedReceiptData, performPrint]);

  const handleReprint = async (receiptId: string) => {
    if (!company?.id) return;
    const loader = toast.loading('Печать чека возврата...');
    try {
      if ((window as any).electronAPI?.resetPrinter) {
        await (window as any).electronAPI.resetPrinter();
      }

      const res = await window.electronAPI.pos.reprintReceipt(company.id, receiptId);
      if (res.success && res.data) {
        toast.success(`Готово`, { id: loader });
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
          type: res.data.type
        });
      } else {
        toast.error(res.error || 'Ошибка загрузки данных чека', { id: loader });
      }
    } catch { toast.error('Ошибка печати чека', { id: loader }); }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company?.id) return;
    if (!searchReceiptNumber) return toast.error('Введите номер чека');

    setLoading(true);
    try {
      const res = await window.electronAPI.returns.searchReceipt(company.id, parseInt(searchReceiptNumber, 10));
      if (res.success && res.data) {
        setReceipt(res.data);
        // Инициализируем нулями
        const initialQtys: Record<string, number> = {};
        res.data.items.forEach((item: any) => {
          initialQtys[item.id] = 0;
        });
        setReturnQuantities(initialQtys);
      } else {
        toast.error(res.error || 'Чек не найден');
        setReceipt(null);
      }
    } catch (error) {
      toast.error('Ошибка поиска');
    } finally {
      setLoading(false);
    }
  };

  const handleQuantityChange = (itemId: string, maxQty: number, newValue: string) => {
    const qty = parseFloat(newValue) || 0;
    if (qty < 0) return;
    if (qty > maxQty) {
      toast.error(`Максимальное количество для возврата: ${maxQty}`);
      return;
    }
    setReturnQuantities({ ...returnQuantities, [itemId]: qty });
  };

  const calculateTotalReturn = () => {
    if (!receipt) return 0;
    let total = 0;
    receipt.items.forEach((item: any) => {
      const qtyToReturn = returnQuantities[item.id] || 0;
      // Цена за единицу с учетом скидки = total / quantity
      const unitPriceWithDiscount = item.total / item.quantity;
      total += qtyToReturn * unitPriceWithDiscount;
    });
    return total;
  };

  const handleProcessReturn = async () => {
    if (!company?.id || !user?.id || !receipt) return;

    const itemsToReturn = receipt.items
      .filter((item: any) => (returnQuantities[item.id] || 0) > 0)
      .map((item: any) => {
        const qtyToReturn = returnQuantities[item.id] || 0;
        const unitPriceWithDiscount = item.total / item.quantity;
        const unitBasePrice = item.price;
        const unitDiscount = item.discount / item.quantity;

        return {
          id: item.product_id,
          product_name: item.product_name,
          quantity: qtyToReturn,
          price: unitBasePrice,
          discount: unitDiscount * qtyToReturn,
          total: unitPriceWithDiscount * qtyToReturn,
          mark_code: item.mark_code
        };
      });

    if (itemsToReturn.length === 0) {
      return toast.error('Укажите количество для возврата хотя бы для одного товара');
    }

    setConfirmDialog(true);
  };

  const handleConfirmProcessReturn = async () => {
    setConfirmDialog(false);
    if (!company?.id || !user?.id || !receipt) return;

    const itemsToReturn = receipt.items
      .filter((item: any) => (returnQuantities[item.id] || 0) > 0)
      .map((item: any) => {
        const qtyToReturn = returnQuantities[item.id] || 0;
        const unitPriceWithDiscount = item.total / item.quantity;
        const unitBasePrice = item.price;
        const unitDiscount = item.discount / item.quantity;

        return {
          id: item.product_id,
          product_name: item.product_name,
          quantity: qtyToReturn,
          price: unitBasePrice,
          discount: unitDiscount * qtyToReturn,
          total: unitPriceWithDiscount * qtyToReturn,
          mark_code: item.mark_code
        };
      });

    const returnTotal = calculateTotalReturn();

    // Определяем как возвращать деньги.
    // Если оригинальный чек был оплачен картой - возврат на карту.
    // Если налом - из кассы.
    // Если смешанный - возвращаем в той же пропорции (упрощенно: сначала нал, потом карту, или дать выбрать).
    // Для простоты: если только нал - нал. Если только карта - карта.
    let returnCash = 0;
    let returnCard = 0;
    if (receipt.payment_type === 'cash') {
      returnCash = returnTotal;
    } else if (receipt.payment_type === 'card') {
      returnCard = returnTotal;
    } else {
      // Для смешанной оплаты пока для простоты возвращаем наличными, если не превышает изначальный нал
      if (returnTotal <= receipt.cash_amount) {
        returnCash = returnTotal;
      } else {
        returnCash = receipt.cash_amount;
        returnCard = returnTotal - receipt.cash_amount;
      }
    }

    const loader = toast.loading('Проведение возврата...');
    try {
      if (!currentShift?.id) {
        toast.error('Нет открытой смены. Откройте смену для проведения возврата.', { id: loader });
        return;
      }

      if (returnCash > currentShift.end_cash) {
        toast.error(`В кассе недостаточно наличных для возврата. В кассе: ${currentShift.end_cash} ₸`, { id: loader });
        return;
      }

      const res = await window.electronAPI.returns.process({
        companyId: company.id,
        shiftId: currentShift.id,
        userId: user.id,
        originalReceiptId: receipt.id,
        items: itemsToReturn,
        paymentType: returnCash > 0 && returnCard > 0 ? 'mixed' : returnCash > 0 ? 'cash' : 'card',
        returnCashAmount: returnCash,
        returnCardAmount: returnCard
      });

      if (res.success) {
        toast.success(`Возврат проведен успешно! Чек №${res.data?.receiptId?.split('-')[0]}`, { id: loader });
        setReceipt(null);
        setSearchReceiptNumber('');
        if (res.data?.receiptId) {
          handleReprint(res.data.receiptId);
        }
      } else {
        toast.error(res.error || 'Ошибка проведения возврата', { id: loader });
      }
    } catch (e) {
      toast.error('Ошибка', { id: loader });
    }
  };


  return (
    <div className="p-8 h-full flex flex-col bg-gray-50/50">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Undo2 className="w-8 h-8 text-primary" />
            Возврат товара
          </h1>
          <p className="text-gray-500 mt-1">Оформление частичного или полного возврата по чеку</p>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">

        {/* Левая панель - Поиск */}
        <div className="w-[400px] flex flex-col gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-gray-400" />
              Поиск чека
            </h2>
            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Номер чека</label>
                <Input
                  type="number"
                  value={searchReceiptNumber}
                  onChange={e => setSearchReceiptNumber(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="Например: 124"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary hover:bg-primary/90 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-70"
              >
                {loading ? 'Поиск...' : 'Найти чек'}
              </button>
            </form>
          </div>

          {/* Инфо о чеке */}
          {receipt && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex-1">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-gray-400" />
                Информация о чеке
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-500">Дата и время</span>
                  <span className="font-medium">{new Date(receipt.created_at).toLocaleString('ru-RU')}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-500">Кассир</span>
                  <span className="font-medium">{receipt.cashier_name}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-500">Тип оплаты</span>
                  <span className="font-medium">
                    {receipt.payment_type === 'cash' ? 'Наличные' : receipt.payment_type === 'card' ? 'Карта' : 'Смешанная'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-500">Сумма чека</span>
                  <span className="font-bold text-lg">{receipt.total_amount.toLocaleString('ru')} ₸</span>
                </div>
              </div>

              <div className="mt-6 bg-blue-50 text-blue-800 p-4 rounded-lg flex gap-3 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>Укажите количество возвращаемых товаров в таблице справа. Сумма к возврату рассчитается автоматически.</p>
              </div>
            </div>
          )}
        </div>

        {/* Правая панель - Позиции чека */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
          {receipt ? (
            <>
              <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                <h2 className="text-lg font-bold">Товары в чеке №{receipt.receipt_number}</h2>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-white sticky top-0 z-10 border-b border-gray-100 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-6 py-4">Товар</th>
                      <th className="px-6 py-4 text-center">Куплено</th>
                      <th className="px-6 py-4 text-right">Цена со скидкой</th>
                      <th className="px-6 py-4 text-right">Итого позиция</th>
                      <th className="px-6 py-4 text-center bg-blue-50/50">Вернуть (кол-во)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {receipt.items.map((item: any) => {
                      const unitPriceWithDiscount = item.total / item.quantity;
                      const qtyToReturn = returnQuantities[item.id] || 0;

                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div className="font-medium text-gray-900">{item.product_name}</div>
                            <div className="text-xs text-gray-500 mt-1">{item.barcode}</div>
                            {item.mark_code && <div className="text-[10px] text-purple-600 mt-0.5">КМ: {item.mark_code}</div>}
                          </td>
                          <td className="px-6 py-4 text-center font-medium text-gray-700">
                            {item.quantity}
                          </td>
                          <td className="px-6 py-4 text-right text-sm text-gray-600">
                            {unitPriceWithDiscount.toLocaleString('ru')} ₸
                          </td>
                          <td className="px-6 py-4 text-right font-medium text-gray-800">
                            {item.total.toLocaleString('ru')} ₸
                          </td>
                          <td className="px-6 py-4 bg-blue-50/20">
                            <div className="flex justify-center">
                              <Input
                                type="number"
                                min="0"
                                max={item.quantity}
                                step="any"
                                value={qtyToReturn === 0 ? '' : qtyToReturn}
                                onChange={e => handleQuantityChange(item.id, item.quantity, e.target.value)}
                                placeholder="0"
                                className="w-24 px-3 py-1.5 border border-blue-200 rounded text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-bold text-blue-700 bg-white"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Футер с итогом возврата */}
              <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
                <div>
                  <div className="text-sm text-gray-500">Сумма к возврату:</div>
                  <div className="text-3xl font-black text-red-600">
                    {calculateTotalReturn().toLocaleString('ru')} ₸
                  </div>
                </div>
                <button
                  onClick={handleProcessReturn}
                  disabled={calculateTotalReturn() <= 0}
                  className="bg-red-500 hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-sm shadow-red-500/20"
                >
                  <CheckCircle className="w-5 h-5" />
                  Провести возврат
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
              <Receipt className="w-16 h-16 mb-4 text-gray-200" />
              <p className="text-lg font-medium text-gray-500">Найдите чек для начала оформления возврата</p>
              <p className="text-sm mt-2">Введите номер чека в панели слева</p>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog}
        title="Провести возврат?"
        message={`Провести возврат на сумму ${calculateTotalReturn().toLocaleString('ru')} ₸?`}
        onConfirm={handleConfirmProcessReturn}
        onCancel={() => setConfirmDialog(false)}
        danger={true}
        confirmText="Оформить"
      />

      {/* Скрытый чек для печати */}
      <div className="hidden">
        <PrintableReceipt receiptData={completedReceiptData} ref={receiptPrintRef} showFiscalBadge={useSettingsStore.getState().showFiscalBadge} />
      </div>
    </div>
  );
}
