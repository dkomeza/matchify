import { Redirect } from 'expo-router'
import { LOGIN_ROUTE, useAuthStore } from '@/store/auth-store'

export default function Index() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading || (token && !user)) return null
  if (!token) return <Redirect href={LOGIN_ROUTE} />
  return <Redirect href="/(tabs)/home" />
}
