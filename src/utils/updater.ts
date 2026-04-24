const VERSION_URL = "https://elegant-licorice-8649f0.netlify.app/version.json";

export interface UpdateInfo {
  version: string;
  download_url: string;
  changelog: string;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(VERSION_URL, { cache: "no-store" });
    const data: UpdateInfo = await res.json();
    
    // Получаем реальную текущую версию из Electron
    const currentVersion = await window.electronAPI.getAppVersion();

    if (data.version > currentVersion) {
      return data; // есть обновление
    }
    return null; // всё актуально
  } catch {
    return null; // нет интернета — молча пропускаем
  }
}
