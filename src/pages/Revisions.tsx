import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../store/auth';
import toast from 'react-hot-toast';
import {
  ClipboardCheck,
  Plus,
  Eye,
  CheckCircle2,
  XCircle,
  Search,
  ArrowLeft,
  AlertTriangle,
  Printer,
  ChevronRight,
  Factory,
  Tag,
  Warehouse
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Input } from '../components/ui/input';
import NumPad from '../components/NumPad';
import { useTranslation } from 'react-i18next';

// ───── Types ─────
interface Revision {
  id: string;
  company_id: string;
  revision_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  total_items: number;
  matched_items: number;
  shortage_amount: number;
  surplus_amount: number;
  notes: string;
  created_at: string;
  user_name: string;
}

interface RevisionItem {
  id: string;
  revision_id: string;
  product_id: string;
  product_name: string;
  product_barcode: string;
  measure_unit: string;
  system_quantity: number;
  actual_quantity: number | null;
  difference: number | null;
  unit_price: number;
  difference_amount: number;
  status: string;
}

export default function Revisions() {
  const { t } = useTranslation();
  const { company, user } = useAuthStore();

  // ───── Status Badges ─────
  const statusLabel: Record<string, { text: string; color: string }> = {
    draft: { text: `🟡 ${t('revision.status.draft')}`, color: 'bg-yellow-100 text-yellow-800' },
    in_progress: { text: `🔵 ${t('revision.status.in_progress')}`, color: 'bg-blue-100 text-blue-800' },
    completed: { text: `🟢 ${t('revision.status.completed')}`, color: 'bg-green-100 text-green-800' },
    cancelled: { text: `🔴 ${t('revision.status.cancelled')}`, color: 'bg-red-100 text-red-800' },
  };

  const RevisionRow = ({ item, isEditable, onUpdate, onEditClick }: { item: RevisionItem, isEditable: boolean, onUpdate: (id: string, val: string) => void, onEditClick: (item: RevisionItem) => void }) => {
    return (
      <tr className={item.status === 'counted' ? '' : 'bg-gray-50/50'}>
        <td className="px-4 py-2 text-gray-500 font-mono text-xs">{item.product_barcode || '—'}</td>
        <td className="px-4 py-2 font-medium">{item.product_name}</td>
        <td className="px-4 py-2 text-center text-gray-500">{item.measure_unit}</td>
        <td className="px-4 py-2 text-center font-bold">{item.system_quantity}</td>
        <td className="px-4 py-2 text-center">
          {isEditable ? (
            <button
              onClick={() => onEditClick(item)}
              className="min-w-[80px] text-center px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:ring-2 focus:ring-primary/20 outline-none transition-colors"
            >
              {item.actual_quantity ?? '___'}
            </button>
          ) : (
            <span className="font-bold">{item.actual_quantity ?? '—'}</span>
          )}
        </td>
        <td className="px-4 py-2 text-center font-bold">
          {item.difference != null ? (
            <span className={item.difference < 0 ? 'text-red-600' : item.difference > 0 ? 'text-green-600' : 'text-gray-400'}>
              {item.difference > 0 ? '+' : ''}{item.difference}
            </span>
          ) : (
            <span className="text-gray-300">⏳</span>
          )}
        </td>
      </tr>
    );
  };

  // ───── State ─────
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedRevision, setSelectedRevision] = useState<(Revision & { items: RevisionItem[] }) | null>(null);
  const [revType, setRevType] = useState<'full' | 'category' | 'supplier'>('full');
  const [search, setSearch] = useState('');
  const [activeEditingItem, setActiveEditingItem] = useState<RevisionItem | null>(null);
  const [editTempValue, setEditTempValue] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const autoSaveRef = useRef<NodeJS.Timeout | null>(null);

  // Confirm dialog (no native confirm!)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

  // ───── Load list ─────
  const loadRevisions = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    try {
      const res = await (window as any).electronAPI.revisions.getAll(company.id);
      if (res.success) setRevisions(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [company?.id]);

  useEffect(() => { loadRevisions(); }, [loadRevisions]);

  const loadCategories = useCallback(async () => {
    if (!company?.id) return;
    try {
      const res = await (window as any).electronAPI.inventory.getCategories(company.id);
      if (res.success) setCategories(res.data);
    } catch { /* ignore */ }
  }, [company?.id]);

  const loadSuppliers = useCallback(async () => {
    if (!company?.id) return;
    try {
      const res = await (window as any).electronAPI.suppliers.getAll(company.id);
      if (res.success) setSuppliers(res.data);
    } catch { /* ignore */ }
  }, [company?.id]);

  useEffect(() => {
    if (view === 'create') {
      loadCategories();
      loadSuppliers();
    }
  }, [view, loadCategories, loadSuppliers]);

  // ───── Load detail ─────
  const openRevision = async (id: string) => {
    if (!company?.id) return;
    const loader = toast.loading(t('common.loading'));
    try {
      const res = await (window as any).electronAPI.revisions.getOne(company.id, id);
      if (res.success) {
        setSelectedRevision(res.data);
        setView('detail');
        toast.dismiss(loader);
      } else {
        toast.error(res.error || t('common.error'), { id: loader });
      }
    } catch {
      toast.error(t('common.error'), { id: loader });
    }
  };

  const handleCreate = async () => {
    if (!company?.id || !user?.id) return;
    if (revType === 'category' && !selectedCategoryId) {
      toast.error(t('warehouse.selectCategory'));
      return;
    }
    if (revType === 'supplier' && !selectedSupplierId) {
      toast.error(t('purchases.selectSupplier'));
      return;
    }
    const loader = toast.loading(`${t('revision.start')}...`);
    try {
      const res = await (window as any).electronAPI.revisions.create({
        companyId: company.id,
        userId: user.id,
        type: revType,
        categoryId: revType === 'category' ? selectedCategoryId : undefined,
        supplierId: revType === 'supplier' ? selectedSupplierId : undefined,
      });
      if (res.success) {
        toast.success(t('revision.successComplete'), { id: loader });
        await openRevision(res.data.id);
      } else {
        toast.error(res.error || t('common.error'), { id: loader });
      }
    } catch (error: any) {
      toast.error(`${t('common.error')}: ${error.message}`, { id: loader });
      console.error(error);
    }
  };

  // ───── Update item ─────
  const handleUpdateItem = async (itemId: string, value: string) => {
    if (!selectedRevision) return;
    let actualQuantity = parseFloat(value);
    if (isNaN(actualQuantity) || actualQuantity < 0) return;
    actualQuantity = Math.min(1000000, actualQuantity);

    try {
      const res = await (window as any).electronAPI.revisions.updateItem({
        itemId,
        revisionId: selectedRevision.id,
        actualQuantity,
      });
      if (res.success) {
        // Update locally
        setSelectedRevision(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map(i =>
              i.id === itemId
                ? { ...i, actual_quantity: actualQuantity, difference: actualQuantity - i.system_quantity, difference_amount: (actualQuantity - i.system_quantity) * i.unit_price, status: 'counted' }
                : i
            ),
          };
        });
      }
    } catch { /* silent */ }
  };

  // ───── Auto save trigger ─────
  useEffect(() => {
    if (view === 'detail' && selectedRevision && selectedRevision.status === 'draft') {
      autoSaveRef.current = setInterval(async () => {
        // Just keep alive — items are saved on each blur
      }, 30000);
    }
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [view, selectedRevision]);

  // ───── Complete ─────
  const handleComplete = () => {
    if (!company?.id || !selectedRevision) return;

    const uncounted = selectedRevision.items.filter(i => i.status === 'pending').length;
    const message = uncounted > 0
      ? t('revision.uncountedMsg').replace('{{count}}', String(uncounted))
      : t('revision.completeConfirmMsg');

    setConfirmDialog({
      isOpen: true,
      title: t('revision.completeConfirmTitle'),
      message,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        const loader = toast.loading(t('common.loading'));
        try {
          const res = await (window as any).electronAPI.revisions.complete(company!.id, selectedRevision!.id);
          if (res.success) {
            toast.success(t('revision.successComplete'), { id: loader });
            setView('list');
            setSelectedRevision(null);
            loadRevisions();
          } else {
            toast.error(res.error || t('common.error'), { id: loader });
          }
        } catch {
          toast.error(t('common.error'), { id: loader });
        }
      },
      confirmText: t('common.yes'),
      cancelText: t('common.no')
    });
  };

  // ───── Cancel ─────
  const handleCancel = () => {
    if (!company?.id || !selectedRevision) return;
    setConfirmDialog({
      isOpen: true,
      title: t('revision.cancelConfirmTitle'),
      message: t('revision.cancelConfirmMsg'),
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          const result = await (window as any).electronAPI.cancelRevision(selectedRevision.id);
          if (result?.success) {
            await loadRevisions();
            toast.success(t('revision.successCancel'));
            setView('list');
            setSelectedRevision(null);
          } else {
            toast.error(result?.message ?? t('common.error'));
          }
        } catch (error: any) {
          toast.error(t('common.error') + ': ' + error.message);
        }
      },
      confirmText: t('common.yes'),
      cancelText: t('common.no')
    });
  };

  // ───── Filtered items ─────
  const filteredItems = selectedRevision?.items.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return i.product_name.toLowerCase().includes(q) || (i.product_barcode || '').includes(q);
  }) || [];

  // ───── Summary calc ─────
  const summary = selectedRevision ? (() => {
    const counted = selectedRevision.items.filter(i => i.status === 'counted');
    const shortages = counted.filter(i => (i.difference ?? 0) < 0);
    const surpluses = counted.filter(i => (i.difference ?? 0) > 0);
    const matched = counted.filter(i => (i.difference ?? 0) === 0);
    const shortageAmount = shortages.reduce((sum, i) => sum + Math.abs(i.difference_amount || 0), 0);
    const surplusAmount = surpluses.reduce((sum, i) => sum + (i.difference_amount || 0), 0);
    return { counted: counted.length, shortages: shortages.length, surpluses: surpluses.length, matched: matched.length, shortageAmount, surplusAmount };
  })() : null;

  const handlePrint = async () => {
    try {
      if (!selectedRevision || !summary) return;
      const printData = {
        ...selectedRevision,
        shortage_amount: summary.shortageAmount,
        surplus_amount: summary.surplusAmount
      };
      await (window as any).electronAPI.printRevisionAct(printData);
    } catch (error: any) {
      toast.error(t('common.error') + ': ' + error.message);
    }
  };

  // ═══════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════

  // ─── CREATE VIEW ───
  if (view === 'create') {
    return (
      <div className="p-6 max-w-4xl mx-auto h-full flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => setView('list')} className="flex items-center gap-2 text-gray-500 hover:text-primary transition-colors font-medium">
            <ArrowLeft className="w-5 h-5" /> {t('revision.backToList')}
          </button>
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <ClipboardCheck className="w-6 h-6 text-primary" />
            </div>
            {t('revision.new')}
          </h2>
          <div className="w-24"></div> {/* Spacer */}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[
            { value: 'full', label: t('revision.full'), desc: t('revision.fullDesc'), icon: <Warehouse className="w-8 h-8" /> },
            { value: 'category', label: t('revision.category'), desc: t('revision.categoryDesc'), icon: <Tag className="w-8 h-8" /> },
            { value: 'supplier', label: t('purchases.supplier'), desc: t('revision.partialDesc'), icon: <Factory className="w-8 h-8" /> },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => {
                setRevType(opt.value as any);
                setSelectedCategoryId('');
                setSelectedSupplierId('');
              }}
              className={`relative overflow-hidden group p-6 rounded-2xl border-2 text-left transition-all duration-300 ${revType === opt.value ? 'border-primary bg-primary/5 ring-4 ring-primary/5' : 'border-gray-100 bg-white hover:border-gray-300'}`}
            >
              <div className={`p-3 rounded-xl mb-4 inline-block transition-colors ${revType === opt.value ? 'bg-primary text-white' : 'bg-gray-50 text-gray-400 group-hover:text-primary'}`}>
                {opt.icon}
              </div>
              <div className="font-bold text-lg mb-1">{opt.label}</div>
              <div className="text-sm text-gray-500 leading-relaxed">{opt.desc}</div>
              {revType === opt.value && (
                <div className="absolute top-4 right-4 text-primary">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Selection Area */}
        {revType !== 'full' && (
          <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-xl shadow-gray-200/50 p-6 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              {revType === 'category' ? t('warehouse.category') : t('purchases.supplier')}
            </h3>

            <div className="flex-1 overflow-auto pr-2 custom-scrollbar">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(revType === 'category' ? categories : suppliers).map(item => {
                  const isSelected = revType === 'category' ? selectedCategoryId === item.id : selectedSupplierId === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => revType === 'category' ? setSelectedCategoryId(item.id) : setSelectedSupplierId(item.id)}
                      className={`flex items-center justify-between p-4 rounded-xl border text-left transition-all ${isSelected ? 'border-primary bg-primary/5 font-bold shadow-sm' : 'border-gray-100 bg-gray-50/50 hover:bg-gray-100 hover:border-gray-200'}`}
                    >
                      <span className="truncate">{item.name}</span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0 ml-2" />}
                      {!isSelected && <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>

              {(revType === 'category' ? categories : suppliers).length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  {t('common.noData')}
                </div>
              )}
            </div>
          </div>
        )}

        {revType === 'full' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <div className="w-20 h-20 bg-primary/5 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <Warehouse className="w-10 h-10" />
              </div>
              <p className="text-gray-500">{t('revision.fullDesc')}</p>
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 text-yellow-600 bg-yellow-50 px-4 py-2 rounded-xl text-sm border border-yellow-100">
            <AlertTriangle className="w-5 h-5" />
            <span>{t('revision.creationHint')}</span>
          </div>

          <button
            onClick={handleCreate}
            disabled={revType === 'category' ? !selectedCategoryId : revType === 'supplier' ? !selectedSupplierId : false}
            className="px-10 py-4 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/30 flex items-center gap-3"
          >
            {t('revision.start')}
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // ─── DETAIL VIEW ───
  if (view === 'detail' && selectedRevision) {
    const isEditable = selectedRevision.status === 'draft';
    const progress = selectedRevision.total_items > 0
      ? Math.round((selectedRevision.items.filter(i => i.status === 'counted').length / selectedRevision.total_items) * 100)
      : 0;

    return (
      <div className="p-6 h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => { setView('list'); setSelectedRevision(null); loadRevisions(); }} className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                {t('revision.revisionNo')} #{selectedRevision.id.slice(0, 6).toUpperCase()}
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusLabel[selectedRevision.status]?.color || ''}`}>
                  {statusLabel[selectedRevision.status]?.text || selectedRevision.status}
                </span>
              </h2>
              <p className="text-sm text-gray-500">
                {new Date(selectedRevision.started_at).toLocaleString('ru-RU')} • {selectedRevision.user_name} • {selectedRevision.total_items} {t('revision.total_items').toLowerCase()}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handlePrint()}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-medium flex items-center gap-2 transition-colors border border-gray-200"
            >
              <Printer className="w-4 h-4" /> {t('revision.print')}
            </button>
            {isEditable && (
              <>
                <button onClick={handleCancel} className="px-4 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 font-medium flex items-center gap-1 transition-colors">
                  <XCircle className="w-4 h-4" /> {t('common.cancel')}
                </button>
                <button onClick={handleComplete} className="px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 font-medium flex items-center gap-1 transition-colors">
                  <CheckCircle2 className="w-4 h-4" /> {t('revision.complete')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4 flex-shrink-0">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
            <span>{t('revision.progress')}</span>
            <span className="font-bold">{progress}% ({summary?.counted || 0} / {selectedRevision.total_items})</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div className="bg-primary h-3 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-4 gap-3 mb-4 flex-shrink-0">
            <div className="bg-white rounded-xl p-3 shadow-sm border">
              <div className="text-xs text-gray-500">{t('revision.matched')}</div>
              <div className="text-lg font-bold text-gray-800">{summary.matched}</div>
            </div>
            <div className="bg-red-50 rounded-xl p-3 shadow-sm border border-red-100">
              <div className="text-xs text-red-500">{t('revision.shortage')}</div>
              <div className="text-lg font-bold text-red-600">{summary.shortages}</div>
              <div className="text-xs text-red-400">−{summary.shortageAmount.toLocaleString('ru-RU')} ₸</div>
            </div>
            <div className="bg-green-50 rounded-xl p-3 shadow-sm border border-green-100">
              <div className="text-xs text-green-500">{t('revision.surplus')}</div>
              <div className="text-lg font-bold text-green-600">{summary.surpluses}</div>
              <div className="text-xs text-green-400">+{summary.surplusAmount.toLocaleString('ru-RU')} ₸</div>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 shadow-sm border border-blue-100">
              <div className="text-xs text-blue-500">{t('revision.totalDiff')}</div>
              <div className={`text-lg font-bold ${(summary.surplusAmount - summary.shortageAmount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(summary.surplusAmount - summary.shortageAmount) >= 0 ? '+' : ''}{(summary.surplusAmount - summary.shortageAmount).toLocaleString('ru-RU')} ₸
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-3 flex-shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('revision.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-sm"
          />
        </div>

        {/* Items table */}
        <div className="flex-1 overflow-auto bg-white rounded-xl shadow-sm border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('revision.barcode')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('revision.name')}</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">{t('revision.unit')}</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">{t('revision.system')}</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">{t('revision.fact')}</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">{t('revision.diff')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredItems.map(item => (
                <RevisionRow key={item.id} item={item} isEditable={isEditable} onUpdate={handleUpdateItem} onEditClick={(i) => {
                  setActiveEditingItem(i);
                  setEditTempValue(i.actual_quantity?.toString() ?? '');
                }} />
              ))}
              {filteredItems.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">{t('revision.noProducts')}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
          danger={true}
          confirmText={t('common.yes')}
          cancelText={t('common.cancel')}
        />

        {/* Numpad Modal */}
        {activeEditingItem && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setActiveEditingItem(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="font-bold text-gray-900 border-b pb-2 mb-2">{activeEditingItem.product_name}</h3>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t('revision.system')}: <span className="font-bold text-gray-900">{activeEditingItem.system_quantity}</span></span>
                  <span className="text-gray-500">{t('revision.unit')}: <span className="font-bold text-gray-900">{activeEditingItem.measure_unit}</span></span>
                </div>
              </div>
              <div className="p-6">
                <Input
                  type="number"
                  min="0"
                  max="1000000"
                  placeholder={t('revision.actualQty')}
                  value={editTempValue}
                  onChange={(e) => setEditTempValue(Math.min(1000000, Math.max(0, parseFloat(e.target.value) || 0)).toString())}
                  className="w-full text-2xl font-bold bg-white focus:outline-none mb-2"
                />
                <NumPad
                  value={editTempValue}
                  onChange={setEditTempValue}
                  maxValue={1000000}
                  onEnter={() => {
                    handleUpdateItem(activeEditingItem.id, editTempValue);
                    setActiveEditingItem(null);
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── LIST VIEW (default) ───
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardCheck className="w-7 h-7" /> {t('revision.title')}</h1>
          <p className="text-gray-500 text-sm">{t('revision.subtitle', 'Сверка фактических остатков с данными системы')}</p>
        </div>
        <button
          onClick={() => setView('create')}
          className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-lg shadow-primary/20"
        >
          <Plus className="w-5 h-5" /> {t('revision.new')}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        {loading ? (
          <div className="text-center py-20 text-gray-400">{t('common.loading')}</div>
        ) : revisions.length === 0 ? (
          <div className="text-center py-20 space-y-2">
            <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto" />
            <p className="text-gray-400">{t('revision.empty')}</p>
            <p className="text-xs text-gray-300">{t('revision.emptyHint')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-600">{t('revision.number')}</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">{t('revision.date')}</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">{t('revision.type')}</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">{t('revision.status_label')}</th>
                <th className="text-center px-6 py-3 font-medium text-gray-600">{t('revision.total_items')}</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">{t('revision.shortage')}</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">{t('revision.surplus')}</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">{t('revision.executor')}</th>
                <th className="text-center px-6 py-3 font-medium text-gray-600">{t('revision.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {revisions.map((r, idx) => (
                <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openRevision(r.id)}>
                  <td className="px-6 py-4 font-mono text-xs">{revisions.length - idx}</td>
                  <td className="px-6 py-4 text-gray-600">{new Date(r.created_at).toLocaleDateString('ru-RU')}</td>
                  <td className="px-6 py-4 text-gray-600">{r.revision_type === 'full' ? t('revision.full') : t('revision.partial')}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusLabel[r.status]?.color || ''}`}>
                      {statusLabel[r.status]?.text || r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">{r.total_items}</td>
                  <td className="px-6 py-4 text-right text-red-600 font-medium">
                    {r.shortage_amount > 0 ? `−${r.shortage_amount.toLocaleString('ru-RU')} ₸` : '—'}
                  </td>
                  <td className="px-6 py-4 text-right text-green-600 font-medium">
                    {r.surplus_amount > 0 ? `+${r.surplus_amount.toLocaleString('ru-RU')} ₸` : '—'}
                  </td>
                  <td className="px-6 py-4 text-gray-500">{r.user_name || '—'}</td>
                  <td className="px-6 py-4 text-center" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openRevision(r.id)} className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
