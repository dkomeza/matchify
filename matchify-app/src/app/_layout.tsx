import '@/global.css'

import { DarkTheme, ThemeProvider } from '@react-navigation/native'
import { Provider } from 'urql'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { AuthGate } from '@/components/auth-gate'
import { urqlClient } from '@/lib/urql'

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Provider value={urqlClient}>
        <ThemeProvider value={DarkTheme}>
          <AuthGate />
        </ThemeProvider>
      </Provider>
    </GestureHandlerRootView>
  )
}
