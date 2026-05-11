import { useLocalSearchParams } from 'expo-router'
import { SymbolView } from 'expo-symbols'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { useClient, useMutation, useQuery, useSubscription } from 'urql'

import { GlassView } from '@/components/glass-view'
import { ThemedText } from '@/components/themed-text'
import { BackButton } from '@/components/ui/back-button'
import { ActionButton } from '@/components/vote/ActionButton'
import { VoteCard, type VoteCardTrack } from '@/components/vote/VoteCard'
import { Blur, Colors, Motion, Radius, ScreenPadding, Spacing } from '@/constants/theme'
import {
  NEW_PROPOSAL_SUBSCRIPTION,
  NEXT_RECOMMENDATION_QUERY,
  NEXT_PROPOSAL_QUERY,
  RESPOND_TO_RECOMMENDATION_MUTATION,
  VOTE_ON_TRACK_MUTATION,
} from '@/lib/graphql/vote'
import { useSubscriptionConnectionStatus } from '@/lib/subscription-status'

type VoteType = 'LIKE' | 'SKIP'
type RecommendationAction = 'ACCEPT' | 'REJECT'

type NextProposalData = {
  nextProposal: VoteCardTrack | null
}

type VoteOnTrackData = {
  voteOnTrack: {
    id: string
    status: string
    likeCount: number
  }
}

type RecommendationTrack = {
  spotifyTrackId: string
  title: string
  artist: string
  album?: string | null
  albumArtUrl?: string | null
  previewUrl?: string | null
  durationMs: number
}

type NextRecommendationData = {
  nextRecommendation: RecommendationTrack | null
}

type NextRecommendationVariables = {
  playlistId?: string
  excludedSpotifyTrackIds?: string[]
}

type RespondToRecommendationData = {
  respondToRecommendation: {
    id: string
    status: string
    likeCount: number
  } | null
}

type NewProposalData = {
  newProposal?: VoteCardTrack | null
}

const EXIT_OVERSHOOT = 120

const firstParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0]

  return value
}

const toVoteCardTrack = (recommendation: RecommendationTrack): VoteCardTrack => ({
  id: recommendation.spotifyTrackId,
  title: recommendation.title,
  artist: recommendation.artist,
  album: recommendation.album,
  albumArtUrl: recommendation.albumArtUrl,
  durationMs: recommendation.durationMs,
})

export default function VoteScreen() {
  const { id: playlistIdParam, playlistName: playlistNameParam } = useLocalSearchParams<{
    id?: string | string[]
    playlistName?: string | string[]
  }>()
  const playlistId = firstParam(playlistIdParam)
  const playlistName = firstParam(playlistNameParam) ?? 'Vote'
  const { width } = useWindowDimensions()
  const client = useClient()
  const [votingTrackId, setVotingTrackId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [hasNewProposalBadge, setHasNewProposalBadge] = useState(false)
  const [recommendationQueue, setRecommendationQueue] = useState<VoteCardTrack[]>([])
  const voteInFlightRef = useRef(false)
  const recommendationPrefetchRef = useRef(false)
  const consumedRecommendationIdsRef = useRef<Set<string>>(new Set())
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const subscriptionStatus = useSubscriptionConnectionStatus()
  const cardTranslateX = useSharedValue(width + EXIT_OVERSHOOT)
  const cardOpacity = useSharedValue(0)

  const [{ data, fetching, error }, executeQuery] = useQuery<NextProposalData>({
    query: NEXT_PROPOSAL_QUERY,
    variables: { playlistId },
    pause: !playlistId,
  })
  const [, voteOnTrack] = useMutation<VoteOnTrackData, { trackId: string; vote: VoteType }>(VOTE_ON_TRACK_MUTATION)
  const track = data?.nextProposal ?? null
  const [{ data: recommendationData, fetching: fetchingRecommendation, error: recommendationError }, executeRecommendationQuery] =
    useQuery<NextRecommendationData>({
      query: NEXT_RECOMMENDATION_QUERY,
      variables: { playlistId, excludedSpotifyTrackIds: [] },
      pause: !playlistId || fetching || Boolean(track),
    })
  const [, respondToRecommendation] = useMutation<
    RespondToRecommendationData,
    { playlistId: string; spotifyTrackId: string; action: RecommendationAction }
  >(RESPOND_TO_RECOMMENDATION_MUTATION)
  const recommendationTrack = recommendationQueue[0] ?? null
  const activeTrack = track ?? recommendationTrack
  const isDiscoveryMode = !track && Boolean(recommendationTrack)

  useSubscription<NewProposalData, NewProposalData | undefined, { playlistId?: string }>(
    {
      query: NEW_PROPOSAL_SUBSCRIPTION,
      variables: { playlistId },
      pause: !playlistId,
    },
    (_previous, event) => {
      if (event?.newProposal) {
        setHasNewProposalBadge(true)

        if (!track) {
          void executeQuery({ requestPolicy: 'network-only' })
        }
      }

      return event
    },
  )

  const trackId = activeTrack?.id
  const isInitialLoading = (fetching && !data) || (!track && fetchingRecommendation && !recommendationData)
  const isVoting = Boolean(votingTrackId)
  const exitDistance = width + EXIT_OVERSHOOT
  const activeError = error ?? (!track ? recommendationError : undefined)

  useEffect(() => {
    setRecommendationQueue([])
    consumedRecommendationIdsRef.current = new Set()
  }, [playlistId])

  useEffect(() => {
    const recommendation = recommendationData?.nextRecommendation

    if (!recommendation) return

    const nextTrack = toVoteCardTrack(recommendation)
    setRecommendationQueue((currentQueue) => {
      if (
        consumedRecommendationIdsRef.current.has(nextTrack.id) ||
        currentQueue.some((queuedTrack) => queuedTrack.id === nextTrack.id)
      ) {
        return currentQueue
      }

      return [...currentQueue, nextTrack]
    })
  }, [recommendationData?.nextRecommendation])

  const recommendationExclusions = useCallback(
    (queuedTracks: VoteCardTrack[] = recommendationQueue) =>
      Array.from(new Set([...Array.from(consumedRecommendationIdsRef.current), ...queuedTracks.map((queuedTrack) => queuedTrack.id)])),
    [recommendationQueue],
  )

  const prefetchRecommendation = useCallback(
    async (excludeIds: string[]) => {
      if (!playlistId || recommendationPrefetchRef.current) return

      recommendationPrefetchRef.current = true
      const result = await client
        .query<NextRecommendationData, NextRecommendationVariables>(
          NEXT_RECOMMENDATION_QUERY,
          { playlistId, excludedSpotifyTrackIds: excludeIds },
          { requestPolicy: 'network-only' },
        )
        .toPromise()
        .finally(() => {
          recommendationPrefetchRef.current = false
        })

      const recommendation = result.data?.nextRecommendation

      if (!recommendation || result.error) return

      const nextTrack = toVoteCardTrack(recommendation)
      setRecommendationQueue((currentQueue) => {
        if (
          consumedRecommendationIdsRef.current.has(nextTrack.id) ||
          currentQueue.some((queuedTrack) => queuedTrack.id === nextTrack.id)
        ) {
          return currentQueue
        }

        return [...currentQueue, nextTrack]
      })
    },
    [client, playlistId],
  )

  useEffect(() => {
    if (track || fetchingRecommendation || recommendationQueue.length !== 1) return

    void prefetchRecommendation(recommendationExclusions())
  }, [fetchingRecommendation, prefetchRecommendation, recommendationExclusions, recommendationQueue, track])

  useEffect(() => {
    if (!trackId) return

    cardTranslateX.value = exitDistance
    cardOpacity.value = 0
    cardTranslateX.value = withSpring(0, Motion.spring)
    cardOpacity.value = withSpring(1, Motion.spring)
  }, [cardOpacity, cardTranslateX, exitDistance, trackId])

  useEffect(
    () => () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current)
      }
    },
    [],
  )

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateX: cardTranslateX.value }],
  }))

  const recoverCard = () => {
    cardOpacity.value = withSpring(1, Motion.spring)
    cardTranslateX.value = withSpring(0, Motion.spring)
  }

  const recoverFromVoteError = (message: string) => {
    voteInFlightRef.current = false
    setVotingTrackId(null)
    recoverCard()
    setToastMessage(message)

    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
    }

    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null)
      toastTimeoutRef.current = null
    }, 2600)
  }

  const refreshNextProposal = () => {
    setHasNewProposalBadge(false)
    void executeQuery({ requestPolicy: 'network-only' })
  }

  const refreshNextRecommendation = () => {
    setRecommendationQueue([])
    consumedRecommendationIdsRef.current = new Set()
    void executeRecommendationQuery({ requestPolicy: 'network-only' })
  }

  const retryActiveQueue = () => {
    if (track || error) {
      refreshNextProposal()
      return
    }

    refreshNextRecommendation()
  }

  const castVote = async (vote: VoteType) => {
    if (!track || voteInFlightRef.current) return

    voteInFlightRef.current = true
    setVotingTrackId(track.id)

    const direction = vote === 'LIKE' ? 1 : -1
    cardTranslateX.value = withSpring(direction * exitDistance, Motion.spring)
    cardOpacity.value = withSpring(0, Motion.spring)

    const result = await voteOnTrack({ trackId: track.id, vote }).catch((caughtError: unknown) => {
      const message = caughtError instanceof Error ? caughtError.message : 'Please try again.'

      recoverFromVoteError(message)
      return null
    })

    if (!result) return

    if (result.error) {
      recoverFromVoteError(result.error.message)
      return
    }

    voteInFlightRef.current = false
    setVotingTrackId(null)
    setHasNewProposalBadge(false)
    refreshNextProposal()
  }

  const respondToDiscovery = async (action: RecommendationAction) => {
    if (!playlistId || !recommendationTrack || voteInFlightRef.current) return

    const swipedTrack = recommendationTrack
    consumedRecommendationIdsRef.current.add(swipedTrack.id)
    voteInFlightRef.current = true
    setVotingTrackId(swipedTrack.id)
    const queuedAfterSwipe = recommendationQueue.filter((queuedTrack) => queuedTrack.id !== swipedTrack.id)
    setRecommendationQueue(queuedAfterSwipe)

    const direction = action === 'ACCEPT' ? 1 : -1
    cardTranslateX.value = withSpring(direction * exitDistance, Motion.spring)
    cardOpacity.value = withSpring(0, Motion.spring)

    const result = await respondToRecommendation({
      playlistId,
      spotifyTrackId: swipedTrack.id,
      action,
    }).catch((caughtError: unknown) => {
      const message = caughtError instanceof Error ? caughtError.message : 'Please try again.'

      consumedRecommendationIdsRef.current.delete(swipedTrack.id)
      setRecommendationQueue((currentQueue) => [
        swipedTrack,
        ...currentQueue.filter((queuedTrack) => queuedTrack.id !== swipedTrack.id),
      ])
      recoverFromVoteError(message)
      return null
    })

    if (!result) return

    if (result.error) {
      consumedRecommendationIdsRef.current.delete(swipedTrack.id)
      setRecommendationQueue((currentQueue) => [
        swipedTrack,
        ...currentQueue.filter((queuedTrack) => queuedTrack.id !== swipedTrack.id),
      ])
      recoverFromVoteError(result.error.message)
      return
    }

    voteInFlightRef.current = false
    setVotingTrackId(null)

    if (action === 'ACCEPT') {
      refreshNextProposal()
    }

    void prefetchRecommendation(recommendationExclusions(queuedAfterSwipe))
  }

  return (
    <ThemedViewContainer>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <BackButton />
            <ThemedText type="subtitle" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.title}>
              {playlistName}
            </ThemedText>
          </View>
          {subscriptionStatus === 'reconnecting' && (
            <GlassView glassEffectStyle="regular" colorScheme="dark" style={styles.liveStatus}>
              <ThemedText type="micro" themeColor="textSecondary">
                Reconnecting live updates...
              </ThemedText>
            </GlassView>
          )}
        </View>

        <View style={styles.content}>
          {hasNewProposalBadge && (
            <GlassView glassEffectStyle="regular" colorScheme="dark" style={styles.newProposalBadge}>
              <ThemedText type="micro" themeColor="textSecondary">
                New proposals available
              </ThemedText>
            </GlassView>
          )}

          {isInitialLoading ? (
            <VoteCardSkeleton />
          ) : activeError ? (
            <ErrorState onRetry={retryActiveQueue} />
          ) : activeTrack ? (
            <>
              <Animated.View style={[styles.cardWrap, cardAnimatedStyle]}>
                <VoteCard
                  key={`${isDiscoveryMode ? 'discover' : 'vote'}-${activeTrack.id}`}
                  track={activeTrack}
                  onSwipeLeft={() => void (isDiscoveryMode ? respondToDiscovery('REJECT') : castVote('SKIP'))}
                  onSwipeRight={() => void (isDiscoveryMode ? respondToDiscovery('ACCEPT') : castVote('LIKE'))}
                />
              </Animated.View>

              {isDiscoveryMode && (
                <GlassView glassEffectStyle="regular" colorScheme="dark" style={styles.discoveryBadge}>
                  <ThemedText type="micro" themeColor="textSecondary">
                    Discovery pick
                  </ThemedText>
                </GlassView>
              )}

              <View style={styles.actions}>
                <ActionButton
                  type="skip"
                  disabled={isVoting}
                  onPress={() => void (isDiscoveryMode ? respondToDiscovery('REJECT') : castVote('SKIP'))}
                />
                <ActionButton
                  type="like"
                  disabled={isVoting}
                  onPress={() => void (isDiscoveryMode ? respondToDiscovery('ACCEPT') : castVote('LIKE'))}
                />
              </View>
            </>
          ) : (
            <EmptyState />
          )}
        </View>

        {toastMessage && (
          <GlassView glassEffectStyle="regular" colorScheme="dark" style={styles.toast}>
            <ThemedText type="smallBold">Vote failed</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {toastMessage}
            </ThemedText>
          </GlassView>
        )}
      </SafeAreaView>
    </ThemedViewContainer>
  )
}

function ThemedViewContainer({ children }: { children: ReactNode }) {
  return <View style={styles.container}>{children}</View>
}

function VoteCardSkeleton() {
  return (
    <GlassView
      testID="vote-card-skeleton"
      glassEffectStyle="regular"
      colorScheme="dark"
      intensity={Blur.heavy}
      tintColor={Colors.glassRaised}
      style={styles.skeletonCard}
    >
      <View style={styles.skeletonArt} />
      <View style={styles.skeletonBody}>
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonMeta} />
        <View style={styles.skeletonMicro} />
      </View>
    </GlassView>
  )
}

function EmptyState() {
  return (
    <View style={styles.centerState}>
      <GlassView glassEffectStyle="regular" colorScheme="dark" style={styles.emptyIcon}>
        <SymbolView name="music.note" tintColor={Colors.like} size={38} resizeMode="scaleAspectFit" weight="semibold" />
      </GlassView>
      <ThemedText type="subtitle" style={styles.centerText}>
        {"You're all caught up"}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
        No proposals or discoveries are available right now
      </ThemedText>
    </View>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.centerState}>
      <ThemedText type="subtitle" style={styles.centerText}>
        Queue could not load
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
        Check your connection and try again.
      </ThemedText>
      <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => pressed && styles.pressed}>
        <GlassView glassEffectStyle="clear" colorScheme="dark" style={styles.retryPill}>
          <ThemedText type="smallBold">Retry</ThemedText>
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
    paddingHorizontal: ScreenPadding,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: ScreenPadding,
    paddingBottom: Spacing.five,
    gap: Spacing.four,
  },
  cardWrap: {
    width: '100%',
    alignItems: 'center',
  },
  liveStatus: {
    alignSelf: 'flex-start',
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: Spacing.three,
  },
  newProposalBadge: {
    position: 'absolute',
    top: Spacing.four,
    alignSelf: 'center',
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: Spacing.three,
    backgroundColor: Colors.glassRaised,
  },
  discoveryBadge: {
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: Spacing.three,
    backgroundColor: Colors.glassRaised,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  skeletonCard: {
    width: '100%',
    maxWidth: 430,
    aspectRatio: 0.68,
    overflow: 'hidden',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  skeletonArt: {
    height: '60%',
    backgroundColor: Colors.glassRaised,
  },
  skeletonBody: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  skeletonTitle: {
    width: '82%',
    height: 34,
    borderRadius: Radius.sm,
    backgroundColor: Colors.glassActive,
  },
  skeletonMeta: {
    width: '58%',
    height: 20,
    borderRadius: Radius.sm,
    backgroundColor: Colors.glassRaised,
  },
  skeletonMicro: {
    width: '42%',
    height: 14,
    borderRadius: Radius.sm,
    backgroundColor: Colors.glassRaised,
  },
  centerState: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  emptyIcon: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  centerText: {
    maxWidth: 320,
    textAlign: 'center',
  },
  retryPill: {
    minHeight: 44,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  pressed: {
    opacity: 0.72,
  },
  toast: {
    position: 'absolute',
    left: ScreenPadding,
    right: ScreenPadding,
    bottom: Spacing.five,
    gap: Spacing.half,
    overflow: 'hidden',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.skip,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    backgroundColor: Colors.skipGlow,
  },
})
