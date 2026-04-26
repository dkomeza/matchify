import '@/global.css'

import { DarkTheme, ThemeProvider } from '@react-navigation/native'
import { Provider } from 'urql'
import { AuthGate } from '@/components/auth-gate'
import { urqlClient } from '@/lib/urql'

export default function RootLayout() {
  return (
    <Provider value={urqlClient}>
      <ThemeProvider value={DarkTheme}>
        <AuthGate />
      </ThemeProvider>
    </Provider>
  )
}
