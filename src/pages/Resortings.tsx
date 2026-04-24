import React, { useState, useEffect, useCallback } from 'react';
import { Shuffle, Plus, Search, ArrowRight, Loader2, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/auth';
import { useTranslation } from 'react-i18next';
import { Input } from '../components/ui/input';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface Resorting {
  id: string;
  quantity: number;
  source_product_name: string;
  source_barcode: string;
  target_product_name: string;
  target_barcode: string;
  price_diff: number;
  reason: string;
  user_name: string;
  created_at: string;
}

export default function Resortings() {
  const { company, user } = useAuthStore();
  const { t } = useTranslation();
  const [resortings, setResortings] = useState<Resorting[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Modal state
  const [sourceSearch, setSourceSearch] = useState('');
  const [targetSearch, setTargetSearch] = useState('');
  const [sourceProducts, setSourceProducts] = useState<any[]>([]);
  const [targetProducts, setTargetProducts] = useState<any[]>([]);
  const [selectedSource, setSelectedSource] = useState<any>(null);
  const [selectedTarget, setSelectedTarget] = useState<any>(null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);

  const loadResortings = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    try {
      const res = await (window as any).electronAPI.resortings.getAll(company.id);
      if (res.success) setResortings(res.data);
    } catch { toast.error(t('common.error')); }
    finally { setLoading(false); }
  }, [company]);

  useEffect(() => { loadResortings(); }, [loadResortings]);

  const searchProducts = async (query: string, target: 'source' | 'target') => {
    if (!company?.id) {
      if (target === 'source') setSourceProducts([]);
      else setTargetProducts([]);
      return;
    }
    try {
      const res = await window.electronAPI.inventory.getProducts(company.id, query);
      if (res.success) {
        if (target === 'source') setSourceProducts(res.data || []);
        else setTargetProducts(res.data || []);
      }
    } catch { /* ignore */ }
  };

  const handleCreate = async () => {
    if (!company?.id || !user?.id || !selectedSource || !selectedTarget) return;
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) return toast.error(t('resorting.invalidQty'));
    if (selectedSource.id === selectedTarget.id) return toast.error(t('resorting.sameProduct'));

    setConfirmDialog(true);
  };

  const confirmCreate = async () => {
    setConfirmDialog(false);
    setCreating(true);
    try {
      const res = await (window as any).electronAPI.resortings.create({
        companyId: company!.id,
        userId: user!.id,
        sourceProductId: selectedSource.id,
        targetProductId: selectedTarget.id,
        quantity: parseFloat(quantity),
        reason
      });
      if (res.success) {
        toast.success(t('resorting.created'));
        resetModal();
        loadResortings();
      } else {
        toast.error(res.error || t('common.error'));
      }
    } catch { toast.error(t('common.error')); }
    finally { setCreating(false); }
  };

  const resetModal = () => {
    setShowModal(false);
    setSourceSearch('');
    setTargetSearch('');
    setSourceProducts([]);
    setTargetProducts([]);
    setSelectedSource(null);
    setSelectedTarget(null);
    setQuantity('');
    setReason('');
  };

  return (
    <div className="p-8 h-full flex flex-col bg-gray-50/50">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Shuffle className="w-8 h-8 text-primary" /> {t('resorting.title')}
          </h1>
          <p className="text-gray-500 mt-1">{t('resorting.subtitle')}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-sm">
          <Plus className="w-5 h-5" /> {t('resorting.newAct')}
        </button>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex justify-center items-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
        ) : resortings.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center text-gray-400">
            <Shuffle className="w-16 h-16 mb-4 text-gray-200" />
            <p className="text-lg font-medium">{t('resorting.empty')}</p>
            <p className="text-sm">{t('resorting.emptyHint')}</p>
          </div>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 sticky top-0 z-10 border-b border-gray-200 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-6 py-4">№</th>
                  <th className="px-6 py-4">{t('resorting.date')}</th>
                  <th className="px-6 py-4">{t('resorting.sourceProduct')}</th>
                  <th className="px-6 py-4 text-center"><ArrowRight className="w-4 h-4 inline" /></th>
                  <th className="px-6 py-4">{t('resorting.targetProduct')}</th>
                  <th className="px-6 py-4 text-center">{t('resorting.qty')}</th>
                  <th className="px-6 py-4 text-right">{t('resorting.priceDiff')}</th>
                  <th className="px-6 py-4">{t('resorting.executor')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resortings.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-mono text-xs">{resortings.length - idx}</td>
                    <td className="px-6 py-3 text-sm">{new Date(r.created_at).toLocaleString('ru-RU')}</td>
                    <td className="px-6 py-3">
                      <div className="font-medium text-red-600">{r.source_product_name}</div>
                      <div className="text-xs text-gray-400">{r.source_barcode}</div>
                    </td>
                    <td className="px-6 py-3 text-center"><ArrowRight className="w-5 h-5 text-gray-300 inline" /></td>
                    <td className="px-6 py-3">
                      <div className="font-medium text-green-600">{r.target_product_name}</div>
                      <div className="text-xs text-gray-400">{r.target_barcode}</div>
                    </td>
                    <td className="px-6 py-3 text-center font-bold">{r.quantity}</td>
                    <td className={`px-6 py-3 text-right font-medium ${r.price_diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {r.price_diff >= 0 ? '+' : ''}{Number(r.price_diff).toLocaleString('ru')} ₸
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500">{r.user_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create Resorting */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-8 max-h-[90vh] overflow-auto">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Shuffle className="w-6 h-6 text-primary" /> {t('resorting.newAct')}
            </h2>

            <div className="grid grid-cols-2 gap-6 mb-6">
              {/* Source Product */}
              <div>
                <label className="block text-sm font-medium text-red-600 mb-2">{t('resorting.sourceProduct')} (−)</label>
                {selectedSource ? (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="font-bold">{selectedSource.name}</div>
                    <div className="text-xs text-gray-500">{selectedSource.barcode}</div>
                    <div className="text-xs text-gray-500 mt-1">{t('resorting.stock')}: {selectedSource.stock_quantity}</div>
                    <button onClick={() => setSelectedSource(null)} className="text-xs text-red-500 mt-1 underline">{t('common.cancel')}</button>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      value={sourceSearch}
                      onChange={e => { setSourceSearch(e.target.value); searchProducts(e.target.value, 'source'); }}
                      onFocus={() => searchProducts(sourceSearch, 'source')}
                      placeholder={t('resorting.searchProduct')}
                      className="w-full"
                    />
                    {sourceProducts.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-auto">
                        {sourceProducts.map(p => (
                          <button key={p.id} onClick={() => { setSelectedSource(p); setSourceProducts([]); setSourceSearch(''); }}
                            className="w-full text-left px-4 py-2 hover:bg-gray-50 border-b border-gray-100">
                            <div className="font-medium text-sm">{p.name}</div>
                            <div className="text-xs text-gray-400">{p.barcode} · {t('resorting.stock')}: {p.stock_quantity}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Target Product */}
              <div>
                <label className="block text-sm font-medium text-green-600 mb-2">{t('resorting.targetProduct')} (+)</label>
                {selectedTarget ? (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="font-bold">{selectedTarget.name}</div>
                    <div className="text-xs text-gray-500">{selectedTarget.barcode}</div>
                    <div className="text-xs text-gray-500 mt-1">{t('resorting.stock')}: {selectedTarget.stock_quantity}</div>
                    <button onClick={() => setSelectedTarget(null)} className="text-xs text-red-500 mt-1 underline">{t('common.cancel')}</button>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      value={targetSearch}
                      onChange={e => { setTargetSearch(e.target.value); searchProducts(e.target.value, 'target'); }}
                      onFocus={() => searchProducts(targetSearch, 'target')}
                      placeholder={t('resorting.searchProduct')}
                      className="w-full"
                    />
                    {targetProducts.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-auto">
                        {targetProducts.map(p => (
                          <button key={p.id} onClick={() => { setSelectedTarget(p); setTargetProducts([]); setTargetSearch(''); }}
                            className="w-full text-left px-4 py-2 hover:bg-gray-50 border-b border-gray-100">
                            <div className="font-medium text-sm">{p.name}</div>
                            <div className="text-xs text-gray-400">{p.barcode} · {t('resorting.stock')}: {p.stock_quantity}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('resorting.qty')}</label>
                <Input type="number" min="0.001" max="1000000" value={quantity} onChange={e => setQuantity(Math.min(1000000, parseFloat(e.target.value) || 0).toString())} placeholder="0" className="w-full text-lg font-bold" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('resorting.reason')}</label>
                <Input value={reason} onChange={e => setReason(e.target.value)} placeholder={t('resorting.reasonPlaceholder')} className="w-full" />
              </div>
            </div>

            {selectedSource && selectedTarget && quantity && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
                <div className="text-sm text-gray-500 mb-2">{t('resorting.preview')}:</div>
                <div className="flex items-center gap-3">
                  <span className="text-red-600 font-medium">{selectedSource.name}</span>
                  <span className="text-gray-400">−{quantity}</span>
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                  <span className="text-green-600 font-medium">{selectedTarget.name}</span>
                  <span className="text-gray-400">+{quantity}</span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button onClick={resetModal} className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">{t('common.cancel')}</button>
              <button onClick={handleCreate} disabled={creating || !selectedSource || !selectedTarget || !quantity}
                className="px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-lg font-bold disabled:opacity-50 flex items-center gap-2">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}
                {t('resorting.execute')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog}
        title={t('resorting.confirmTitle')}
        message={t('resorting.confirmMessage')}
        onConfirm={confirmCreate}
        onCancel={() => setConfirmDialog(false)}
        confirmText={t('resorting.execute')}
      />
    </div>
  );
}
