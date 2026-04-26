import { useAuthStore } from '@/store/auth-store'

export const getAuthHeaders = (): Record<string, string> => {
  const token = useAuthStore.getState().token

  return token ? { Authorization: `Bearer ${token}` } : {}
}
