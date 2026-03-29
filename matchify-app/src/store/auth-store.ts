import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as SecureStore from 'expo-secure-store'

const secureStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) => SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
}

export interface SpotifyUser {
  id: string
  displayName: string
  imageUrl: string | null
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthState {
  status: AuthStatus
  accessToken: string | null
  refreshToken: string | null
  expiresAt: number | null
  user: SpotifyUser | null
}

interface AuthActions {
  setSession: (
    accessToken: string,
    refreshToken: string,
    expiresAt: number,
    user: SpotifyUser
  ) => void
  logout: () => void
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      status: 'loading',
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      user: null,
      setSession: (accessToken, refreshToken, expiresAt, user) =>
        set({ status: 'authenticated', accessToken, refreshToken, expiresAt, user }),
      logout: () =>
        set({
          status: 'unauthenticated',
          accessToken: null,
          refreshToken: null,
          expiresAt: null,
          user: null,
        }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => secureStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.status = state.accessToken ? 'authenticated' : 'unauthenticated'
        }
      },
    }
  )
)
