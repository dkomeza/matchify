import * as SecureStore from 'expo-secure-store'
import { router, type Href } from 'expo-router'
import { create } from 'zustand'

export const JWT_KEY = 'jwt'
export const LOGIN_ROUTE = '/(auth)/login' as Href

export interface User {
  id: string
  displayName: string
  imageUrl: string | null
}

export type SpotifyUser = User

export interface AuthState {
  token: string | null
  user: User | null
  isLoading: boolean
  login: (token: string, user: User) => void
  logout: () => void
}

interface AuthActions {
  initialize: () => Promise<void>
  hydrateUser: (user: User) => void
}

export const useAuthStore = create<AuthState & AuthActions>()((set, get) => ({
  token: null,
  user: null,
  isLoading: true,
  login: (token, user) => {
    void SecureStore.setItemAsync(JWT_KEY, token)
    set({ token, user, isLoading: false })
  },
  logout: () => {
    void SecureStore.deleteItemAsync(JWT_KEY)
    set({ token: null, user: null, isLoading: false })
    router.replace(LOGIN_ROUTE)
  },
  initialize: async () => {
    set({ isLoading: true })

    try {
      const token = await SecureStore.getItemAsync(JWT_KEY)
      set({ token, user: null, isLoading: false })
    } catch {
      get().logout()
    }
  },
  hydrateUser: (user) => {
    set((state) => ({
      user,
      isLoading: false,
      token: state.token,
    }))
  },
}))
