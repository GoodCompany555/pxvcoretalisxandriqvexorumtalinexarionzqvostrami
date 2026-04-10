import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth';
import { FileText, Plus, Printer, FileDown, Loader2, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Document {
  id: string;
  doc_type: 'invoice' | 'avr' | 'waybill';
  doc_number: string;
  client_name: string;
  total_amount: number;
  generated_at: string;
}

export default function Documents() {
  const companyId = useAuthStore(state => state.company?.id);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Form states
  const [selectedReceipt, setSelectedReceipt] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [docType, setDocType] = useState('invoice');

  const fetchData = async () => {
    if (!companyId || !window.electronAPI) return;
    setLoading(true);
    try {
      const [docsRes, receiptsRes, clientsRes] = await Promise.all([
        window.electronAPI.documents.getAll(companyId),
        window.electronAPI.documents.getReceipts(companyId),
        window.electronAPI.clients.getAll(companyId)
      ]);

      if (docsRes.success) setDocuments(docsRes.data || []);
      if (receiptsRes.success) setReceipts(receiptsRes.data || []);
      if (clientsRes.success) setClients(clientsRes.data || []);
    } catch (e) {
      toast.error('Ошибка загрузки данных');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [companyId]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !window.electronAPI?.documents) return;
    if (!selectedReceipt || !selectedClient) {
      toast.error('Выберите чек и контрагента');
      return;
    }

    setGenerating(true);
    const res = await window.electronAPI.documents.generate({
      companyId,
      clientId: selectedClient,
      receiptId: selectedReceipt,
      docType,
    });
    setGenerating(false);

    if (res.success) {
      toast.success(`Документ ${res.data.docNumber} создан`);
      setIsModalOpen(false);
      fetchData();
    } else {
      toast.error(res.error || 'Ошибка генерации');
    }
  };

  const docTypeNames = {
    invoice: 'Счет-фактура',
    avr: 'Акт выполненных работ',
    waybill: 'Накладная',
  };

  const handlePrint = (docId: string) => {
    // В будущем - открытие окна предпросмотра с HTML шаблоном
    toast('Функция печати будет доступна в следующем обновлении', { icon: '🖨️' });
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Документы</h1>
          <p className="text-gray-500 mt-1">Журнал созданных документов (ЭСФ, АВР, Накладные)</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl hover:bg-primary-hover transition-colors font-medium shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Выписать документ
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Номер</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Тип</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Контрагент</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Сумма</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Дата</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {documents.map((doc) => (
              <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{doc.doc_number}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${doc.doc_type === 'invoice' ? 'bg-purple-100 text-purple-800' :
                    doc.doc_type === 'avr' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                    {docTypeNames[doc.doc_type]}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-gray-400" />
                    {doc.client_name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {doc.total_amount.toLocaleString('ru-RU')} ₸
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(doc.generated_at).toLocaleString('ru-RU')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => handlePrint(doc.id)}
                    className="text-gray-500 hover:text-primary p-2 transition-colors mr-2"
                    title="Распечатать PDF"
                  >
                    <Printer className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handlePrint(doc.id)}
                    className="text-gray-500 hover:text-green-600 p-2 transition-colors"
                    title="Скачать PDF"
                  >
                    <FileDown className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
            {documents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  <FileText className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                  <p>Документы еще не создавались</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">Выписать документ</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>

            <form onSubmit={handleGenerate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Тип документа</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="invoice">Счет-фактура</option>
                  <option value="avr">Акт выполненных работ</option>
                  <option value="waybill">Накладная</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Основание (Чек/Продажа)</label>
                <select
                  value={selectedReceipt}
                  onChange={(e) => setSelectedReceipt(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
                  required
                >
                  <option value="">Выберите продажу...</option>
                  {receipts.map(r => (
                    <option key={r.id} value={r.id}>
                      {new Date(r.created_at).toLocaleString('ru-RU')} — {r.total_amount.toLocaleString('ru-RU')} ₸ (Выписано док-в: {r.docs_count})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Контрагент (Клиент)</label>
                <select
                  value={selectedClient}
                  onChange={(e) => setSelectedClient(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
                  required
                >
                  <option value="">Выберите контрагента...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.bin ? `(БИН: ${c.bin})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors border border-gray-200"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="flex-1 px-4 py-2 bg-primary text-white font-medium rounded-xl hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  {generating ? 'Создание...' : 'Сгенерировать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
