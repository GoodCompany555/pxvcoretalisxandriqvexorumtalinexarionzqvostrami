import { useState, useRef, useEffect, useCallback } from 'react';
import { usePosStore, CartItem } from '../store/pos';
import type { Product } from '../store/pos';
import {
  Search,
  Trash2,
  ScanLine,
  CreditCard,
  Banknote,
  QrCode,
  X,
  Plus,
  Minus,
  Scale,
  Printer,
  Wifi,
  WifiOff,
  Timer,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/auth';
import { useSettingsStore } from '../store/settings';
import { useShiftStore } from '../store/shift';
import { useTranslation } from 'react-i18next';
import { PrintableReceipt } from '../components/PrintableReceipt';
import { useReactToPrint } from 'react-to-print';
import NumPad from '../components/NumPad';
import { Input } from '../components/ui/input';


// ====== ТИПЫ МОДАЛОК ======
type ModalType = 'none' | 'catalog' | 'terminal' | 'weighing' | 'xreport' | 'zreport' | 'discount' | 'marking' | 'age_verification';

export default function POS() {
  const { cart, addItem, updateItemQuantity, removeItem, clearCart, globalDiscount, total, totalVat, updateItemDiscount } = usePosStore();
  const { company, user } = useAuthStore();
  const { currentShift, setCurrentShift } = useShiftStore();
  const { t } = useTranslation();

  const [searchQuery, setSearchQuery] = useState('');
  const [paymentMode, setPaymentMode] = useState<'none' | 'cash' | 'card' | 'card_manual' | 'mixed' | 'qr'>('none');
  const [cashGiven, setCashGiven] = useState('');
  const [mixedCash, setMixedCash] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedCartIndex, setSelectedCartIndex] = useState(-1);

  // ====== МОДАЛКИ ======
  const [activeModal, setActiveModal] = useState<ModalType>('none');
  const [discountItem, setDiscountItem] = useState<CartItem | null>(null);
  const [discountInput, setDiscountInput] = useState('');

  // Терминалы
  const [terminals, setTerminals] = useState<any[]>([]);
  const [terminalStatuses, setTerminalStatuses] = useState<Record<string, boolean>>({});
  const [paymentPending, setPaymentPending] = useState(false);
  const [paymentTimer, setPaymentTimer] = useState(120);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);

  // Весы
  const [currentWeight, setCurrentWeight] = useState(0);
  const [weightStable, setWeightStable] = useState(false);
  const [weighingProduct, setWeighingProduct] = useState<Product | null>(null);
  const [manualWeight, setManualWeight] = useState('');

  // Маркировка
  const [markingProduct, setMarkingProduct] = useState<Product | null>(null);
  const [markCodeInput, setMarkCodeInput] = useState('');
  const markCodeInputRef = useRef<HTMLInputElement>(null);

  // Алкоголь (Проверка возраста)
  const [ageVerifyProduct, setAgeVerifyProduct] = useState<Product | null>(null);

  // Очередь печати
  const [printQueueCount, setPrintQueueCount] = useState(0);

  // Печать чека
  const receiptPrintRef = useRef<HTMLDivElement>(null);
  const [completedReceiptData, setCompletedReceiptData] = useState<any>(null);

  // ====== ЭКРАН ПОКУПАТЕЛЯ ======
  const sendToDisplay = (mode: string, data: any = {}) => {
    window.electronAPI?.customerDisplay?.setMode(mode, data).catch(() => { });
  };

  // Синхронизируем экран покупателя с состоянием корзины и режимом оплаты
  useEffect(() => {
    if (cart.length === 0) {
      sendToDisplay('idle');
      return;
    }
    const items = cart.map(i => ({ name: i.name, price: i.price_retail, qty: i.quantity }));
    if (paymentMode === 'cash') {
      const received = parseFloat(cashGiven || '0');
      sendToDisplay('payment-cash', { total, received, change: Math.max(0, received - total) });
    } else if (paymentMode === 'card' || paymentMode === 'card_manual') {
      sendToDisplay('payment-card', { total });
    } else if (paymentMode === 'qr') {
      sendToDisplay('payment-qr', { total });
    } else if (paymentMode === 'mixed') {
      sendToDisplay('payment-cash', { total });
    } else {
      // paymentMode === 'none' — показываем список товаров
      sendToDisplay('sale', { items, total });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, paymentMode, cashGiven, total]);

  // После успешной оплаты — экран успеха (clearCart уже вызван, useEffect выше перешёл на idle,
  // поэтому нужно сначала показать success, потом idle вернётся сам через 4с в CustomerDisplay)
  const sendSuccessToDisplay = () => {
    sendToDisplay('success');
  };

  const handlePrintReceipt = useReactToPrint({
    contentRef: receiptPrintRef,
    documentTitle: 'Кассовый чек',
    onAfterPrint: () => {
      setCompletedReceiptData(null);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    },
    onPrintError: () => {
      if ((window as any).electronAPI?.resetPrinter) {
        (window as any).electronAPI.resetPrinter();
      }
    }
  });

  useEffect(() => {
    if (completedReceiptData && activeModal === 'none') {
      const runPrint = async () => {
        if ((window as any).electronAPI?.resetPrinter) {
          await (window as any).electronAPI.resetPrinter();
        }
        handlePrintReceipt();
      };

      const timer = setTimeout(runPrint, 300); // небольшая задержка для рендера ref
      return () => clearTimeout(timer);
    }
  }, [completedReceiptData, activeModal, handlePrintReceipt]);

  // Каталог
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);

  // Фокус на инпут при загрузке
  useEffect(() => {
    // Только загружаем количество заданий в евро зоне. Не вызываем focus() здесь,
    // чтобы не триггерить запуск экранной клавиатуры Windows при переходе на вкладку.
    loadPrintQueueCount();

    // Синхронизируем статус смены с сервером
    if (company?.id && user?.id) {
      window.electronAPI.shifts.getCurrent(company.id, user.id)
        .then(res => {
          if (res.success) setCurrentShift(res.data);
        })
        .catch(() => { });
    }
  }, [company?.id, user?.id]);

  const loadPrintQueueCount = async () => {
    if (!company?.id || !window.electronAPI?.reports) return;
    try {
      const res = await window.electronAPI.reports.printQueueCount(company.id);
      if (res.success) setPrintQueueCount(res.data?.count || 0);
    } catch { }
  };

  // Загрузка каталога при открытии модалки
  const loadCatalog = async () => {
    if (!company?.id || !window.electronAPI?.inventory) return;
    setCatalogLoading(true);
    try {
      const res = await window.electronAPI.inventory.getProducts(company.id);
      if (res.success && res.data) setCatalogProducts(res.data);
    } catch { }
    finally { setCatalogLoading(false); }
  };

  useEffect(() => {
    if (activeModal === 'catalog') loadCatalog();
  }, [activeModal]);

  // ====== ГОРЯЧИЕ КЛАВИШИ ======
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Не перехватывать если фокус в input (кроме F-клавиш)
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      switch (e.key) {
        case 'F2':
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case 'F4':
          e.preventDefault();
          if (activeModal === 'none' || activeModal === 'catalog') {
            setActiveModal(activeModal === 'catalog' ? 'none' : 'catalog');
          }
          break;
        case 'F6':
          e.preventDefault();
          if (activeModal === 'none') {
            window.location.hash = '#/settings';
          }
          break;
        case 'F8':
          // Отключаем F8 при сканировании маркировки, так как сканеры (Honeywell/Zebra) часто эмулируют спец.символы как клавишу F8
          if (activeModal === 'none') {
            e.preventDefault();
            setActiveModal('xreport');
          }
          break;
        case 'F9':
          if (activeModal === 'none') {
            e.preventDefault();
            if (cart.length > 0 && paymentMode === 'none') {
              setPaymentMode('card');
            } else {
              setActiveModal('zreport');
            }
          }
          break;
        case 'Escape':
          if (activeModal !== 'none') {
            e.preventDefault();
            e.stopPropagation();
            closeModal();
          } else if (paymentPending) {
            e.preventDefault();
            e.stopPropagation();
            handleCancelTerminalPayment();
          } else if (paymentMode !== 'none') {
            e.preventDefault();
            e.stopPropagation();
            setPaymentMode('none');
          } else if (isInput) {
            // Отпускаем фокус у инпута при Esc
            target.blur();
          }
          break;
        case 'Delete':
          if (!isInput && selectedCartIndex >= 0 && selectedCartIndex < cart.length) {
            e.preventDefault();
            removeItem(cart[selectedCartIndex].cartItemId);
            setSelectedCartIndex(-1);
          }
          break;
        case 'Enter':
          if (!isInput && activeModal === 'none' && paymentMode !== 'none' && cart.length > 0) {
            e.preventDefault();
            processPayment();
          } else if (activeModal === 'discount' && discountItem) {
            e.preventDefault();
            applyDiscount();
          }
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeModal, paymentMode, selectedCartIndex, cart, paymentPending, discountItem]);

  const closeModal = () => {
    setActiveModal('none');
    if (weighingProduct) {
      window.electronAPI?.scales?.stopStream();
      setWeighingProduct(null);
    }
    setDiscountItem(null); // Clear discount item on modal close
    setDiscountInput(''); // Clear discount input on modal close
    setMarkingProduct(null);
    setMarkCodeInput('');
    setAgeVerifyProduct(null);
  };

  // ====== СКИДКА НА ТОВАР ======
  const openDiscountModal = (item: CartItem) => {
    if (user?.role !== 'admin' && user?.role !== 'manager') {
      toast.error('Доступ запрещен. Скидку может делать только Администратор или Менеджер.');
      return;
    }
    setDiscountItem(item);
    setDiscountInput(item.discount > 0 ? String(item.discount) : '');
    setActiveModal('discount');
  };

  const applyDiscount = () => {
    if (!discountItem) return;
    const currentDiscount = parseFloat(discountInput) || 0;

    // Скидка не может быть больше стоимости позиции
    const maxDiscount = discountItem.price_retail * discountItem.quantity;

    if (currentDiscount < 0) {
      toast.error('Скидка не может быть отрицательной');
      return;
    }
    if (currentDiscount > maxDiscount) {
      toast.error(`Скидка не может быть больше стоимости товара (${maxDiscount.toLocaleString('ru')} ₸)`);
      return;
    }

    updateItemDiscount(discountItem.cartItemId, currentDiscount);
    closeModal();
    setDiscountItem(null);
    setDiscountInput('');
  };

  // ====== ПОИСК ТОВАРА ======
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    if (!window.electronAPI?.pos) { toast.error(t('pos.apiUnavailable')); return; }
    if (!company?.id) { toast.error(t('pos.companyNotSelected')); return; }

    const loading = toast.loading(t('pos.searching'));
    try {
      const res = await window.electronAPI.pos.searchProduct(company.id, searchQuery);
      toast.dismiss(loading);

      if (res.success && res.data) {
        if (res.type === 'exact') {
          handleProductSelected(res.data);
          setSearchQuery('');
        } else if (res.type === 'list' && res.data.length > 0) {
          if (res.data.length === 1) {
            handleProductSelected(res.data[0]);
            setSearchQuery('');
          } else {
            handleProductSelected(res.data[0]);
            setSearchQuery('');
            toast(t('pos.addedFirst'), { icon: 'ℹ️' });
          }
        } else {
          toast.error(t('pos.productNotFound'));
        }
      } else {
        toast.error(res.error || t('pos.productNotFound'));
      }
    } catch {
      toast.dismiss(loading);
      toast.error(t('pos.searchError'));
    }
  };

  // Товар выбран — проверить остаток и весовой ли
  const handleProductSelected = (product: Product) => {
    // Проверка остатков на складе
    if (product.stock_quantity !== undefined && product.stock_quantity <= 0) {
      toast.error(`"${product.name}" — нет в наличии (остаток: 0)`);
      return;
    }

    if (product.is_alcohol && ageVerifyProduct?.id !== product.id) {
      setAgeVerifyProduct(product);
      setActiveModal('age_verification');
      return;
    }

    if (product.is_marked) {
      setMarkingProduct(product);
      setMarkCodeInput('');
      setActiveModal('marking');
      // Фокус будет установлен через useEffect при открытии модалки
    } else if (product.is_weighable) {
      setWeighingProduct(product);
      setManualWeight('');
      setActiveModal('weighing');
      startWeighing();
    } else {
      addItem(product);
    }
  };

  // ====== МАРКИРОВКА ======
  const confirmMarking = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!markingProduct || !markCodeInput.trim()) return;

    const code = markCodeInput.trim();

    // GS1 Validation: Начинается с 01 (14 символов GTIN), затем 21
    const gs1Regex = /^01(\d{14})21(.+)$/;
    const match = code.match(gs1Regex);

    if (!match) {
      toast.error('Неверный формат кода маркировки (DataMatrix). Код должен содержать GTIN (01) и серийный номер (21).');
      return;
    }

    // Проверка, что этот код еще не добавлен в текущий чек
    const alreadyInCart = cart.some(item => item.mark_code === code);
    if (alreadyInCart) {
      toast.error('Этот код маркировки уже добавлен в текущий чек!');
      return;
    }

    if (company?.id && (window as any).electronAPI?.pos?.validateMarkCode) {
      const loading = toast.loading('Проверка кода...');
      try {
        const res = await (window as any).electronAPI.pos.validateMarkCode(company.id, code);
        toast.dismiss(loading);

        if (!res.success) {
          toast.error(res.error || 'Ошибка проверки кода');
          return;
        }
        if (!res.valid) {
          toast.error(res.error || 'Код маркировки недействителен (уже использован)');
          return;
        }
      } catch (err) {
        toast.dismiss(loading);
        toast.error('Ошибка связи при проверке кода');
        return;
      }
    }

    // Добавляем маркированный товар в корзину
    addItem(markingProduct);
    const state = usePosStore.getState();
    const lastItem = state.cart[state.cart.length - 1]; // Товар добавился последним
    if (lastItem) {
      state.setItemMarkCode(lastItem.cartItemId, code);
    }

    setMarkCodeInput('');
    closeModal();
    setMarkingProduct(null);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  // Фокус на поле DataMatrix при открытии модалки
  useEffect(() => {
    if (activeModal === 'marking') {
      setTimeout(() => markCodeInputRef.current?.focus(), 100);
    }
  }, [activeModal]);

  // ====== АЛКОГОЛЬ (ПОДТВЕРЖДЕНИЕ ВОЗРАСТА) ======
  const confirmAge = () => {
    if (!ageVerifyProduct) return;
    const productInstance = { ...ageVerifyProduct };
    setAgeVerifyProduct(null);
    handleProductSelected(productInstance);
  };

  // ====== ВЕСЫ ======
  const startWeighing = async () => {
    if (!company?.id || !window.electronAPI?.scales) return;
    setCurrentWeight(0);
    setWeightStable(false);

    window.electronAPI.scales.onWeightUpdate((reading) => {
      setCurrentWeight(reading.weight);
      setWeightStable(reading.stable);
    });

    await window.electronAPI.scales.startStream(company.id);
  };

  const confirmWeight = () => {
    if (!weighingProduct) return;

    // Можно ввести вес вручную или с весов
    const finalWeight = parseFloat(manualWeight) > 0 ? parseFloat(manualWeight) : currentWeight;
    if (finalWeight <= 0) return;

    addItem(weighingProduct);
    const lastItem = usePosStore.getState().cart[usePosStore.getState().cart.length - 1];
    if (lastItem) {
      usePosStore.getState().updateItemQuantity(lastItem.cartItemId, finalWeight);
    }
    setManualWeight('');
    closeModal();
  };

  // ====== ТЕРМИНАЛЫ ======
  const loadTerminals = async () => {
    if (!company?.id || !window.electronAPI?.terminals) return;
    try {
      const res = await window.electronAPI.terminals.getAll(company.id);
      if (res.success && res.data) {
        setTerminals(res.data);
        // Пинг всех
        const statuses: Record<string, boolean> = {};
        for (const t of res.data) {
          try {
            const pingRes = await window.electronAPI.terminals.ping(company.id, t.id);
            statuses[t.id] = pingRes.success && pingRes.data?.online === true;
          } catch {
            statuses[t.id] = false;
          }
        }
        setTerminalStatuses(statuses);
      }
    } catch { }
  };

  const handleCardPayment = () => {
    setPaymentMode('card');
    setActiveModal('terminal');
    loadTerminals();
  };

  const handleTerminalSelect = async (terminalId: string) => {
    if (!company?.id || !window.electronAPI?.terminals) return;

    setActiveTerminalId(terminalId);
    setPaymentPending(true);
    setPaymentTimer(120);
    setActiveModal('none');

    // Таймер обратного отсчёта
    const interval = setInterval(() => {
      setPaymentTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleCancelTerminalPayment();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      const res = await window.electronAPI.terminals.purchase(company.id, terminalId, total);
      clearInterval(interval);
      setPaymentPending(false);

      if (res.success && res.data?.success) {
        // Оплата прошла → обрабатываем как успешную
        const terminal = terminals.find(t => t.id === terminalId);
        await processPaymentWithTerminal(terminal?.bank_name || '');
      } else {
        toast.error(res.data?.error || t('pos.paymentError'));
      }
    } catch {
      clearInterval(interval);
      setPaymentPending(false);
      toast.error(t('pos.systemError'));
    }
  };

  const handleCancelTerminalPayment = async () => {
    if (activeTerminalId && company?.id) {
      await window.electronAPI?.terminals?.cancel(company.id, activeTerminalId);
    }
    setPaymentPending(false);
    setActiveTerminalId(null);
    toast.error(t('pos.cancelPayment'));
  };

  // ====== ОПЛАТА ======
  const processPaymentWithTerminal = async (bankName: string) => {
    if (cart.length === 0 || !company?.id || !user?.id || !currentShift?.id) return;

    const payload = {
      companyId: company.id,
      shiftId: currentShift.id,
      userId: user.id,
      paymentType: 'card',
      items: cart,
      globalDiscount,
      cashAmount: 0,
      cardAmount: total,
      terminalBank: bankName,
    };

    const loading = toast.loading(t('pos.processing'));
    try {
      const res = await window.electronAPI.pos.processSale(payload);
      if (res.success) {
        sendSuccessToDisplay();
        toast.success(t('pos.paymentSuccess'), { id: loading });
        clearCart();
        setPaymentMode('none');
        setCashGiven('');
        setActiveTerminalId(null);
        loadPrintQueueCount();
        setTimeout(() => searchInputRef.current?.focus(), 100);
      } else {
        toast.error(res.error || t('pos.paymentError'), { id: loading });
      }
    } catch {
      toast.error(t('pos.systemError'), { id: loading });
    }
  };

  const processPayment = async () => {
    if (cart.length === 0) return;
    if (!window.electronAPI?.pos) { toast.error(t('pos.apiUnavailable')); return; }
    if (!company?.id || !user?.id) { toast.error(t('pos.authError')); return; }
    if (!currentShift?.id) { toast.error(t('pos.shiftClosed')); return; }

    const missingMarkCodes = cart.filter(item => item.is_marked && !item.mark_code);
    if (missingMarkCodes.length > 0) {
      toast.error(`Отсканируйте марку DataMatrix для товаров: ${missingMarkCodes.map(i => i.name).join(', ')}`);
      return;
    }

    if (paymentMode === 'card') {
      // Открыть выбор терминала (Интеграция)
      handleCardPayment();
      return;
    }

    const payload = {
      companyId: company.id,
      shiftId: currentShift.id,
      userId: user.id,
      paymentType: paymentMode === 'card_manual' ? 'card' : paymentMode,
      items: cart,
      globalDiscount,
      cashAmount: paymentMode === 'cash' ? parseFloat(cashGiven || '0') : paymentMode === 'mixed' ? parseFloat(mixedCash || '0') : 0,
      cardAmount: paymentMode === 'card_manual' ? total : paymentMode === 'mixed' ? (total - parseFloat(mixedCash || '0')) : 0,
    };

    const loading = toast.loading(t('pos.processing'));
    try {
      const res = await window.electronAPI.pos.processSale(payload);
      if (res.success) {
        sendSuccessToDisplay();
        toast.success(t('pos.paymentSuccess'), { id: loading });
        let ofdMsg = `${t('pos.receiptSaved')} #${res.data?.receiptId?.slice(0, 6)}`;
        if (res.data?.ofdStatus === 'sent') ofdMsg += ` • ${t('pos.fiscalized')}`;
        else if (res.data?.ofdStatus === 'pending') ofdMsg += ` • ${t('pos.ofdPending')}`;
        toast.success(ofdMsg, { duration: 5000 });
        clearCart();
        setPaymentMode('none');
        setCashGiven('');
        setMixedCash('');
        loadPrintQueueCount();

        // Устанавливаем данные и закрываем модалку - useEffect вызовет печать (browser print)
        setCompletedReceiptData(res.data?.printData);
        setActiveModal('none');
      } else {
        toast.error(res.error || t('pos.paymentError'), { id: loading });
      }
    } catch {
      toast.error(t('pos.systemError'), { id: loading });
    }
  };

  // ====== X-ОТЧЁТ ======
  const [xReportData, setXReportData] = useState<any>(null);
  const [xReportLoading, setXReportLoading] = useState(false);

  const loadXReport = async () => {
    if (!company?.id || !currentShift?.id) return;
    setXReportLoading(true);
    try {
      const res = await window.electronAPI.reports.xReport(company.id, currentShift.id);
      if (res.success) setXReportData(res.data);
      else toast.error(res.error || 'Ошибка');
    } catch { toast.error('Ошибка загрузки X-отчёта'); }
    finally { setXReportLoading(false); }
  };

  useEffect(() => {
    if (activeModal === 'xreport') loadXReport();
  }, [activeModal]);

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">
      {/* ЛЕВАЯ ЧАСТЬ: Корзина */}
      <div className="flex-1 flex flex-col border-r border-gray-200 bg-white">

        {/* Поиск / Сканер */}
        <div className="p-4 border-b border-gray-100 bg-white shadow-sm z-10 flex gap-4">
          <form onSubmit={handleSearch} className="flex-1 relative">
            <ScanLine className="absolute left-3 top-3 h-6 w-6 text-gray-400" />
            <Input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all font-medium"
              inputMode="none"
              placeholder={t('pos.searchPlaceholder')}
            />
            <button type="submit" className="hidden">{t('common.search')}</button>
          </form>
          <button
            onClick={() => setActiveModal('catalog')}
            className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors border border-gray-200"
          >
            {t('pos.catalog')} (F4)
          </button>
          {printQueueCount > 0 && (
            <button
              onClick={() => window.electronAPI?.reports?.retryPrint(company!.id)}
              className="px-4 py-3 bg-orange-50 hover:bg-orange-100 text-orange-700 font-medium rounded-xl transition-colors border border-orange-200 flex items-center gap-2"
              title={t('printer.queueTitle')}
            >
              <Printer className="w-5 h-5" />
              <span className="bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{printQueueCount}</span>
            </button>
          )}
        </div>

        {/* Список товаров в корзине */}
        <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
              <ShoppingCartIcon className="h-20 w-20 text-gray-200" />
              <p className="text-xl font-medium">{t('pos.emptyCart')}</p>
              <p className="text-sm">{t('pos.startScan')}</p>
              <div className="text-xs text-gray-300 mt-4 space-y-1 text-center">
                <p>F2 — {t('common.search')} &nbsp;|&nbsp; F4 — {t('pos.catalog')} &nbsp;|&nbsp; F8 — {t('reports.xReport')}</p>
                <p>F9 — {t('pos.card')} &nbsp;|&nbsp; Del — {t('common.delete')} &nbsp;|&nbsp; Esc — {t('pos.cancelCheck')}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item, index) => (
                <div
                  key={item.cartItemId}
                  onClick={() => setSelectedCartIndex(index)}
                  className={`bg-white p-4 rounded-xl shadow-sm border-2 flex items-center justify-between group hover:border-primary/50 transition-colors cursor-pointer ${selectedCartIndex === index ? 'border-primary bg-primary/5' : 'border-gray-200'}`}
                >
                  <div className="flex items-center w-12 text-gray-400 font-mono text-lg font-medium">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 group-hover:text-primary transition-colors">{item.name}</h3>
                    <div className="text-sm text-gray-500 mt-0.5 flex items-center gap-3">
                      <span>{item.price_retail.toLocaleString('ru')} ₸ / {item.measure_unit}</span>
                      {item.is_weighable && <span className="text-orange-500 font-medium bg-orange-50 px-2 py-0.5 rounded text-xs border border-orange-100">⚖️ {t('pos.weightProduct')}</span>}
                      {item.is_marked && <span className="text-purple-500 font-medium bg-purple-50 px-2 py-0.5 rounded text-xs border border-purple-100">📦 {t('pos.marking')}</span>}
                    </div>
                  </div>
                  <div className="flex items-center space-x-6">
                    <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200 p-1">
                      <button onClick={(e) => { e.stopPropagation(); updateItemQuantity(item.cartItemId, item.quantity - 1); }} className="p-1.5 hover:bg-white rounded-md text-gray-500 transition-colors"><Minus className="h-5 w-5" /></button>
                      <span className="w-12 text-center font-bold text-lg text-gray-900">{item.is_weighable ? item.quantity.toFixed(3) : item.quantity}</span>
                      <button onClick={(e) => { e.stopPropagation(); updateItemQuantity(item.cartItemId, item.quantity + 1); }} className="p-1.5 hover:bg-white rounded-md text-gray-500 transition-colors"><Plus className="h-5 w-5" /></button>
                    </div>
                    <div className="w-32 text-right">
                      <div className="text-xl font-bold text-gray-900 tracking-tight">{item.subtotal.toLocaleString('ru')} ₸</div>
                      {item.discount > 0 ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); openDiscountModal(item); }}
                          className="text-xs text-red-500 font-medium hover:underline focus:outline-none"
                        >
                          {t('pos.discount')}: -{item.discount} ₸
                        </button>
                      ) : (
                        (user?.role === 'admin' || user?.role === 'manager') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openDiscountModal(item); }}
                            className="text-xs text-gray-400 font-medium hover:underline focus:outline-none hover:text-red-500"
                          >
                            + Скидка
                          </button>
                        )
                      )}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removeItem(item.cartItemId); }} className="p-2 text-red-400 hover:bg-red-50 rounded-lg hover:text-red-600 transition-colors ml-2"><Trash2 className="h-6 w-6" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ПРАВАЯ ЧАСТЬ: Итоги и Оплата */}
      <div className="w-[450px] bg-white flex flex-col shadow-xl z-20">
        {/* Итоговый Блок */}
        <div className="p-8 bg-gray-900 text-white rounded-bl-3xl">
          <div className="flex justify-between items-end mb-2">
            <span className="text-gray-400 font-medium text-lg uppercase tracking-wider">{t('pos.toPay')}</span>
            <span className="text-gray-400 text-sm">{cart.length} {t('pos.items')}</span>
          </div>
          <div className="text-5xl font-black mb-6 tracking-tight">
            {total.toLocaleString('ru')} <span className="text-3xl font-bold text-gray-400 relative -top-1">₸</span>
          </div>
          <div className="flex justify-between items-center text-gray-300 font-medium pb-4 border-b border-gray-700">
            <span>{t('pos.checkDiscount')}</span>
            <span>{globalDiscount > 0 ? `-${globalDiscount}` : '0'} ₸</span>
          </div>
          {totalVat > 0 && (
            <div className="flex justify-between items-center text-gray-400 text-sm mt-3 pb-2 border-b border-gray-700/50">
              <span>{t('pos.vatIncluded')}</span>
              <span>{Math.round(totalVat).toLocaleString('ru')} ₸</span>
            </div>
          )}

        </div>

        {/* Ожидание оплаты терминала */}
        {paymentPending ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-blue-50 animate-pulse">
            <Loader2 className="w-16 h-16 text-blue-500 animate-spin mb-6" />
            <p className="text-xl font-bold text-blue-700 mb-2">{t('pos.waitingPayment')}</p>
            <p className="text-4xl font-black text-blue-800 mb-4">{paymentTimer} {t('pos.sec')}</p>
            <div className="w-full bg-blue-200 rounded-full h-2 mb-6">
              <div className="bg-blue-600 h-2 rounded-full transition-all duration-1000" style={{ width: `${(paymentTimer / 120) * 100}%` }} />
            </div>
            <button
              onClick={handleCancelTerminalPayment}
              className="px-8 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors"
            >
              {t('pos.cancelPayment')} (Esc)
            </button>
          </div>
        ) : (
          /* Выбор типа оплаты */
          <div className="flex-1 p-6 flex flex-col overflow-y-auto">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">{t('pos.paymentMethod')}</h3>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <button
                onClick={() => setPaymentMode('card_manual')}
                className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all ${paymentMode === 'card_manual' ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm' : 'border-gray-200 hover:border-orange-300 text-gray-600'}`}
              >
                <CreditCard className={`h-10 w-10 mb-3 ${paymentMode === 'card_manual' ? 'text-orange-600' : 'text-gray-400'}`} />
                <span className="font-bold text-lg">{t('pos.card')}</span>
                <span className="text-xs mt-1 opacity-70">Ручной ввод</span>
              </button>
              <button
                onClick={handleCardPayment}
                className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all ${paymentMode === 'card' ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' : 'border-gray-200 hover:border-blue-300 text-gray-600'}`}
              >
                <CreditCard className={`h-10 w-10 mb-3 ${paymentMode === 'card' ? 'text-blue-600' : 'text-gray-400'}`} />
                <span className="font-bold text-lg">Банковский терминал</span>
                <span className="text-xs mt-1 opacity-70">{t('pos.autoTerminal')} (F9)</span>
              </button>
              <button
                onClick={() => setPaymentMode('cash')}
                className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all ${paymentMode === 'cash' ? 'border-green-500 bg-green-50 text-green-700 shadow-sm' : 'border-gray-200 hover:border-green-300 text-gray-600'}`}
              >
                <Banknote className={`h-10 w-10 mb-3 ${paymentMode === 'cash' ? 'text-green-600' : 'text-gray-400'}`} />
                <span className="font-bold text-lg">{t('pos.cash')}</span>
              </button>
              <button
                onClick={() => setPaymentMode('qr')}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${paymentMode === 'qr' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 hover:border-purple-300 text-gray-600'}`}
              >
                <QrCode className="h-8 w-8 mb-2" />
                <span className="font-semibold">{t('pos.qr')}</span>
              </button>
              <button
                onClick={() => setPaymentMode('mixed')}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${paymentMode === 'mixed' ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-gray-200 hover:border-indigo-300 text-gray-600'}`}
              >
                <div className="flex mb-2">
                  <Banknote className={`h-6 w-6 -mr-2 z-10 rounded-full ${paymentMode === 'mixed' ? 'text-indigo-600' : 'text-gray-400'}`} />
                  <CreditCard className={`h-6 w-6 ${paymentMode === 'mixed' ? 'text-indigo-600' : 'text-gray-400'}`} />
                </div>
                <span className="font-semibold">{t('pos.mixed')}</span>
              </button>
            </div>

            {/* Ввод наличных */}
            {paymentMode === 'cash' && (
              <div className="mb-6 p-5 bg-green-50 rounded-2xl border border-green-100">
                <label className="block text-sm font-semibold text-green-800 mb-2">{t('pos.receivedFromClient')}</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  data-has-numpad="true"
                  value={cashGiven}
                  onChange={(e) => setCashGiven(e.target.value)}
                  inputMode="none"
                  className="w-full text-3xl font-bold bg-white border border-green-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder={total.toString()}
                />
                <NumPad value={cashGiven} onChange={setCashGiven} onEnter={processPayment} />
                {parseFloat(cashGiven || '0') > total && (
                  <div className="mt-4 flex justify-between items-center text-lg">
                    <span className="text-green-800 font-medium">{t('pos.change')}:</span>
                    <span className="font-bold text-2xl text-green-700 border-b-2 border-green-300 pb-1">
                      {(parseFloat(cashGiven || '0') - total).toLocaleString('ru')} ₸
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Ввод смешанной оплаты */}
            {paymentMode === 'mixed' && (
              <div className="mb-6 p-5 bg-indigo-50 rounded-2xl border border-indigo-100">
                <label className="block text-sm font-semibold text-indigo-800 mb-2">💵 Наличными:</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  data-has-numpad="true"
                  value={mixedCash}
                  onChange={(e) => setMixedCash(e.target.value)}
                  inputMode="none"
                  className="w-full text-2xl font-bold bg-white border border-indigo-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="0"
                />
                <NumPad value={mixedCash} onChange={setMixedCash} onEnter={processPayment} />
                <div className="mt-3 flex justify-between items-center text-lg">
                  <span className="text-indigo-800 font-medium">💳 Картой:</span>
                  <span className="font-bold text-xl text-indigo-700">
                    {Math.max(0, total - parseFloat(mixedCash || '0')).toLocaleString('ru')} ₸
                  </span>
                </div>
              </div>
            )}

            <div className="mt-auto pt-4 flex gap-4">
              <button
                onClick={clearCart}
                className="px-6 py-4 font-bold text-gray-600 bg-gray-100 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors"
                title={t('pos.cancelCheck')}
              >
                <X className="w-8 h-8" />
              </button>
              <button
                onClick={processPayment}
                disabled={cart.length === 0 || paymentMode === 'none' || (paymentMode === 'cash' && parseFloat(cashGiven || '0') < total && cashGiven !== '') || (paymentMode === 'mixed' && !(parseFloat(mixedCash || '0') > 0))}
                className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold text-xl rounded-xl shadow-lg shadow-primary/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 disabled:shadow-none flex items-center justify-center gap-3 py-4"
              >
                {t('pos.pay')} <span className="opacity-70 text-sm font-normal">(Enter)</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ====== МОДАЛКА ВЫБОРА ТЕРМИНАЛА ====== */}
      {activeModal === 'terminal' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-2xl p-8 w-[500px] max-h-[80vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-bold mb-6 text-center">{t('pos.selectTerminal')}</h2>
            {terminals.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <WifiOff className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Нет добавленных терминалов</p>
                <p className="text-sm mt-1">Добавьте терминал в Настройках → Оборудование</p>
              </div>
            ) : (
              <div className="space-y-3">
                {terminals.map(term => {
                  const online = terminalStatuses[term.id] === true;
                  return (
                    <div key={term.id} className={`flex items-center justify-between p-4 rounded-xl border-2 ${online ? 'border-gray-200 hover:border-blue-400 cursor-pointer' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                      <div className="flex items-center gap-3">
                        <span className={`w-3 h-3 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`} />
                        <div>
                          <div className="font-bold text-lg">{term.bank_name}</div>
                          <div className="text-xs text-gray-500">{term.model} • {term.address}{term.port ? `:${term.port}` : ''}</div>
                        </div>
                      </div>
                      {online ? (
                        <button
                          onClick={() => handleTerminalSelect(term.id)}
                          className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg transition-colors"
                        >
                          {t('pos.select')}
                        </button>
                      ) : (
                        <span className="text-red-500 text-sm font-medium">{t('pos.terminalOffline')}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <button onClick={closeModal} className="w-full mt-6 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium text-gray-600 transition-colors">
              {t('common.cancel')} (Esc)
            </button>
          </div>
        </div>
      )}

      {/* ====== МОДАЛКА КАТАЛОГА (F4) ====== */}
      {activeModal === 'catalog' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-2xl w-[700px] max-h-[85vh] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex items-center gap-4">
              <h2 className="text-xl font-bold">{t('pos.catalog')}</h2>
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  value={catalogSearch}
                  onChange={e => setCatalogSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary"
                  inputMode="none"
                  placeholder="Поиск по названию..."
                />
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {catalogLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {catalogProducts
                    .filter(p => !catalogSearch || p.name.toLowerCase().includes(catalogSearch.toLowerCase()) || (p.barcode || '').includes(catalogSearch))
                    .map(product => (
                      <button
                        key={product.id}
                        onClick={() => {
                          handleProductSelected(product);
                          // Закрываем каталог только если не открылась другая модалка (весы, маркировка, возраст)
                          if (!product.is_weighable && !product.is_marked && !product.is_alcohol) {
                            closeModal();
                          }
                        }}
                        className="text-left p-4 bg-gray-50 hover:bg-primary/5 hover:border-primary border-2 border-gray-200 rounded-xl transition-all group"
                      >
                        <div className="font-bold text-gray-900 group-hover:text-primary text-sm leading-tight mb-2 line-clamp-2">{product.name}</div>
                        <div className="flex justify-between items-end">
                          <span className="text-xs text-gray-500 font-mono">{product.barcode}</span>
                          <span className="font-bold text-primary text-lg">{Number(product.price_retail).toLocaleString('ru')} ₸</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{product.measure_unit}</div>
                      </button>
                    ))}
                  {catalogProducts.filter(p => !catalogSearch || p.name.toLowerCase().includes(catalogSearch.toLowerCase())).length === 0 && (
                    <div className="col-span-3 text-center text-gray-400 py-10">Товары не найдены</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====== МОДАЛКА ВЗВЕШИВАНИЯ ====== */}
      {activeModal === 'weighing' && weighingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-2xl p-8 w-[450px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <Scale className="w-12 h-12 mx-auto text-orange-500 mb-3" />
              <h2 className="text-xl font-bold mb-1">{t('pos.weighing')}</h2>
              <p className="text-gray-500 text-sm mb-6">{weighingProduct.name}</p>
            </div>
            <div className="bg-orange-50 rounded-2xl p-6 text-center mb-4 border border-orange-200">
              <div className="text-sm text-orange-600 font-medium mb-1">⚖️ {t('pos.weight')}</div>
              <div className="text-5xl font-black text-gray-900 mb-2">
                {currentWeight.toFixed(3)} <span className="text-2xl text-gray-400">{t('pos.kg')}</span>
              </div>
              <div className={`text-sm font-medium ${weightStable ? 'text-green-600' : 'text-orange-500'}`}>
                {weightStable ? `✅ ${t('pos.stable')}` : `⏳ ${t('pos.weighingInProgress')}`}
              </div>
            </div>

            {/* Ручной ввод веса (для фасованных товаров с ценником) */}
            <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <label className="block text-sm font-semibold text-blue-800 mb-2">📋 Или введите вес вручную (кг):</label>
              <Input
                type="number"
                data-has-numpad="true"
                step="any"
                min="0"
                value={manualWeight}
                onChange={(e) => setManualWeight(e.target.value)}
                className="w-full text-2xl font-bold bg-white border border-blue-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Например: 0.450"
              />
              <NumPad value={manualWeight} onChange={setManualWeight} onEnter={confirmWeight} />
            </div>

            <div className="bg-gray-50 rounded-xl p-4 flex justify-between items-center mb-6">
              <span className="text-gray-600 font-medium">💰 {t('pos.toPay')}:</span>
              <span className="text-2xl font-bold text-gray-900">
                {((parseFloat(manualWeight) > 0 ? parseFloat(manualWeight) : currentWeight) * weighingProduct.price_retail).toLocaleString('ru', { maximumFractionDigits: 0 })} ₸
              </span>
            </div>
            <div className="flex gap-3">
              <button onClick={closeModal} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium text-gray-600 transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmWeight}
                disabled={currentWeight <= 0 && !(parseFloat(manualWeight) > 0)}
                className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                {t('pos.addToCart')} (Enter)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== МОДАЛКА X-ОТЧЁТА ====== */}
      {activeModal === 'xreport' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-2xl p-0 w-[550px] max-h-[85vh] shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-900 text-white p-6 text-center">
              <h2 className="text-2xl font-black tracking-wider">{t('reports.xReportTitle')}</h2>
              <p className="text-gray-400 text-sm mt-1">{t('reports.xReportSubtitle')}</p>
            </div>
            <div className="p-6 overflow-auto flex-1 font-mono text-sm">
              {xReportLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
              ) : !xReportData ? (
                <div className="text-center text-gray-400 py-8">{t('reports.shiftMustOpen')}</div>
              ) : (
                <div className="space-y-4">
                  <div className="text-gray-600">
                    <p>{t('reports.date')}: {xReportData.date}</p>
                    <p>{t('reports.time')}: {xReportData.time}</p>
                    <p>{t('reports.cashier')}: {xReportData.cashierName}</p>
                    <p>{t('reports.register')}: {xReportData.znm}</p>
                  </div>
                  <div className="border-t border-dashed border-gray-300 pt-3">
                    <p className="font-bold text-gray-800 mb-2">{t('reports.salesSection')}:</p>
                    <p>&nbsp;&nbsp;{t('reports.receiptsQty')}: <b>{xReportData.salesCount}</b></p>
                    <p>&nbsp;&nbsp;{t('reports.productsQty')}: <b>{xReportData.productsCount}</b></p>
                    <p>&nbsp;&nbsp;{t('reports.cashTotal')}: <b>{xReportData.cashSales?.toLocaleString('ru')} ₸</b></p>
                    <p>&nbsp;&nbsp;{t('reports.cardTotal')}: <b>{xReportData.cardSales?.toLocaleString('ru')} ₸</b></p>
                    {xReportData.cardByBank && Object.entries(xReportData.cardByBank).map(([bank, amount]: [string, any]) => (
                      <p key={bank} className="text-gray-500">&nbsp;&nbsp;&nbsp;&nbsp;{bank}: {amount?.toLocaleString('ru')} ₸</p>
                    ))}
                    <p>&nbsp;&nbsp;{t('reports.qrTotal')}: <b>{xReportData.qrSales?.toLocaleString('ru')} ₸</b></p>
                    <p className="border-t border-gray-200 pt-1 mt-1 font-bold">&nbsp;&nbsp;{t('reports.totalSales')}: {xReportData.totalSales?.toLocaleString('ru')} ₸</p>
                  </div>
                  <div className="border-t border-dashed border-gray-300 pt-3">
                    <p className="font-bold text-gray-800 mb-2">{t('reports.returnsSection')}:</p>
                    <p>&nbsp;&nbsp;{t('reports.returnsQty')}: <b>{xReportData.returnsCount}</b></p>
                    <p>&nbsp;&nbsp;{t('reports.returnsCash')}: <b>{xReportData.returnsCash?.toLocaleString('ru')} ₸</b></p>
                    <p>&nbsp;&nbsp;{t('reports.returnsCard')}: <b>{xReportData.returnsCard?.toLocaleString('ru')} ₸</b></p>
                    <p className="border-t border-gray-200 pt-1 mt-1 font-bold">&nbsp;&nbsp;{t('reports.totalReturns')}: {xReportData.totalReturns?.toLocaleString('ru')} ₸</p>
                  </div>
                  <div className="bg-gray-900 text-white p-4 rounded-xl text-center">
                    <p className="text-gray-400 text-xs uppercase tracking-wider">{t('reports.netRevenue')}</p>
                    <p className="text-3xl font-black">{xReportData.netRevenue?.toLocaleString('ru')} ₸</p>
                  </div>
                  <div className="text-gray-600">
                    <p>{t('reports.deposits')}: {xReportData.deposits?.toLocaleString('ru')} ₸</p>
                    <p>{t('reports.withdrawals')}: {xReportData.withdrawals?.toLocaleString('ru')} ₸</p>
                    <p className="font-bold">{t('reports.cashBalance')}: {xReportData.cashBalance?.toLocaleString('ru')} ₸</p>
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t bg-gray-50">
              <button onClick={closeModal} className="w-full py-3 bg-gray-200 hover:bg-gray-300 rounded-xl font-medium text-gray-700 transition-colors">
                {t('common.cancel')} (Esc)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== МОДАЛКА СКИДКИ ====== */}
      {activeModal === 'discount' && discountItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-2xl p-6 w-[400px] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-4 text-center">Скидка на позицию</h2>
            <div className="bg-gray-50 rounded-xl p-4 mb-4 text-sm text-gray-600">
              <div className="font-bold text-gray-900 truncate mb-1">{discountItem.name}</div>
              <div className="flex justify-between">
                <span>Количество: {discountItem.quantity} {discountItem.measure_unit}</span>
                <span>Сумма: {(discountItem.price_retail * discountItem.quantity).toLocaleString('ru')} ₸</span>
              </div>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Сумма скидки (₸)</label>
              <Input
                type="number"
                min="0"
                step="1"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                inputMode="none"
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-xl font-bold"
                placeholder="0"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyDiscount();
                  }
                }}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium text-gray-600 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={applyDiscount}
                className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-colors"
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== МОДАЛКА МАРКИРОВКИ (DataMatrix) ====== */}
      {activeModal === 'marking' && markingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-purple-100 flex justify-between items-center bg-purple-50">
              <h2 className="text-lg font-bold text-purple-900 flex items-center gap-2">
                <ScanLine className="w-5 h-5" />
                Маркировка (DataMatrix)
              </h2>
              <button onClick={closeModal} className="text-purple-400 hover:text-purple-600 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700">{markingProduct.name}</p>
                <p className="text-xs text-purple-600 mt-1">Отсканируйте код DataMatrix на упаковке товара</p>
              </div>

              <form onSubmit={confirmMarking}>
                <Input
                  ref={markCodeInputRef}
                  value={markCodeInput}
                  onChange={(e) => setMarkCodeInput(e.target.value)}
                  placeholder="Отсканируйте код..."
                  className="w-full text-center text-lg h-12 border-purple-200 focus:border-purple-500 focus:ring-purple-500"
                  autoComplete="off"
                />

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={!markCodeInput.trim()}
                    className="flex-1 py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl shadow-md transition-colors disabled:opacity-50"
                  >
                    Подтвердить
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ====== МОДАЛКА ПРОВЕРКИ ВОЗРАСТА (21+) ====== */}
      {activeModal === 'age_verification' && ageVerifyProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-red-100 flex justify-between items-center bg-red-50">
              <h2 className="text-lg font-bold text-red-900 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5" />
                Проверка возраста
              </h2>
              <button onClick={closeModal} className="text-red-400 hover:text-red-600 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-black text-red-600">21+</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Алкогольная продукция</h3>
              <p className="text-gray-600 mb-4">
                Товар: <span className="font-semibold text-gray-900">{ageVerifyProduct.name}</span>
              </p>
              <div className="p-3 bg-blue-50 text-blue-800 rounded-xl text-sm font-medium mb-6">
                Пожалуйста, проверьте удостоверение личности покупателя. Продажа лицам до 21 года запрещена!
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={confirmAge}
                  className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md transition-colors"
                >
                  Подтверждаю (21+)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Скрытый рендер чека для печати */}
      <div className="absolute -left-[9999px] -top-[9999px]">
        <PrintableReceipt ref={receiptPrintRef} receiptData={completedReceiptData} showFiscalBadge={useSettingsStore.getState().showFiscalBadge} />
      </div>
    </div>
  );
}

function ShoppingCartIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
    </svg>
  );
}
