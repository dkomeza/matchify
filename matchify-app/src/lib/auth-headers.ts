import { useAuthStore } from '@/store/auth-store'

export const getAuthHeaders = (): Record<string, string> => {
  const token = useAuthStore.getState().accessToken

  return token ? { Authorization: `Bearer ${token}` } : {}
}
