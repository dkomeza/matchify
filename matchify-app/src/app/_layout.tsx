import { DarkTheme, ThemeProvider } from '@react-navigation/native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { SplashScreen } from '@/components/splash-screen'

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
  }, [status, segments])

  if (status === 'loading') {
    return <SplashScreen />
  }

  return (
    <ThemeProvider value={DarkTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </ThemeProvider>
  )
}
