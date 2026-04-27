import { create } from 'zustand';

interface LicenseState {
  isActive: boolean;
  isChecking: boolean;
  hwid: string;
  error: string | null;
  checkLicense: () => Promise<boolean>;
  activate: (key: string) => Promise<{ success: boolean; message?: string }>;
}

export const useLicenseStore = create<LicenseState>((set) => ({
  isActive: false, // Изначально предполагаем что нет лицензии до окончания проверки
  isChecking: true,
  hwid: '',
  error: null,

  checkLicense: async () => {
    set({ isChecking: true, error: null });
    try {
      if (!window.electronAPI?.license) {
        set({ isChecking: false, error: 'API недоступен' });
        return false;
      }

      const res = await window.electronAPI.license.check();
      const hwid = await window.electronAPI.license.getHWID();

      set({
        isActive: res.valid,
        hwid,
        isChecking: false,
        error: res.valid ? null : (res.reason || 'Лицензия не найдена')
      });

      return res.valid;
    } catch (e) {
      set({ isChecking: false, error: 'Ошибка проверки лицензии', isActive: false });
      return false;
    }
  },

  activate: async (key: string) => {
    set({ isChecking: true });
    try {
      const res = await window.electronAPI.license.activate(key);
      if (res.success) {
        set({ isActive: true, isChecking: false, error: null });
        return { success: true };
      }
      set({ isChecking: false, error: res.message || 'Ошибка активации' });
      return { success: false, message: res.message };
    } catch (e: any) {
      set({ isChecking: false, error: 'Ошибка системы' });
      return { success: false, message: 'Сбой активации' };
    }
  }
}));
