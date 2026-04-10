import { create } from 'zustand';

interface SettingsState {
  companyName: string;
  bin: string;
  address: string;
  ofdProvider: 'webkassa' | 'mock' | 'none';
  ofdApiKey: string;
  ofdLogin: string;
  ofdPassword: string;
  ofdCashboxId: string;
  showFiscalBadge: boolean;
  setCompanyDetails: (details: Partial<SettingsState>) => void;
  setOfdCredentials: (credentials: Partial<SettingsState>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  companyName: 'EasyKassa',
  bin: '',
  address: '',
  ofdProvider: 'none',
  ofdApiKey: '',
  ofdLogin: '',
  ofdPassword: '',
  ofdCashboxId: '',
  showFiscalBadge: true,
  setCompanyDetails: (details) => set((state) => ({ ...state, ...details })),
  setOfdCredentials: (credentials) => set((state) => ({ ...state, ...credentials })),
}));
