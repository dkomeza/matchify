import { SplashScreen } from '@/components/splash-screen'
import { LOGIN_ROUTE, useAuthStore, type User } from '@/store/auth-store'
import { Redirect, Stack, useSegments, type Href } from 'expo-router'
import { useEffect } from 'react'
import { gql, useQuery } from 'urql'

const ME_QUERY = gql`
  query Me {
    me {
      id
      displayName
      profileImageUrl
    }
  }
`

interface MeData {
  me: {
    id: string
    displayName: string
    profileImageUrl: string | null
  }
}

const toUser = (me: MeData['me']): User => ({
  id: String(me.id),
  displayName: me.displayName,
  imageUrl: me.profileImageUrl,
})

const TABS_ROUTE = '/(tabs)/home' as Href

export function AuthGate() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const isLoading = useAuthStore((s) => s.isLoading)
  const initialize = useAuthStore((s) => s.initialize)
  const hydrateUser = useAuthStore((s) => s.hydrateUser)
  const logout = useAuthStore((s) => s.logout)
  const segments = useSegments()
  const rootSegment = String(segments[0] ?? '')
  const inAuthGroup = rootSegment === '(auth)' || rootSegment === 'welcome'

  const [{ data, error }] = useQuery<MeData>({
    query: ME_QUERY,
    pause: !token || !!user,
  })

  useEffect(() => {
    void initialize()
  }, [initialize])

  useEffect(() => {
    if (data?.me) {
      hydrateUser(toUser(data.me))
    }
  }, [data, hydrateUser])

  useEffect(() => {
    if (error) {
      logout()
    }
  }, [error, logout])

  if (isLoading || (token && !user)) {
    return <SplashScreen />
  }

  if (!token && !inAuthGroup) {
    return <Redirect href={LOGIN_ROUTE} />
  }

  if (token && user && inAuthGroup) {
    return <Redirect href={TABS_ROUTE} />
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="welcome" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  )
}
