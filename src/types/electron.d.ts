interface Window {
  electron: {
    downloadAndInstall: (url: string) => Promise<void>;
  };
}
