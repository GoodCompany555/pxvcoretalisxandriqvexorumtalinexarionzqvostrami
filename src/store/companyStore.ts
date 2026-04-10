import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface CompanyStore {
  companyName: string
  setCompanyName: (name: string) => void
}

export const useCompanyStore = create<CompanyStore>()(
  persist(
    (set) => ({
      companyName: 'Мой Магазин',
      setCompanyName: (name) => set({ companyName: name }),
    }),
    { name: 'company-settings' }
  )
)
