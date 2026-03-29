import { Redirect } from 'expo-router'
import { useAuthStore } from '@/store/auth-store'

export default function Index() {
  const status = useAuthStore((s) => s.status)
  if (status === 'loading') return null
  if (status === 'unauthenticated') return <Redirect href="/welcome" />
  return <Redirect href="/(tabs)/vote" />
}
