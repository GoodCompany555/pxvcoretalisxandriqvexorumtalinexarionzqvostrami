import { useState, useEffect, useRef } from 'react';
import { Globe, Search, X, Download, Loader2, WifiOff } from 'lucide-react';
import { Input } from './ui/input';


interface NktProduct {
  id: string;
  gtin: string;
  ntin: string;
  name: string;
  manufacturer: string;
  unit: string;
  image: string | null;
  category: string;
}

interface NktModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (product: NktProduct) => void;
}

export default function NktModal({ isOpen, onClose, onImport }: NktModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NktProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<NktProduct | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clean state on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setError('');
      setSelectedProduct(null);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      setError('');
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const res = await (window as any).electronAPI.nkt.search(query.trim());
        if (res.success) {
          setResults(res.data);
          if (res.data.length === 0) setError('Товар не найден в национальном каталоге');
        } else {
          setError(res.error || 'Ошибка поиска');
          setResults([]);
        }
      } catch {
        setError('Для поиска в НКТ необходимо подключение к интернету');
      }
      setLoading(false);
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-800">Национальный каталог товаров</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search input */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Введите штрихкод GTIN/NTIN товара"
              className="w-full pl-9 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-200 outline-none text-sm"
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto px-6 py-3">
          {error && (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
              <WifiOff className="w-8 h-8" />
              <p className="text-sm text-center">{error}</p>
            </div>
          )}

          {!error && results.length === 0 && !loading && query.length < 2 && (
            <div className="flex flex-col items-center justify-center py-10 text-gray-300 gap-2">
              <Globe className="w-12 h-12" />
              <p className="text-sm">Начните вводить название или штрихкод для поиска</p>
            </div>
          )}

          {results.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2 px-2 font-medium">GTIN</th>
                  <th className="py-2 px-2 font-medium">Название</th>
                  <th className="py-2 px-2 font-medium">Производитель</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((p, i) => (
                  <tr
                    key={p.id || i}
                    className={`hover:bg-blue-50 cursor-pointer transition-colors ${selectedProduct?.id === p.id ? 'bg-blue-50' : ''}`}
                    onClick={() => setSelectedProduct(p)}
                  >
                    <td className="py-2.5 px-2 font-mono text-xs text-gray-500">{p.gtin || p.ntin || '—'}</td>
                    <td className="py-2.5 px-2 font-medium">{p.name}</td>
                    <td className="py-2.5 px-2 text-gray-500">{p.manufacturer || '—'}</td>
                    <td className="py-2.5 px-2">
                      <button
                        onClick={e => { e.stopPropagation(); onImport(p); }}
                        className="px-3 py-1 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" /> Импорт
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Selected product detail */}
        {selectedProduct && (
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold">{selectedProduct.name}</p>
                <p className="text-xs text-gray-500">
                  {selectedProduct.gtin && `GTIN: ${selectedProduct.gtin}`}
                  {selectedProduct.manufacturer && ` • ${selectedProduct.manufacturer}`}
                  {selectedProduct.category && ` • ${selectedProduct.category}`}
                </p>
              </div>
              <button
                onClick={() => onImport(selectedProduct)}
                className="px-5 py-2 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" /> Импортировать товар
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
