import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../store/auth';
import toast from 'react-hot-toast';
import {
  ClipboardCheck,
  Plus,
  Eye,
  Trash2,
  CheckCircle2,
  XCircle,
  Search,
  ArrowLeft,
  Save,
  BarChart3,
  AlertTriangle,
  Printer
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Input } from '../components/ui/input';


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

// ───── Status Badges ─────
const statusLabel: Record<string, { text: string; color: string }> = {
  draft: { text: '🟡 Черновик', color: 'bg-yellow-100 text-yellow-800' },
  in_progress: { text: '🔵 В процессе', color: 'bg-blue-100 text-blue-800' },
  completed: { text: '🟢 Завершена', color: 'bg-green-100 text-green-800' },
  cancelled: { text: '🔴 Отменена', color: 'bg-red-100 text-red-800' },
};

const RevisionRow = ({ item, isEditable, onUpdate }: { item: RevisionItem, isEditable: boolean, onUpdate: (id: string, val: string) => void }) => {
  const [localValue, setLocalValue] = useState(item.actual_quantity?.toString() ?? '');

  useEffect(() => {
    setLocalValue(item.actual_quantity?.toString() ?? '');
  }, [item.actual_quantity]);

  const handleChange = (val: string) => {
    if (val !== '' && !/^\d*\.?\d*$/.test(val)) return;
    setLocalValue(val);
  };

  const handleBlur = () => {
    if (localValue === '') return;
    const num = parseFloat(localValue);
    if (!isNaN(num) && num >= 0) {
      if (num !== item.actual_quantity) {
        onUpdate(item.id, localValue);
      }
    }
  };

  return (
    <tr className={item.status === 'counted' ? '' : 'bg-gray-50/50'}>
      <td className="px-4 py-2 text-gray-500 font-mono text-xs">{item.product_barcode || '—'}</td>
      <td className="px-4 py-2 font-medium">{item.product_name}</td>
      <td className="px-4 py-2 text-center text-gray-500">{item.measure_unit}</td>
      <td className="px-4 py-2 text-center font-bold">{item.system_quantity}</td>
      <td className="px-4 py-2 text-center">
        {isEditable ? (
          <input
            type="number"
            min="0"
            step="1"
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            className="w-20 text-center px-2 py-1 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
            placeholder="___"
          />
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

export default function Revisions() {
  const { company, user } = useAuthStore();

  // ───── State ─────
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedRevision, setSelectedRevision] = useState<(Revision & { items: RevisionItem[] }) | null>(null);
  const [revType, setRevType] = useState<'full' | 'category'>('full');
  const [search, setSearch] = useState('');
  const autoSaveRef = useRef<NodeJS.Timeout | null>(null);

  // Confirm dialog (no native confirm!)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
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

  // ───── Load detail ─────
  const openRevision = async (id: string) => {
    if (!company?.id) return;
    const loader = toast.loading('Загрузка...');
    try {
      const res = await (window as any).electronAPI.revisions.getOne(company.id, id);
      if (res.success) {
        setSelectedRevision(res.data);
        setView('detail');
        toast.dismiss(loader);
      } else {
        toast.error(res.error || 'Ошибка', { id: loader });
      }
    } catch {
      toast.error('Ошибка загрузки', { id: loader });
    }
  };

  // ───── Create ─────
  const handleCreate = async () => {
    if (!company?.id || !user?.id) return;
    const loader = toast.loading('Создание ревизии...');
    try {
      const res = await (window as any).electronAPI.revisions.create({
        companyId: company.id,
        userId: user.id,
        type: revType,
      });
      if (res.success) {
        toast.success('Ревизия создана', { id: loader });
        await openRevision(res.data.id);
      } else {
        toast.error(res.error || 'Ошибка', { id: loader });
      }
    } catch (error: any) {
      toast.error(`Фатальная ошибка: ${error.message}`, { id: loader });
      console.error(error);
    }
  };

  // ───── Update item ─────
  const handleUpdateItem = async (itemId: string, value: string) => {
    if (!selectedRevision) return;
    const actualQuantity = parseFloat(value);
    if (isNaN(actualQuantity) || actualQuantity < 0) return;

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
      // The actual save happens per-item update, so auto-save just reloads from server
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
      ? `Не проверено ${uncounted} товаров. Они будут пропущены. Завершить ревизию и применить результаты?`
      : 'Завершить ревизию и применить результаты к складу?';

    setConfirmDialog({
      isOpen: true,
      title: 'Завершить ревизию',
      message,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        const loader = toast.loading('Применение результатов...');
        try {
          const res = await (window as any).electronAPI.revisions.complete(company!.id, selectedRevision!.id);
          if (res.success) {
            toast.success('Ревизия завершена. Остатки обновлены.', { id: loader });
            setView('list');
            setSelectedRevision(null);
            loadRevisions();
          } else {
            toast.error(res.error || 'Ошибка', { id: loader });
          }
        } catch {
          toast.error('Ошибка', { id: loader });
        }
      },
    });
  };

  // ───── Cancel ─────
  const handleCancel = () => {
    if (!company?.id || !selectedRevision) return;
    setConfirmDialog({
      isOpen: true,
      title: 'Отменить ревизию',
      message: 'Отменить ревизию? Изменения в остатках не будут применены.',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          console.log('Отмена ревизии, ID:', selectedRevision.id);
          const result = await (window as any).electronAPI.cancelRevision(selectedRevision.id);
          if (result?.success) {
            await loadRevisions();
            toast.success('Ревизия отменена');
            setView('list');
            setSelectedRevision(null);
          } else {
            toast.error(result?.message ?? 'Не удалось отменить ревизию');
          }
        } catch (error: any) {
          console.error('Ошибка отмены:', error);
          toast.error('Ошибка: ' + error.message);
        }
      },
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
      toast.error('Ошибка печати: ' + error.message);
    }
  };

  // ═══════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════

  // ─── CREATE VIEW ───
  if (view === 'create') {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <button onClick={() => setView('list')} className="flex items-center gap-1 text-primary hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" /> Назад к списку
        </button>
        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2"><ClipboardCheck className="w-6 h-6" /> Новая ревизия</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Тип ревизии</label>
            <div className="flex gap-3">
              {[
                { value: 'full', label: 'Полная', desc: 'Все товары на складе' },
                { value: 'category', label: 'По категории', desc: 'Только выбранная категория' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setRevType(opt.value as any)}
                  className={`flex-1 p-4 rounded-xl border-2 text-left transition-all ${revType === opt.value ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="font-bold">{opt.label}</div>
                  <div className="text-xs text-gray-500">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">
            <AlertTriangle className="w-4 h-4 inline mr-1" />
            При создании ревизии система зафиксирует текущие остатки всех товаров. Вы сможете вручную вводить фактическое количество.
          </div>

          <button
            onClick={handleCreate}
            className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            <ClipboardCheck className="w-5 h-5" /> Начать ревизию
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
                Ревизия #{selectedRevision.id.slice(0, 6).toUpperCase()}
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusLabel[selectedRevision.status]?.color || ''}`}>
                  {statusLabel[selectedRevision.status]?.text || selectedRevision.status}
                </span>
              </h2>
              <p className="text-sm text-gray-500">
                {new Date(selectedRevision.started_at).toLocaleString('ru-RU')} • {selectedRevision.user_name} • {selectedRevision.total_items} товаров
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handlePrint()}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-medium flex items-center gap-2 transition-colors border border-gray-200"
            >
              <Printer className="w-4 h-4" /> Акт ревизии
            </button>
            {isEditable && (
              <>
                <button onClick={handleCancel} className="px-4 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 font-medium flex items-center gap-1 transition-colors">
                  <XCircle className="w-4 h-4" /> Отменить
                </button>
                <button onClick={handleComplete} className="px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 font-medium flex items-center gap-1 transition-colors">
                  <CheckCircle2 className="w-4 h-4" /> Завершить
                </button>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4 flex-shrink-0">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
            <span>Прогресс проверки</span>
            <span className="font-bold">{progress}% ({summary?.counted || 0} из {selectedRevision.total_items})</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div className="bg-primary h-3 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-4 gap-3 mb-4 flex-shrink-0">
            <div className="bg-white rounded-xl p-3 shadow-sm border">
              <div className="text-xs text-gray-500">Совпало</div>
              <div className="text-lg font-bold text-gray-800">{summary.matched}</div>
            </div>
            <div className="bg-red-50 rounded-xl p-3 shadow-sm border border-red-100">
              <div className="text-xs text-red-500">Недостачи</div>
              <div className="text-lg font-bold text-red-600">{summary.shortages}</div>
              <div className="text-xs text-red-400">−{summary.shortageAmount.toLocaleString('ru-RU')} ₸</div>
            </div>
            <div className="bg-green-50 rounded-xl p-3 shadow-sm border border-green-100">
              <div className="text-xs text-green-500">Излишки</div>
              <div className="text-lg font-bold text-green-600">{summary.surpluses}</div>
              <div className="text-xs text-green-400">+{summary.surplusAmount.toLocaleString('ru-RU')} ₸</div>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 shadow-sm border border-blue-100">
              <div className="text-xs text-blue-500">Итого разница</div>
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
            placeholder="Поиск по названию или штрихкоду..."
            className="w-full pl-9 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-sm"
          />
        </div>

        {/* Items table */}
        <div className="flex-1 overflow-auto bg-white rounded-xl shadow-sm border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Штрихкод</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Название</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Ед.</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">По системе</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Факт</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Разница</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredItems.map(item => (
                <RevisionRow key={item.id} item={item} isEditable={isEditable} onUpdate={handleUpdateItem} />
              ))}
              {filteredItems.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">Нет товаров</td></tr>
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
          confirmText="Да"
          cancelText="Отмена"
        />
      </div>
    );
  }

  // ─── LIST VIEW (default) ───
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardCheck className="w-7 h-7" /> Ревизия товаров</h1>
          <p className="text-gray-500 text-sm">Сверка фактических остатков с данными системы</p>
        </div>
        <button
          onClick={() => setView('create')}
          className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-lg shadow-primary/20"
        >
          <Plus className="w-5 h-5" /> Создать ревизию
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        {loading ? (
          <div className="text-center py-20 text-gray-400">Загрузка...</div>
        ) : revisions.length === 0 ? (
          <div className="text-center py-20 space-y-2">
            <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto" />
            <p className="text-gray-400">Ревизий пока нет</p>
            <p className="text-xs text-gray-300">Нажмите «Создать ревизию», чтобы начать первую инвентаризацию</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-600">№</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Дата</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Тип</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Статус</th>
                <th className="text-center px-6 py-3 font-medium text-gray-600">Товаров</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Недостача</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Излишки</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Кто проводил</th>
                <th className="text-center px-6 py-3 font-medium text-gray-600">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {revisions.map((r, idx) => (
                <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openRevision(r.id)}>
                  <td className="px-6 py-4 font-mono text-xs">{revisions.length - idx}</td>
                  <td className="px-6 py-4 text-gray-600">{new Date(r.created_at).toLocaleDateString('ru-RU')}</td>
                  <td className="px-6 py-4 text-gray-600">{r.revision_type === 'full' ? 'Полная' : 'Частичная'}</td>
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
