import { useState, useEffect } from 'react';

type DisplayMode = 'idle' | 'sale' | 'payment-card' | 'payment-cash' | 'payment-qr' | 'success';

interface DisplayData {
  items?: Array<{ name: string; price: number; qty: number }>;
  total?: number;
  received?: number;
  change?: number;
  qrCode?: string;
}

export default function CustomerDisplay() {
  const [mode, setMode] = useState<DisplayMode>('idle');
  const [data, setData] = useState<DisplayData>({});

  useEffect(() => {
    const handler = (payload: { mode: DisplayMode; data: DisplayData }) => {
      setMode(payload.mode);
      setData(payload.data || {});

      // Успех → автоматически вернуться к idle через 4 секунды
      if (payload.mode === 'success') {
        setTimeout(() => {
          setMode('idle');
          setData({});
        }, 4000);
      }
    };

    // Слушаем IPC событие от main процесса
    if (window.electronAPI?.onCustomerDisplayMode) {
      window.electronAPI.onCustomerDisplayMode(handler);
    }
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden select-none cursor-default" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      {mode === 'idle' && <IdleScreen />}
      {mode === 'sale' && <SaleScreen items={data.items} total={data.total} />}
      {mode === 'payment-card' && <CardPaymentScreen total={data.total} />}
      {mode === 'payment-cash' && <CashPaymentScreen total={data.total} received={data.received} change={data.change} />}
      {mode === 'payment-qr' && <QRPaymentScreen total={data.total} qrCode={data.qrCode} />}
      {mode === 'success' && <SuccessScreen />}
    </div>
  );
}

// ═══════════════════════════════════════════
// РЕЖИМ 1 — Ожидание
// ═══════════════════════════════════════════
function IdleScreen() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 30%, #4c1d95 60%, #831843 100%)' }}>

      {/* Декоративные круги */}
      <div className="absolute top-[-100px] left-[-100px] w-[400px] h-[400px] rounded-full opacity-10"
        style={{ background: 'radial-gradient(circle, #818cf8 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-150px] right-[-150px] w-[500px] h-[500px] rounded-full opacity-10"
        style={{ background: 'radial-gradient(circle, #c084fc 0%, transparent 70%)' }} />

      {/* Логотип */}
      <img
        src="./easykassa.png"
        alt="EasyKassa"
        className="h-32 w-auto object-contain mb-6"
        style={{ filter: 'drop-shadow(0 4px 30px rgba(139,92,246,0.5))' }}
      />
      <p className="text-2xl text-purple-200 mb-12 font-light">Добро пожаловать!</p>

      {/* Часы */}
      <div className="text-6xl font-extralight text-white/80 tabular-nums">
        {time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div className="text-xl text-white/50 mt-3">
        {time.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════
// РЕЖИМ 2 — Продажа (список товаров)
// ═══════════════════════════════════════════
function SaleScreen({ items = [], total = 0 }: { items?: DisplayData['items']; total?: number }) {
  return (
    <div className="w-full h-full bg-white flex flex-col">
      {/* Заголовок */}
      <div className="px-10 pt-8 pb-4 border-b-2 border-gray-100">
        <h2 className="text-4xl font-bold text-gray-800">🛒 Ваша покупка</h2>
      </div>

      {/* Список товаров */}
      <div className="flex-1 overflow-auto px-10 py-4">
        {items && items.length > 0 ? (
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="flex justify-between items-center py-4 px-6 bg-gray-50 rounded-2xl">
                <div className="flex-1 mr-4">
                  <p className="text-2xl font-medium text-gray-800 truncate">{item.name}</p>
                  <p className="text-lg text-gray-500">{item.qty} × {item.price.toLocaleString('ru-RU')} ₸</p>
                </div>
                <p className="text-3xl font-bold text-gray-900 whitespace-nowrap">
                  {(item.qty * item.price).toLocaleString('ru-RU')} ₸
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-300 text-3xl">
            Товары появятся здесь...
          </div>
        )}
      </div>

      {/* ИТОГО */}
      <div className="px-10 py-6 bg-gradient-to-r from-indigo-600 to-purple-600 flex justify-between items-center">
        <span className="text-4xl font-bold text-white/90">ИТОГО</span>
        <span className="text-6xl font-black text-white">{total.toLocaleString('ru-RU')} ₸</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// РЕЖИМ 3 — Оплата картой
// ═══════════════════════════════════════════
function CardPaymentScreen({ total = 0 }: { total?: number }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-white"
      style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 50%, #312e81 100%)' }}>

      {/* SVG Карта */}
      <svg width="360" height="220" viewBox="0 0 360 220" className="mb-12 drop-shadow-2xl" style={{ animation: 'float 3s ease-in-out infinite' }}>
        <defs>
          <linearGradient id="cg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <rect width="360" height="220" rx="20" fill="url(#cg)" />
        <rect x="28" y="75" width="60" height="46" rx="6" fill="#fbbf24" opacity="0.9" />
        <rect x="32" y="90" width="12" height="16" rx="2" fill="#d97706" opacity="0.4" />
        <rect x="48" y="90" width="12" height="16" rx="2" fill="#d97706" opacity="0.4" />
        <text x="28" y="170" fill="white" fontSize="22" fontFamily="monospace" opacity="0.7">
          •••• •••• •••• ••••
        </text>
        <circle cx="296" cy="52" r="28" fill="#ef4444" opacity="0.85" />
        <circle cx="322" cy="52" r="28" fill="#f97316" opacity="0.85" />
      </svg>

      <h2 className="text-6xl font-bold mb-3">Приложите карту</h2>
      <p className="text-3xl opacity-70 mb-12">к терминалу</p>

      <div className="bg-white/15 backdrop-blur-sm rounded-3xl px-14 py-6 border border-white/20">
        <span className="text-7xl font-black">{total.toLocaleString('ru-RU')} ₸</span>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(-1deg); }
          50% { transform: translateY(-15px) rotate(1deg); }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════
// РЕЖИМ 4 — Оплата наличными
// ═══════════════════════════════════════════
function CashPaymentScreen({ total = 0, received = 0, change = 0 }: { total?: number; received?: number; change?: number }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-white"
      style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 50%, #065f46 100%)' }}>

      <div className="text-9xl mb-8" style={{ animation: 'float 3s ease-in-out infinite' }}>💵</div>

      <h2 className="text-5xl font-bold mb-12">Оплата наличными</h2>

      <div className="bg-white/15 backdrop-blur-sm rounded-3xl p-10 space-y-5 w-[480px] border border-white/20">
        <div className="flex justify-between text-3xl">
          <span className="opacity-80">К оплате:</span>
          <span className="font-bold">{total!.toLocaleString('ru-RU')} ₸</span>
        </div>
        {received! > 0 && (
          <>
            <div className="flex justify-between text-3xl">
              <span className="opacity-80">Получено:</span>
              <span className="font-bold">{received!.toLocaleString('ru-RU')} ₸</span>
            </div>
            <div className="border-t border-white/30 pt-5 flex justify-between text-4xl">
              <span className="opacity-90">Сдача:</span>
              <span className="font-black text-yellow-300">{change!.toLocaleString('ru-RU')} ₸</span>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-15px); }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════
// РЕЖИМ 5 — Оплата QR-кодом
// ═══════════════════════════════════════════
function QRPaymentScreen({ total = 0, qrCode = '' }: { total?: number; qrCode?: string }) {
  return (
    <div className="w-full h-full bg-white flex flex-col items-center justify-center">
      <h2 className="text-5xl font-bold text-gray-800 mb-2">📱 Оплата по QR-коду</h2>
      <p className="text-2xl text-gray-500 mb-10">Отсканируйте камерой телефона</p>

      <div className="p-8 bg-white border-4 border-gray-900 rounded-3xl shadow-2xl mb-10">
        {qrCode
          ? <img src={qrCode} alt="QR" className="w-80 h-80" />
          : <div className="w-80 h-80 flex items-center justify-center bg-gray-50 rounded-2xl text-gray-300 text-2xl">
            QR-код
          </div>
        }
      </div>

      <div className="bg-indigo-600 text-white rounded-2xl px-14 py-6 shadow-lg shadow-indigo-600/30">
        <span className="text-5xl font-bold">{total!.toLocaleString('ru-RU')} ₸</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// РЕЖИМ 6 — Успешная оплата
// ═══════════════════════════════════════════
function SuccessScreen() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-white"
      style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #15803d 100%)' }}>

      <div className="text-[10rem] mb-6" style={{ animation: 'pop 0.6s ease-out' }}>✅</div>

      <h2 className="text-7xl font-bold mb-6" style={{ animation: 'fadeUp 0.8s ease-out 0.3s both' }}>
        Оплата прошла!
      </h2>
      <p className="text-4xl opacity-80" style={{ animation: 'fadeUp 0.8s ease-out 0.5s both' }}>
        Спасибо за покупку! 🎉
      </p>

      <style>{`
        @keyframes pop {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes fadeUp {
          0% { transform: translateY(30px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
