import React, { useEffect, useState } from 'react';
import { Download, RefreshCcw, X, Info, CheckCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
}

export const UpdateNotifier: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (!window.electronAPI?.updater) return;

    const updater = window.electronAPI.updater;

    updater.onChecking(() => {
      setIsChecking(true);
    });

    updater.onAvailable((info: any) => {
      setIsChecking(false);
      setUpdateAvailable(info);
      toast((t) => (
        <span className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-500" />
          Найдено обновление: v{info.version}
        </span>
      ), { duration: 5000 });
    });

    updater.onNotAvailable(() => {
      setIsChecking(false);
    });

    updater.onProgress((data: any) => {
      setDownloadProgress(data.percent);
    });

    updater.onDownloaded((info: any) => {
      setIsDownloaded(true);
      setDownloadProgress(null);
      toast.success(`Обновление v${info.version} готово к установке`, { duration: 10000 });
    });

    updater.onError((err: any) => {
      setIsChecking(false);
      console.error('Update error:', err);
      // Не спамим ошибками, если нет интернета
    });

    return () => {
      updater.removeAllListeners();
    };
  }, []);

  const handleDownload = async () => {
    if (!window.electronAPI?.updater) return;
    try {
      const res = await window.electronAPI.updater.download();
      if (!res.success) {
        toast.error('Ошибка начала загрузки: ' + res.error);
      }
    } catch (err: any) {
      toast.error('Ошибка: ' + err.message);
    }
  };

  const handleInstall = async () => {
    if (!window.electronAPI?.updater) return;
    try {
      await window.electronAPI.updater.install();
    } catch (err: any) {
      toast.error('Ошибка установки: ' + err.message);
    }
  };

  if (!updateAvailable && !isDownloaded) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-right-10 duration-300">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 w-80 overflow-hidden relative">
        <button 
          onClick={() => { setUpdateAvailable(null); setIsDownloaded(false); }}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl ${isDownloaded ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
            {isDownloaded ? <CheckCircle className="w-6 h-6" /> : <RefreshCcw className="w-6 h-6" />}
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900">
              {isDownloaded ? 'Обновление готово' : 'Доступно обновление'}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Версия: <span className="font-mono font-medium">v{updateAvailable?.version}</span>
            </p>
          </div>
        </div>

        {downloadProgress !== null && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-xs font-medium text-gray-600">
              <span>Загрузка...</span>
              <span>{downloadProgress}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-300" 
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          {isDownloaded ? (
            <button 
              onClick={handleInstall}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl font-bold text-sm transition-all shadow-md shadow-green-200 flex items-center justify-center gap-2"
            >
              <RefreshCcw className="w-4 h-4" />
              Установить сейчас
            </button>
          ) : (
            <button 
              onClick={handleDownload}
              disabled={downloadProgress !== null}
              className="flex-1 bg-primary hover:bg-primary/90 text-white py-2.5 rounded-xl font-bold text-sm transition-all shadow-md shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {downloadProgress !== null ? 'Скачивание...' : 'Скачать'}
            </button>
          )}
        </div>
        
        {!isDownloaded && downloadProgress === null && (
          <button 
            onClick={() => setUpdateAvailable(null)}
            className="w-full mt-2 text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
          >
            Напомнить позже
          </button>
        )}
      </div>
    </div>
  );
};
