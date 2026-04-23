import { create } from 'zustand';

interface SettingsState {
  companyName: string;
  bin: string;
  address: string;
  ofdProvider: 'webkassa' | 'mock' | 'none';
  ofdLogin: string;
  ofdPassword: string;
  ofdCashboxId: string;
  showFiscalBadge: boolean;

  // VAT and Accounting Policy
  isVatPayer: boolean;
  vatCertificateSeries: string;
  vatCertificateNumber: string;
  vatRegisteredAt: string | null;
  vatCertificateIssuedAt: string | null;
  taxRegime: 'СНР' | 'ОУР';
  isKpnPayer: boolean;
  isExcisePayer: boolean;
  accountingPolicyStartDate: string | null;

  setCompanyDetails: (details: Partial<SettingsState>) => void;
  setOfdCredentials: (credentials: Partial<SettingsState>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  companyName: 'EasyKassa',
  bin: '',
  address: '',
  ofdProvider: 'none',
  ofdLogin: '',
  ofdPassword: '',
  ofdCashboxId: '',
  showFiscalBadge: true,

  isVatPayer: false,
  vatCertificateSeries: '',
  vatCertificateNumber: '',
  vatRegisteredAt: null,
  vatCertificateIssuedAt: null,
  taxRegime: 'СНР',
  isKpnPayer: false,
  isExcisePayer: false,
  accountingPolicyStartDate: null,

  setCompanyDetails: (details) => set((state) => ({ ...state, ...details })),
  setOfdCredentials: (credentials) => set((state) => ({ ...state, ...credentials })),
}));
