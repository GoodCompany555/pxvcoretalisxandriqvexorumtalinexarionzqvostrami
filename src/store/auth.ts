import { create } from 'zustand'
import type { User, Company } from '../vite-env'

interface AuthState {
  user: User | null;
  company: Company | null;
  isAuthenticated: boolean;
  setAuth: (user: User, company: Company) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  (set) => ({
    user: null,
    company: null,
    isAuthenticated: false,
    setAuth: (user, company) => set({ user, company, isAuthenticated: true }),
    logout: () => set({ user: null, company: null, isAuthenticated: false }),
  })
)

