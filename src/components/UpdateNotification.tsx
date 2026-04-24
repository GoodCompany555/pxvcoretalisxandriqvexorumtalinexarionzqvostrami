import React, { useState, useEffect, useCallback } from 'react';
import { Download, RefreshCw, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';

export default function UpdateNotification() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [version, setVersion] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = window.electronAPI?.updater;
    if (!api) return;

    api.onChecking(() => {
      setStatus('checking');
    });

    api.onAvailable((data) => {
      setStatus('available');
      setVersion(data.version);
      setDismissed(false);
    });

    api.onNotAvailable(() => {
      setStatus('idle');
    });

    api.onProgress((data) => {
      setStatus('downloading');
      setProgress(data.percent);
    });

    api.onDownloaded((data) => {
      setStatus('downloaded');
      setVersion(data.version);
    });

    api.onError((data) => {
      setStatus('error');
      setError(data.message || 'Неизвестная ошибка');
      // Через 10 секунд убираем ошибку
      setTimeout(() => {
        setStatus('idle');
        setError('');
      }, 10_000);
    });

    return () => {
      api.removeAllListeners();
    };
  }, []);

  const handleDownload = useCallback(async () => {
    try {
      setStatus('downloading');
      setProgress(0);
      await window.electronAPI.updater.download();
    } catch {
      setStatus('error');
      setError('Ошибка при скачивании');
    }
  }, []);

  const handleInstall = useCallback(async () => {
    try {
      await window.electronAPI.updater.install();
    } catch {
      setStatus('error');
      setError('Ошибка при установке');
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  // Ничего не показываем, если нечего показывать или пользователь закрыл уведомление
  if (status === 'idle' || status === 'checking') return null;
  if (dismissed && status !== 'downloading' && status !== 'downloaded') return null;

  return (
    <div
      id="update-notification"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 99999,
        width: '380px',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        borderRadius: '16px',
        padding: '20px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.08)',
        color: '#fff',
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        animation: 'updateSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <style>{`
        @keyframes updateSlideIn {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes updatePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .update-btn {
          border: none;
          border-radius: 10px;
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s ease;
        }
        .update-btn:hover { transform: translateY(-1px); filter: brightness(1.1); }
        .update-btn:active { transform: translateY(0); }
        .update-btn-primary {
          background: linear-gradient(135deg, #00b894 0%, #00a97a 100%);
          color: white;
        }
        .update-btn-install {
          background: linear-gradient(135deg, #6c5ce7 0%, #a855f7 100%);
          color: white;
        }
        .update-close {
          position: absolute;
          top: 12px;
          right: 12px;
          background: rgba(255,255,255,0.1);
          border: none;
          color: #aaa;
          cursor: pointer;
          border-radius: 8px;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .update-close:hover { background: rgba(255,255,255,0.2); color: #fff; }
        .update-progress-bar {
          width: 100%;
          height: 6px;
          background: rgba(255,255,255,0.1);
          border-radius: 3px;
          overflow: hidden;
          margin-top: 12px;
        }
        .update-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00b894, #55efc4);
          border-radius: 3px;
          transition: width 0.3s ease;
        }
      `}</style>

      {/* Кнопка закрыть */}
      {status !== 'downloading' && (
        <button className="update-close" onClick={handleDismiss}>
          <X size={16} />
        </button>
      )}

      {/* ─── Обновление доступно ─── */}
      {status === 'available' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #00b894, #55efc4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Download size={20} color="#1a1a2e" />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700 }}>Доступно обновление</div>
              <div style={{ fontSize: '13px', color: '#aaa', marginTop: '2px' }}>Версия {version}</div>
            </div>
          </div>
          <p style={{ fontSize: '13px', color: '#999', margin: '0 0 16px', lineHeight: 1.5 }}>
            Новая версия EasyKassa готова к установке. Все ваши данные будут сохранены.
          </p>
          <button className="update-btn update-btn-primary" onClick={handleDownload}>
            <Download size={16} /> Скачать обновление
          </button>
        </>
      )}

      {/* ─── Загрузка ─── */}
      {status === 'downloading' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Loader2 size={20} color="#55efc4" style={{ animation: 'updatePulse 1.5s infinite' }} />
            <div style={{ fontSize: '14px', fontWeight: 600 }}>
              Загрузка обновления... {progress}%
            </div>
          </div>
          <div className="update-progress-bar">
            <div className="update-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </>
      )}

      {/* ─── Готово к установке ─── */}
      {status === 'downloaded' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #6c5ce7, #a855f7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <CheckCircle size={20} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700 }}>Обновление загружено</div>
              <div style={{ fontSize: '13px', color: '#aaa', marginTop: '2px' }}>Версия {version} готова</div>
            </div>
          </div>
          <p style={{ fontSize: '13px', color: '#999', margin: '0 0 16px', lineHeight: 1.5 }}>
            Перед установкой будет создана резервная копия данных. Приложение перезапустится автоматически.
          </p>
          <button className="update-btn update-btn-install" onClick={handleInstall}>
            <RefreshCw size={16} /> Установить и перезапустить
          </button>
        </>
      )}

      {/* ─── Ошибка ─── */}
      {status === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertCircle size={20} color="#ff6b6b" />
          <div style={{ fontSize: '13px', color: '#ff6b6b' }}>
            Ошибка обновления: {error}
          </div>
        </div>
      )}
    </div>
  );
}
