import '@/global.css'

import { DarkTheme, ThemeProvider } from '@react-navigation/native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { Provider } from 'urql'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { SplashScreen } from '@/components/splash-screen'
import { urqlClient } from '@/lib/urql'

export default function RootLayout() {
  const status = useAuthStore((s) => s.status)
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    if (status === 'loading') return

    const onWelcome = segments[0] === 'welcome'

    if (status === 'unauthenticated' && !onWelcome) {
      router.replace('/welcome')
    } else if (status === 'authenticated' && onWelcome) {
      router.replace('/')
    }
  }, [status, segments, router])

  if (status === 'loading') {
    return <SplashScreen />
  }

  return (
    <Provider value={urqlClient}>
      <ThemeProvider value={DarkTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="welcome" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </ThemeProvider>
    </Provider>
  )
}
