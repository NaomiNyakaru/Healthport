import { create } from 'zustand'
import { tokenStorage } from '../api/client'
import type { User, AuthTokens } from '../types'

interface AuthState {
  user:            User | null
  tokens:          AuthTokens | null
  isAuthenticated: boolean
  isLoading:       boolean
  login:      (user: User, tokens: AuthTokens) => void
  logout:     () => void
  updateUser: (user: Partial<User>) => void
  initialize: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user:            null,
  tokens:          null,
  isAuthenticated: false,
  isLoading:       true,

  login: (user, tokens) => {
    tokenStorage.setTokens(tokens.access, tokens.refresh)
    // Save role so the router guards can read it without Zustand
    localStorage.setItem('hp_role', user.role)
    set({ user, tokens, isAuthenticated: true, isLoading: false })
  },

  logout: () => {
    tokenStorage.clearTokens()
    localStorage.removeItem('hp_role')
    set({ user: null, tokens: null, isAuthenticated: false, isLoading: false })
  },

  updateUser: (updated) => {
    const current = get().user
    if (!current) return
    set({ user: { ...current, ...updated } })
  },

  initialize: async () => {
    const accessToken = tokenStorage.getAccess()
    if (!accessToken) {
      set({ isLoading: false })
      return
    }
    try {
      const { apiClient } = await import('../api/client')
      const { data } = await apiClient.get<User>('/auth/me/')
      localStorage.setItem('hp_role', data.role)
      set({
        user:            data,
        tokens: {
          access:  tokenStorage.getAccess() || '',
          refresh: tokenStorage.getRefresh() || '',
        },
        isAuthenticated: true,
        isLoading:       false,
      })
    } catch {
      tokenStorage.clearTokens()
      localStorage.removeItem('hp_role')
      set({ user: null, tokens: null, isAuthenticated: false, isLoading: false })
    }
  },
}))

export const useUser            = () => useAuthStore((s) => s.user)
export const useIsAuthenticated = () => useAuthStore((s) => s.isAuthenticated)
export const useIsDoctor        = () => useAuthStore((s) => s.user?.role === 'doctor')
export const useIsPatient       = () => useAuthStore((s) => s.user?.role === 'patient')
export const useAuthLoading     = () => useAuthStore((s) => s.isLoading)
