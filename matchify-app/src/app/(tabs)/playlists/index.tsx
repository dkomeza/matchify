import { router } from 'expo-router'
import { FlatList, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from 'urql'

import { GlassView } from '@/components/glass-view'
import { PlaylistCard, type PlaylistCardPlaylist } from '@/components/playlist/playlist-card'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors, Radius, ScreenPadding, Spacing } from '@/constants/theme'
import { MY_PLAYLISTS_QUERY } from '@/lib/graphql/playlists'

type MyPlaylistsData = {
  myPlaylists: PlaylistCardPlaylist[]
}

export default function PlaylistsScreen() {
  const [{ data, fetching, error }, executeQuery] = useQuery<MyPlaylistsData>({
    query: MY_PLAYLISTS_QUERY,
  })

  const playlists = data?.myPlaylists ?? []
  const isInitialLoading = fetching && !data

  const refresh = () => {
    void executeQuery({ requestPolicy: 'network-only' })
  }

  const openPlaylist = (id: string) => {
    router.push(`/playlists/${id}`)
  }

  const openCreate = () => {
    router.push('/playlists/create')
  }

  const openJoin = () => {
    router.push('/playlists/join')
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            Playlists
          </ThemedText>
          <Pressable accessibilityRole="button" onPress={openJoin} style={({ pressed }) => [styles.joinButton, pressed && styles.pressed]}>
            <GlassView glassEffectStyle="clear" colorScheme="dark" style={styles.joinPill}>
              <ThemedText type="smallBold">Join</ThemedText>
            </GlassView>
          </Pressable>
        </View>

        {isInitialLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState onRetry={refresh} />
        ) : (
          <FlatList
            testID="playlists-list"
            data={playlists}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <PlaylistCard playlist={item} onPress={() => openPlaylist(item.id)} />}
            contentContainerStyle={[styles.listContent, playlists.length === 0 && styles.emptyListContent]}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={<EmptyState />}
            refreshing={fetching}
            onRefresh={refresh}
          />
        )}

        <Pressable accessibilityRole="button" onPress={openCreate} style={({ pressed }) => [styles.fab, pressed && styles.pressed]}>
          <ThemedText type="title" style={styles.fabIcon}>
            +
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  )
}

function LoadingState() {
  return (
    <View style={styles.loadingWrap}>
      {[0, 1, 2].map((item) => (
        <GlassView key={item} glassEffectStyle="regular" colorScheme="dark" style={styles.skeletonCard}>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonMeta} />
        </GlassView>
      ))}
    </View>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.centerState}>
      <ThemedText type="subtitle" style={styles.centerTitle}>
        Playlists could not load
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centerCopy}>
        Check your connection and try again.
      </ThemedText>
      <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => pressed && styles.pressed}>
        <GlassView glassEffectStyle="clear" colorScheme="dark" style={styles.ctaPill}>
          <ThemedText type="smallBold">Retry</ThemedText>
        </GlassView>
      </Pressable>
    </View>
  )
}

function EmptyState() {
  return (
    <View style={styles.centerState}>
      <View style={styles.emptyIllustration}>
        <View style={[styles.emptyDisc, styles.emptyDiscBack]} />
        <View style={[styles.emptyDisc, styles.emptyDiscFront]}>
          <View style={styles.emptyDiscHole} />
        </View>
      </View>
      <ThemedText type="subtitle" style={styles.centerTitle}>
        No playlists yet
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centerCopy}>
        Join an invite to start voting with your group.
      </ThemedText>
      <Pressable accessibilityRole="button" onPress={() => router.push('/playlists/join')} style={({ pressed }) => pressed && styles.pressed}>
        <GlassView glassEffectStyle="clear" colorScheme="dark" style={styles.ctaPill}>
          <ThemedText type="smallBold">Join with invite</ThemedText>
        </GlassView>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingTop: Spacing.three,
    paddingHorizontal: ScreenPadding,
    paddingBottom: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  title: {
    flex: 1,
  },
  joinButton: {
    borderRadius: Radius.full,
  },
  joinPill: {
    height: 44,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  listContent: {
    paddingHorizontal: ScreenPadding,
    paddingBottom: 124,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  separator: {
    height: Spacing.three,
  },
  loadingWrap: {
    paddingHorizontal: ScreenPadding,
    gap: Spacing.three,
  },
  skeletonCard: {
    height: 96,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: Spacing.four,
    justifyContent: 'center',
    overflow: 'hidden',
    gap: Spacing.two,
  },
  skeletonTitle: {
    width: '58%',
    height: 22,
    borderRadius: Radius.full,
    backgroundColor: Colors.glassRaised,
  },
  skeletonMeta: {
    width: '44%',
    height: 14,
    borderRadius: Radius.full,
    backgroundColor: Colors.glass,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: ScreenPadding,
    paddingBottom: 96,
    gap: Spacing.three,
  },
  centerTitle: {
    textAlign: 'center',
    fontSize: 28,
    lineHeight: 34,
  },
  centerCopy: {
    textAlign: 'center',
    maxWidth: 280,
  },
  emptyIllustration: {
    width: 132,
    height: 108,
    marginBottom: Spacing.one,
  },
  emptyDisc: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  emptyDiscBack: {
    left: 8,
    top: 10,
    backgroundColor: Colors.glass,
  },
  emptyDiscFront: {
    right: 8,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandGlow,
    shadowColor: Colors.brand,
    shadowOpacity: 0.45,
    shadowRadius: 24,
  },
  emptyDiscHole: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  ctaPill: {
    minHeight: 48,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fab: {
    position: 'absolute',
    right: ScreenPadding,
    bottom: Spacing.five,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brand,
    shadowColor: Colors.brand,
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  fabIcon: {
    lineHeight: 58,
  },
  pressed: {
    opacity: 0.78,
  },
})
