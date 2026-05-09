import { router, useLocalSearchParams, useNavigation } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Animated, FlatList, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useClient, useMutation, useQuery } from 'urql'

import { GlassView } from '@/components/glass-view'
import { GlassInput } from '@/components/ui/glass-input'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { TrackSearchRow, type TrackSearchRowTrack } from '@/components/track/track-search-row'
import { Colors, Radius, ScreenPadding, Spacing } from '@/constants/theme'
import { ADD_INITIAL_TRACKS_MUTATION, PLAYLIST_DETAIL_QUERY, PROPOSE_TRACK_MUTATION } from '@/lib/graphql/playlists'
import { SEARCH_TRACKS_QUERY } from '@/lib/graphql/search'

const SEARCH_LIMIT = 20
const MAX_SELECTED_TRACKS = 50

type SearchTracksData = {
  searchTracks: TrackSearchRowTrack[]
}

type AddInitialTracksData = {
  addInitialTracks: unknown[]
}

type ProposeTrackData = {
  proposeTrack: unknown
}

export default function SearchScreen() {
  const { id: playlistId, mode } = useLocalSearchParams<{ id?: string; mode?: string }>()
  const navigation = useNavigation()
  const client = useClient()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const actionBarProgress = useRef(new Animated.Value(0)).current
  const completingAddRef = useRef(false)

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
  const [{ fetching: addingTracks }, addInitialTracks] = useMutation<AddInitialTracksData>(ADD_INITIAL_TRACKS_MUTATION)
  const [{ fetching: proposingTrack }, proposeTrack] = useMutation<ProposeTrackData>(PROPOSE_TRACK_MUTATION)

  const tracks = data?.searchTracks ?? []
  const isProposeMode = mode === 'propose'
  const isSubmitting = addingTracks || proposingTrack
  const showInitialPrompt = trimmedQuery.length === 0
  const showSkeletons = fetching && !data && !showInitialPrompt
  const showNoResults = debouncedQuery.length > 0 && !fetching && !error && tracks.length === 0

  const selectedCount = selectedIds.size
  const selectedTrackIds = useMemo(() => Array.from(selectedIds), [selectedIds])
  const selectionOrder = useMemo(() => {
    const order = new Map<string, number>()

    selectedTrackIds.forEach((id, index) => {
      order.set(id, index + 1)
    })

    return order
  }, [selectedTrackIds])
  const addButtonLabel = isProposeMode
    ? 'Propose track'
    : `Add ${selectedCount} ${selectedCount === 1 ? 'track' : 'tracks'}`

  const toggleTrack = useCallback((track: TrackSearchRowTrack) => {
    setSelectedIds((current) => {
      const next = new Set(current)

      if (next.has(track.spotifyTrackId)) {
        next.delete(track.spotifyTrackId)
      } else {
        if (next.size >= (isProposeMode ? 1 : MAX_SELECTED_TRACKS)) {
          return current
        }

        if (isProposeMode) {
          next.clear()
        }

        next.add(track.spotifyTrackId)
      }

      return next
    })
  }, [isProposeMode])

  const confirmAddTracks = useCallback(async () => {
    if (!playlistId || selectedTrackIds.length === 0 || isSubmitting) return

    const result = isProposeMode
      ? await proposeTrack({
          playlistId,
          spotifyTrackId: selectedTrackIds[0],
        })
      : await addInitialTracks({
          playlistId,
          spotifyTrackIds: selectedTrackIds,
        })

    if (result.error) {
      Alert.alert(
        isProposeMode ? 'Track could not be proposed' : 'Tracks could not be added',
        'Check your connection and try again.',
      )
      return
    }

    await client.query(PLAYLIST_DETAIL_QUERY, { id: playlistId }, { requestPolicy: 'network-only' }).toPromise()
    completingAddRef.current = true
    setSelectedIds(new Set())
    router.back()
  }, [addInitialTracks, client, isProposeMode, isSubmitting, playlistId, proposeTrack, selectedTrackIds])

  useEffect(() => {
    Animated.spring(actionBarProgress, {
      toValue: playlistId && selectedCount > 0 ? 1 : 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
    }).start()
  }, [actionBarProgress, playlistId, selectedCount])

  useEffect(() => {
    return navigation.addListener('beforeRemove', (event) => {
      if (selectedIds.size === 0 || completingAddRef.current) return

      event.preventDefault()

      Alert.alert('Discard selected tracks?', 'Your selected tracks will not be added to this playlist.', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            setSelectedIds(new Set())
            navigation.dispatch(event.data.action)
          },
        },
      ])
    })
  }, [navigation, selectedIds])

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
              <TrackSearchRow
                track={item}
                selected={selectedIds.has(item.spotifyTrackId)}
                selectionIndex={selectionOrder.get(item.spotifyTrackId)}
                onToggle={toggleTrack}
              />
            )}
            contentContainerStyle={listContentStyle}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              showInitialPrompt ? <SearchPrompt isProposeMode={isProposeMode} /> : showNoResults ? <NoResults /> : error ? <SearchError /> : null
            }
          />
        )}

        {playlistId && selectedCount > 0 ? (
          <Animated.View
            pointerEvents={selectedCount > 0 ? 'auto' : 'none'}
            style={[
              styles.addBar,
              {
                opacity: actionBarProgress,
                transform: [
                  {
                    translateY: actionBarProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [28, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting || selectedCount === 0}
              onPress={confirmAddTracks}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed, isSubmitting && styles.addButtonDisabled]}
            >
              <GlassView glassEffectStyle="clear" colorScheme="dark" style={styles.addPill}>
                <ThemedText type="smallBold" style={styles.addLabel}>
                  {isSubmitting ? (isProposeMode ? 'Proposing...' : 'Adding...') : addButtonLabel}
                </ThemedText>
              </GlassView>
            </Pressable>
          </Animated.View>
        ) : null}
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

function SearchPrompt({ isProposeMode }: { isProposeMode: boolean }) {
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
        {isProposeMode
          ? 'Find one song to propose for voting.'
          : 'Find songs to seed your next playlist proposal.'}
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
  addBar: {
    position: 'absolute',
    left: ScreenPadding,
    right: ScreenPadding,
    bottom: 96,
    alignItems: 'center',
  },
  addButton: {
    borderRadius: Radius.full,
  },
  addButtonDisabled: {
    opacity: 0.72,
  },
  addPill: {
    minHeight: 54,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glassHighlight,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: Colors.brandGlow,
    boxShadow: `0 16px 36px ${Colors.brandGlow}`,
  },
  addLabel: {
    color: Colors.text,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
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
