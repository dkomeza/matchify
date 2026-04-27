import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from 'urql'

import { GlassInput } from '@/components/ui/glass-input'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { TrackSearchRow, type TrackSearchRowTrack } from '@/components/track/track-search-row'
import { Colors, Radius, ScreenPadding, Spacing } from '@/constants/theme'
import { SEARCH_TRACKS_QUERY } from '@/lib/graphql/search'

const SEARCH_LIMIT = 20

type SearchTracksData = {
  searchTracks: TrackSearchRowTrack[]
}

export default function SearchScreen() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const trimmedQuery = query.trim()

  const scheduleDebouncedQuery = useCallback((nextQuery: string) => {
    return setTimeout(() => {
      setDebouncedQuery(nextQuery.trim())
    }, 300)
  }, [])

  useEffect(() => {
    const timeoutId = scheduleDebouncedQuery(query)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [query, scheduleDebouncedQuery])

  const [{ data, fetching, error }] = useQuery<SearchTracksData>({
    query: SEARCH_TRACKS_QUERY,
    variables: { query: debouncedQuery, limit: SEARCH_LIMIT },
    pause: debouncedQuery.length === 0,
  })

  const tracks = data?.searchTracks ?? []
  const showInitialPrompt = trimmedQuery.length === 0
  const showSkeletons = fetching && !data && !showInitialPrompt
  const showNoResults = debouncedQuery.length > 0 && !fetching && !error && tracks.length === 0

  const selectedCount = selectedIds.size

  const toggleTrack = useCallback((track: TrackSearchRowTrack) => {
    setSelectedIds((current) => {
      const next = new Set(current)

      if (next.has(track.spotifyTrackId)) {
        next.delete(track.spotifyTrackId)
      } else {
        next.add(track.spotifyTrackId)
      }

      return next
    })
  }, [])

  const listContentStyle = useMemo(
    () => [styles.listContent, (showInitialPrompt || showNoResults || error) && styles.stateListContent],
    [error, showInitialPrompt, showNoResults],
  )

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.searchBar}>
          <GlassInput
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={setQuery}
            placeholder="Search tracks"
            returnKeyType="search"
            testID="track-search-input"
            value={query}
          />
          {selectedCount > 0 ? (
            <ThemedText type="micro" themeColor="textSecondary" style={styles.selectionCount}>
              {selectedCount} selected
            </ThemedText>
          ) : null}
        </View>

        {showSkeletons ? (
          <View style={styles.skeletonList}>
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <TrackSearchSkeleton key={item} />
            ))}
          </View>
        ) : (
          <FlatList
            testID="track-search-list"
            data={tracks}
            keyExtractor={(item) => item.spotifyTrackId}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TrackSearchRow track={item} selected={selectedIds.has(item.spotifyTrackId)} onToggle={toggleTrack} />
            )}
            contentContainerStyle={listContentStyle}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              showInitialPrompt ? <SearchPrompt /> : showNoResults ? <NoResults /> : error ? <SearchError /> : null
            }
          />
        )}
      </SafeAreaView>
    </ThemedView>
  )
}

function TrackSearchSkeleton() {
  return (
    <View testID="track-search-skeleton" style={styles.skeletonRow}>
      <View style={styles.skeletonArt} />
      <View style={styles.skeletonText}>
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonMeta} />
      </View>
      <View style={styles.skeletonDuration} />
    </View>
  )
}

function SearchPrompt() {
  return (
    <View style={styles.centerState}>
      <View style={styles.promptIllustration}>
        <View style={styles.promptDisc}>
          <View style={styles.promptDiscHole} />
        </View>
        <View style={styles.promptNeedle} />
      </View>
      <ThemedText type="subtitle" style={styles.centerTitle}>
        Search for tracks
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centerCopy}>
        Find songs to seed your next playlist proposal.
      </ThemedText>
    </View>
  )
}

function NoResults() {
  return (
    <View style={styles.centerState}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centerCopy}>
        No tracks found
      </ThemedText>
    </View>
  )
}

function SearchError() {
  return (
    <View style={styles.centerState}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centerCopy}>
        Search is unavailable. Try again in a moment.
      </ThemedText>
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
  searchBar: {
    paddingTop: Spacing.three,
    paddingHorizontal: ScreenPadding,
    paddingBottom: Spacing.three,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glassBorder,
    gap: Spacing.two,
    zIndex: 1,
  },
  selectionCount: {
    paddingHorizontal: Spacing.one,
  },
  listContent: {
    paddingHorizontal: ScreenPadding,
    paddingBottom: 124,
  },
  stateListContent: {
    flexGrow: 1,
  },
  separator: {
    height: Spacing.two,
  },
  skeletonList: {
    paddingHorizontal: ScreenPadding,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  skeletonRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  skeletonArt: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    backgroundColor: Colors.glassRaised,
  },
  skeletonText: {
    flex: 1,
    gap: Spacing.two,
  },
  skeletonTitle: {
    width: '72%',
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: Colors.glassRaised,
  },
  skeletonMeta: {
    width: '48%',
    height: 12,
    borderRadius: Radius.full,
    backgroundColor: Colors.glass,
  },
  skeletonDuration: {
    width: 40,
    height: 18,
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
  promptIllustration: {
    width: 120,
    height: 104,
    marginBottom: Spacing.one,
  },
  promptDisc: {
    position: 'absolute',
    left: 8,
    top: 8,
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: Colors.glassRaised,
  },
  promptDiscHole: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: Colors.background,
  },
  promptNeedle: {
    position: 'absolute',
    right: 16,
    top: 14,
    width: 8,
    height: 76,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
    transform: [{ rotate: '28deg' }],
  },
})
