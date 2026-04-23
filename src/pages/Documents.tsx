import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/auth';
import { FileText, Plus, Printer, FileDown, Loader2, Building2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useReactToPrint } from 'react-to-print';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from '../components/ui/CustomSelect';

interface Document {
  id: string;
  doc_type: 'invoice' | 'avr' | 'waybill';
  doc_number: string;
  client_name: string;
  total_amount: number;
  generated_at: string;
}

interface DocDetails {
  doc: any;
  client: any;
  receipt: any;
  items: any[];
  company: any;
}

export default function Documents() {
  const { t } = useTranslation();
  const companyId = useAuthStore(state => state.company?.id);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Print preview
  const [previewDoc, setPreviewDoc] = useState<DocDetails | null>(null);
  const [previewType, setPreviewType] = useState<string>('');
  const printRef = useRef<HTMLDivElement>(null);

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
      toast.error(t('documents.loadError'));
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
      toast.error(t('documents.noReceiptClient'));
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
      toast.success(`${t('documents.created')} ${res.data.docNumber}`);
      setIsModalOpen(false);
      fetchData();
    } else {
      toast.error(res.error || t('common.error'));
    }
  };

  const handlePrint = async (docId: string) => {
    if (!companyId || !window.electronAPI?.documents) return;
    const loader = toast.loading(t('documents.loading'));
    try {
      const res = await window.electronAPI.documents.getDetails(companyId, docId);
      if (res.success && res.data) {
        setPreviewDoc(res.data);
        setPreviewType(res.data.doc.doc_type);
        toast.dismiss(loader);
      } else {
        toast.error(res.error || t('documents.detailsError'), { id: loader });
      }
    } catch {
      toast.error(t('documents.detailsError'), { id: loader });
    }
  };

  const handleDoPrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: previewDoc ? `${previewDoc.doc.doc_number}` : t('nav.documents'),
    onAfterPrint: () => { },
  });

  // Print template
  const renderDocument = () => {
    if (!previewDoc) return null;
    const { doc, client, receipt, items, company } = previewDoc;
    const formatDate = (d: string) => new Date(d).toLocaleDateString('ru-RU');
    const formatNum = (n: number) => Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return (
      <div ref={printRef} className="bg-white p-8 text-sm leading-relaxed text-gray-900" style={{ fontFamily: 'Arial, sans-serif', maxWidth: '210mm' }}>
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold mb-1">{t(`documents.${doc.doc_type}`)}</h1>
          <p className="text-base font-semibold">№ {doc.doc_number} {t('common.date').toLowerCase()} {formatDate(doc.generated_at)}</p>
        </div>

        {/* Parties */}
        <div className="mb-6 border-t border-b border-gray-300 py-3 space-y-2">
          <div className="flex">
            <span className="font-bold w-32">{t('documents.supplier')}:</span>
            <span>{company?.name || '—'}{company?.bin ? `, ${t('settings.bin')} ${company.bin}` : ''}</span>
          </div>
          <div className="flex">
            <span className="font-bold w-32">{t('documents.buyer')}:</span>
            <span>{client?.name || '—'}{client?.bin ? `, ${t('settings.bin')} ${client.bin}` : ''}{client?.address ? `, ${client.address}` : ''}</span>
          </div>
          <div className="flex">
            <span className="font-bold w-32">{t('documents.basis')}:</span>
            <span>{t('documents.receiptFrom')} {formatDate(receipt?.created_at || doc.generated_at)}, {t('documents.paymentLabel')}: {receipt?.payment_type === 'cash' ? t('pos.cash') : receipt?.payment_type === 'card' ? t('pos.card') : receipt?.payment_type || '—'}</span>
          </div>
        </div>

        {/* Items table */}
        <table className="w-full border-collapse text-xs mb-6">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-1.5 text-center">№</th>
              <th className="border border-gray-300 px-2 py-1.5 text-left">{t('common.name')}</th>
              <th className="border border-gray-300 px-2 py-1.5 text-center">{t('pos.items')}</th>
              <th className="border border-gray-300 px-2 py-1.5 text-center">{t('common.quantity')}</th>
              <th className="border border-gray-300 px-2 py-1.5 text-right">{t('common.price')}</th>
              <th className="border border-gray-300 px-2 py-1.5 text-center">{t('pos.vatIncluded').split('(')[0]} %</th>
              <th className="border border-gray-300 px-2 py-1.5 text-right">{t('pos.vatIncluded').split('(')[0]}</th>
              <th className="border border-gray-300 px-2 py-1.5 text-right">{t('common.total')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, i: number) => {
              const lineTotal = Number(item.quantity) * Number(item.price);
              const vatRate = Number(item.vat_rate || 0);
              const vatAmount = vatRate > 0 ? lineTotal * vatRate / (100 + vatRate) : 0;
              return (
                <tr key={i}>
                  <td className="border border-gray-300 px-2 py-1 text-center">{i + 1}</td>
                  <td className="border border-gray-300 px-2 py-1">{item.product_name}</td>
                  <td className="border border-gray-300 px-2 py-1 text-center">{item.measure_unit || t('common.pcs')}</td>
                  <td className="border border-gray-300 px-2 py-1 text-center">{item.quantity}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right">{formatNum(item.price)}</td>
                  <td className="border border-gray-300 px-2 py-1 text-center">{vatRate > 0 ? `${vatRate}%` : '0%'}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right">{formatNum(vatAmount)}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right">{formatNum(lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-bold bg-gray-50">
              <td colSpan={7} className="border border-gray-300 px-2 py-1.5 text-right uppercase">{t('common.total')}:</td>
              <td className="border border-gray-300 px-2 py-1.5 text-right">{formatNum(Number(receipt?.total_amount || 0))} ₸</td>
            </tr>
          </tfoot>
        </table>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-12 mt-12 text-xs">
          <div>
            <p className="font-bold mb-8">{t('documents.supplier')}:</p>
            <div className="border-b border-gray-400 mb-1"></div>
            <p className="text-gray-500 text-center">{t('staff.employee').toLowerCase()}</p>
          </div>
          <div>
            <p className="font-bold mb-8">{t('documents.buyer')}:</p>
            <div className="border-b border-gray-400 mb-1"></div>
            <p className="text-gray-500 text-center">{t('staff.employee').toLowerCase()}</p>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-gray-400">
          {t('documents.systemTag')}
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('documents.title')}</h1>
          <p className="text-gray-500 mt-1">{t('documents.subtitle')}</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl hover:bg-primary-hover transition-colors font-medium shadow-sm"
        >
          <Plus className="w-5 h-5" />
          {t('documents.issue')}
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('documents.number')}</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('documents.type')}</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('documents.client')}</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('reports.revenueCol')}</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('documents.date')}</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">{t('documents.actions')}</th>
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
                    {t(`documents.${doc.doc_type}`)}
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
                    title={t('documents.printPdf')}
                  >
                    <Printer className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handlePrint(doc.id)}
                    className="text-gray-500 hover:text-green-600 p-2 transition-colors"
                    title={t('documents.printPdf')}
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
                  <p>{t('documents.empty')}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ====== ПРЕДПРОСМОТР / ПЕЧАТЬ ====== */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
              <h3 className="text-lg font-bold">{t('documents.preview')}: {previewDoc.doc.doc_number}</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDoPrint()}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 font-medium transition-colors"
                >
                  <Printer className="w-4 h-4" /> {t('documents.printPdf')}
                </button>
                <button onClick={() => setPreviewDoc(null)} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {renderDocument()}
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">{t('documents.issue')}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>

            <form onSubmit={handleGenerate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('documents.type')}</label>
                <CustomSelect
                  value={docType}
                  onChange={(val) => setDocType(val)}
                  className="w-full"
                  options={[
                    { value: 'invoice', label: t('documents.invoice') },
                    { value: 'avr', label: t('documents.avr') },
                    { value: 'waybill', label: t('documents.waybill') }
                  ]}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('documents.basis')}</label>
                <CustomSelect
                  value={selectedReceipt}
                  onChange={(val) => setSelectedReceipt(val)}
                  className="w-full"
                  placeholder={t('documents.placeholderSale')}
                  options={[
                    { value: '', label: t('documents.placeholderSale') },
                    ...receipts.map(r => ({
                      value: r.id,
                      label: `${new Date(r.created_at).toLocaleString('ru-RU')} — ${r.total_amount.toLocaleString('ru-RU')} ₸ (${t('nav.documents')}: ${r.docs_count})`
                    }))
                  ]}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('documents.client')}</label>
                <CustomSelect
                  value={selectedClient}
                  onChange={(val) => setSelectedClient(val)}
                  className="w-full"
                  placeholder={t('documents.placeholderClient')}
                  options={[
                    { value: '', label: t('documents.placeholderClient') },
                    ...clients.map(c => ({
                      value: c.id,
                      label: `${c.name} ${c.bin ? `(${t('settings.bin')}: ${c.bin})` : ''}`
                    }))
                  ]}
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors border border-gray-200"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="flex-1 px-4 py-2 bg-primary text-white font-medium rounded-xl hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  {generating ? t('documents.generating') : t('documents.generate')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
