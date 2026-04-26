import { useLocalSearchParams } from 'expo-router'
import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors, ScreenPadding, Spacing } from '@/constants/theme'

export default function PlaylistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="title">Playlist</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {id}
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    padding: ScreenPadding,
    gap: Spacing.two,
  },
})
