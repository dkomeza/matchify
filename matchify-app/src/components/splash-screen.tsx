import { StyleSheet, View } from 'react-native'
import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'

export function SplashScreen() {
  return (
    <View style={styles.container}>
      <ThemedText style={styles.logoMark} themeColor="brand">
        ✦
      </ThemedText>
      <ThemedText type="smallBold" style={styles.wordmark}>
        matchify
      </ThemedText>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoMark: { fontSize: 32, lineHeight: 38 },
  wordmark: { fontSize: 20, letterSpacing: 0.5, color: Colors.text },
})
