import { useEffect, useState } from "react";
import { checkForUpdate, UpdateInfo } from "../utils/updater";

export default function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    checkForUpdate().then(setUpdate);
  }, []);

  if (!update) return null;

  const handleInstall = async () => {
    setDownloading(true);
    // Скачиваем через Electron main process
    window.electron.downloadAndInstall(update.download_url);
  };

  return (
    <div style={{
      background: "#1a56db",
      color: "white",
      padding: "10px 20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      fontSize: 14,
    }}>
      <span>
        Доступно обновление <strong>v{update.version}</strong> — {update.changelog}
      </span>
      <button
        onClick={handleInstall}
        disabled={downloading}
        style={{
          background: "white",
          color: "#1a56db",
          border: "none",
          borderRadius: 6,
          padding: "6px 16px",
          fontWeight: 600,
          cursor: downloading ? "wait" : "pointer",
        }}
      >
        {downloading ? "Скачивается..." : "Установить"}
      </button>
    </div>
  );
}
