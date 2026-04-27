import React, { useState, useEffect } from 'react';
import { X, ArrowRight, Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

interface TransferDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  transferId: string | null;
  companyId: string;
}

export function TransferDetailsModal({ isOpen, onClose, transferId, companyId }: TransferDetailsModalProps) {
  const { t } = useTranslation();
  const [transfer, setTransfer] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && transferId) {
      loadTransfer();
    } else {
      setTransfer(null);
    }
  }, [isOpen, transferId]);

  const loadTransfer = async () => {
    try {
      setLoading(true);
      const res = await window.electronAPI.transfers.getOne(companyId, transferId!);
      if (res.success) {
        setTransfer(res.data);
      } else {
        toast.error(res.error || 'Ошибка загрузки перемещения');
        onClose();
      }
    } catch (error) {
      toast.error('Ошибка сервера');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            Просмотр перемещения
          </h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loading || !transfer ? (
            <div className="h-40 flex items-center justify-center text-gray-500">Загрузка...</div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div>
                  <div className="text-sm text-gray-500 mb-1">Документ</div>
                  <div className="font-semibold text-lg">{transfer.doc_number}</div>
                  <div className="text-sm text-gray-500">{new Date(transfer.date).toLocaleString('ru-RU')}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Статус</div>
                  <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
                    ${transfer.status === 'completed' ? 'bg-green-100 text-green-800' :
                      transfer.status === 'draft' ? 'bg-amber-100 text-amber-800' :
                        'bg-red-100 text-red-800'}`}
                  >
                    {transfer.status === 'completed' ? 'Проведен' : transfer.status === 'draft' ? 'Черновик' : 'Отменен'}
                  </div>
                </div>
                <div className="col-span-2 flex items-center gap-4 mt-2">
                  <div className="flex-1 bg-white p-3 rounded-lg border border-gray-200">
                    <div className="text-xs text-gray-500 mb-1">Склад-отправитель</div>
                    <div className="font-medium text-gray-900">{transfer.from_warehouse_name}</div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                  <div className="flex-1 bg-white p-3 rounded-lg border border-gray-200">
                    <div className="text-xs text-gray-500 mb-1">Склад-получатель</div>
                    <div className="font-medium text-gray-900">{transfer.to_warehouse_name}</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-3 text-lg">Товары ({transfer.items?.length || 0} поз.)</h3>
                <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-3 text-sm font-semibold text-gray-600 w-16">№</th>
                        <th className="px-4 py-3 text-sm font-semibold text-gray-600">Штрихкод</th>
                        <th className="px-4 py-3 text-sm font-semibold text-gray-600">Наименование</th>
                        <th className="px-4 py-3 text-sm font-semibold text-gray-600 text-right">Количество</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {transfer.items?.map((item: any, index: number) => (
                        <tr key={index} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{item.product_barcode}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{item.product_name}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-semibold">{item.quantity}</span>
                            <span className="text-gray-500 text-sm ml-1">{item.measure_unit || 'шт'}</span>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50">
                        <td colSpan={3} className="px-4 py-3 text-right font-semibold text-gray-700">Итого:</td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                          {transfer.items?.reduce((sum: number, item: any) => sum + item.quantity, 0)} ед.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
