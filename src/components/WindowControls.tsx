import { Minus, X } from 'lucide-react';

export default function WindowControls() {
  // Не показываем эти кнопки на экране покупателя
  if (window.location.hash.includes('/customer-display')) {
    return null;
  }

  return (
    <div className="absolute top-0 left-0 right-0 h-10 z-[9999] flex justify-end" style={{ WebkitAppRegion: 'drag' } as any}>
      <button
        onClick={() => (window as any).electronAPI?.appControl?.minimize()}
        className="w-12 h-10 flex items-center justify-center text-gray-500 hover:bg-black/10 transition-colors cursor-pointer bg-white/10 backdrop-blur-sm shadow-sm"
        title="Свернуть"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <Minus className="w-5 h-5 pointer-events-none" />
      </button>
      <button
        onClick={() => window.electronAPI?.appControl?.toggleFullscreen()}
        className="group w-12 h-10 flex items-center justify-center text-gray-500 hover:bg-black/10 transition-colors cursor-pointer bg-white/10 backdrop-blur-sm shadow-sm"
        title="Развернуть/Оконный режим"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <div className="w-3 h-3 border-[1.5px] border-gray-500 group-hover:border-gray-900 transition-colors pointer-events-none" />
      </button>
      <button
        onClick={() => window.electronAPI?.appControl?.closeApp()}
        className="w-12 h-10 flex items-center justify-center text-gray-500 hover:bg-red-600 hover:text-white transition-colors cursor-pointer bg-white/10 backdrop-blur-sm shadow-sm"
        title="Закрыть программу"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <X className="w-5 h-5 pointer-events-none" />
      </button>
    </div>
  );
}
