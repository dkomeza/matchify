import { useLocalSearchParams } from 'expo-router'
import { SymbolView } from 'expo-symbols'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { useMutation, useQuery, useSubscription } from 'urql'

import { GlassView } from '@/components/glass-view'
import { ThemedText } from '@/components/themed-text'
import { ActionButton } from '@/components/vote/ActionButton'
import { VoteCard, type VoteCardTrack } from '@/components/vote/VoteCard'
import { Blur, Colors, Motion, Radius, ScreenPadding, Spacing } from '@/constants/theme'
import {
  NEW_PROPOSAL_SUBSCRIPTION,
  NEXT_PROPOSAL_QUERY,
  VOTE_ON_TRACK_MUTATION,
} from '@/lib/graphql/vote'
import { useSubscriptionConnectionStatus } from '@/lib/subscription-status'

type VoteType = 'LIKE' | 'SKIP'

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

type NewProposalData = {
  newProposal?: VoteCardTrack | null
}

const EXIT_OVERSHOOT = 120

const firstParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0]

  return value
}

export default function VoteScreen() {
  const { playlistId: playlistIdParam, playlistName: playlistNameParam } = useLocalSearchParams<{
    playlistId?: string | string[]
    playlistName?: string | string[]
  }>()
  const playlistId = firstParam(playlistIdParam)
  const playlistName = firstParam(playlistNameParam) ?? 'Vote'
  const { width } = useWindowDimensions()
  const [votingTrackId, setVotingTrackId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [hasNewProposalBadge, setHasNewProposalBadge] = useState(false)
  const voteInFlightRef = useRef(false)
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

  const trackId = track?.id
  const isInitialLoading = fetching && !data
  const isVoting = Boolean(votingTrackId)
  const exitDistance = width + EXIT_OVERSHOOT

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

  return (
    <ThemedViewContainer>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="subtitle" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
            {playlistName}
          </ThemedText>
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
          ) : error ? (
            <ErrorState onRetry={refreshNextProposal} />
          ) : track ? (
            <>
              <Animated.View style={[styles.cardWrap, cardAnimatedStyle]}>
                <VoteCard
                  key={track.id}
                  track={track}
                  onSwipeLeft={() => void castVote('SKIP')}
                  onSwipeRight={() => void castVote('LIKE')}
                />
              </Animated.View>

              <View style={styles.actions}>
                <ActionButton type="skip" disabled={isVoting} onPress={() => void castVote('SKIP')} />
                <ActionButton type="like" disabled={isVoting} onPress={() => void castVote('LIKE')} />
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
        {"You're all caught up!"}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
        Come back when someone proposes a new track
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
