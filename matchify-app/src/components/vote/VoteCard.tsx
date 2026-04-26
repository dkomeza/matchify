import { useEffect } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { Image } from 'expo-image'

import { GlassView } from '@/components/glass-view'
import { ThemedText } from '@/components/themed-text'
import { formatDuration } from '@/components/track/track-row'
import { Blur, CardPadding, Colors, Motion, Radius, Spacing } from '@/constants/theme'

const MAX_CARD_WIDTH = 430
const CARD_ASPECT_RATIO = 0.68
const SWIPE_THRESHOLD_RATIO = 0.35
const GLOW_START_RATIO = 0.3
const MAX_GLOW_OPACITY = 0.6
const MAX_ROTATION_DEGREES = 15
const ALBUM_ART_HEIGHT = '60%'
const DEFAULT_BLURHASH = 'L02rszj[fQj[fQfQfQfQfQfQfQfQ'

export type VoteCardTrack = {
  id: string
  title: string
  artist: string
  album?: string | null
  albumArtUrl?: string | null
  albumArtBlurhash?: string | null
  durationMs: number
}

type VoteCardProps = {
  track: VoteCardTrack
  onSwipeRight: () => void
  onSwipeLeft: () => void
}

export function VoteCard({ track, onSwipeRight, onSwipeLeft }: VoteCardProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const cardWidth = Math.min(screenWidth - Spacing.four * 2, MAX_CARD_WIDTH)
  const cardHeight = Math.min(cardWidth / CARD_ASPECT_RATIO, screenHeight * 0.72)
  const swipeThreshold = cardWidth * SWIPE_THRESHOLD_RATIO
  const glowStart = swipeThreshold * GLOW_START_RATIO
  const flyOffDistance = screenWidth + cardWidth

  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const startX = useSharedValue(0)
  const startY = useSharedValue(0)
  const rotate = useSharedValue(0)
  const likeGlowOpacity = useSharedValue(0)
  const skipGlowOpacity = useSharedValue(0)
  const cardScale = useSharedValue(0.96)

  useEffect(() => {
    translateX.value = 0
    translateY.value = 0
    rotate.value = 0
    likeGlowOpacity.value = 0
    skipGlowOpacity.value = 0
    cardScale.value = 0.96
    cardScale.value = withSpring(1, Motion.spring)
  }, [cardScale, likeGlowOpacity, rotate, skipGlowOpacity, track.id, translateX, translateY])

  const completeSwipe = (direction: 1 | -1) => {
    if (direction > 0) {
      onSwipeRight()
      return
    }

    onSwipeLeft()
  }

  const pan = Gesture.Pan()
    .onBegin(() => {
      startX.value = translateX.value
      startY.value = translateY.value
    })
    .onUpdate((event) => {
      translateX.value = startX.value + event.translationX
      translateY.value = startY.value + event.translationY
      rotate.value = (translateX.value / screenWidth) * MAX_ROTATION_DEGREES
      likeGlowOpacity.value = interpolate(
        translateX.value,
        [glowStart, swipeThreshold],
        [0, MAX_GLOW_OPACITY],
        Extrapolation.CLAMP,
      )
      skipGlowOpacity.value = interpolate(
        translateX.value,
        [-swipeThreshold, -glowStart],
        [MAX_GLOW_OPACITY, 0],
        Extrapolation.CLAMP,
      )
    })
    .onEnd((event) => {
      const direction = translateX.value >= 0 ? 1 : -1
      const didPassThreshold = Math.abs(translateX.value) >= swipeThreshold

      if (didPassThreshold) {
        translateX.value = withSpring(
          direction * flyOffDistance,
          { ...Motion.spring, velocity: event.velocityX },
          (finished) => {
            if (finished) {
              runOnJS(completeSwipe)(direction)
            }
          },
        )
        translateY.value = withSpring(translateY.value + event.velocityY * 0.12, {
          ...Motion.spring,
          velocity: event.velocityY,
        })
        rotate.value = withSpring(direction * MAX_ROTATION_DEGREES, Motion.spring)
        cardScale.value = withSpring(0.94, Motion.spring)
        likeGlowOpacity.value = withSpring(direction > 0 ? MAX_GLOW_OPACITY : 0, Motion.spring)
        skipGlowOpacity.value = withSpring(direction < 0 ? MAX_GLOW_OPACITY : 0, Motion.spring)
        return
      }

      translateX.value = withSpring(0, { ...Motion.spring, velocity: event.velocityX })
      translateY.value = withSpring(0, { ...Motion.spring, velocity: event.velocityY })
      rotate.value = withSpring(0, Motion.spring)
      cardScale.value = withSpring(1, Motion.spring)
      likeGlowOpacity.value = withSpring(0, Motion.spring)
      skipGlowOpacity.value = withSpring(0, Motion.spring)
    })

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
      { scale: cardScale.value },
    ],
  }))

  const likeGlowStyle = useAnimatedStyle(() => ({
    opacity: likeGlowOpacity.value,
  }))

  const skipGlowStyle = useAnimatedStyle(() => ({
    opacity: skipGlowOpacity.value,
  }))

  const albumAndDuration = [track.album, formatDuration(track.durationMs)].filter(Boolean).join(' · ')

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        testID={`vote-card-${track.id}`}
        style={[styles.card, { width: cardWidth, height: cardHeight }, cardAnimatedStyle]}
      >
        <Image
          testID={`vote-card-art-${track.id}`}
          source={track.albumArtUrl ? { uri: track.albumArtUrl } : undefined}
          placeholder={{ blurhash: track.albumArtBlurhash ?? DEFAULT_BLURHASH }}
          placeholderContentFit="cover"
          contentFit="cover"
          transition={160}
          style={styles.albumArt}
        />
        {!track.albumArtUrl && <View style={[styles.albumArt, styles.albumFallback]} />}

        <View pointerEvents="none" style={styles.artGradient}>
          {GRADIENT_STOPS.map((opacity) => (
            <View key={opacity} style={[styles.gradientStop, { backgroundColor: `rgba(0,0,0,${opacity})` }]} />
          ))}
        </View>

        <Animated.View pointerEvents="none" style={[styles.glowOverlay, styles.likeGlow, likeGlowStyle]} />
        <Animated.View pointerEvents="none" style={[styles.glowOverlay, styles.skipGlow, skipGlowStyle]} />

        <GlassView
          glassEffectStyle="regular"
          colorScheme="dark"
          intensity={Blur.heavy}
          tintColor={Colors.glassRaised}
          style={styles.infoOverlay}
        >
          <ThemedText type="display" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>
            {track.title}
          </ThemedText>
          <ThemedText type="subtitle" themeColor="textSecondary" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.74}>
            {track.artist}
          </ThemedText>
          <ThemedText type="micro" themeColor="textTertiary" numberOfLines={1}>
            {albumAndDuration}
          </ThemedText>
        </GlassView>
      </Animated.View>
    </GestureDetector>
  )
}

const GRADIENT_STOPS = [0, 0.08, 0.18, 0.3, 0.4]

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: Radius.xl,
    backgroundColor: Colors.backgroundElevated,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  albumArt: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: ALBUM_ART_HEIGHT,
    backgroundColor: Colors.glassRaised,
  },
  albumFallback: {
    borderBottomWidth: 1,
    borderColor: Colors.glassBorder,
  },
  artGradient: {
    position: 'absolute',
    top: '42%',
    left: 0,
    right: 0,
    height: '18%',
  },
  gradientStop: {
    flex: 1,
  },
  glowOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  likeGlow: {
    backgroundColor: Colors.likeGlow,
  },
  skipGlow: {
    backgroundColor: Colors.skipGlow,
  },
  infoOverlay: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.three,
    gap: Spacing.two,
    overflow: 'hidden',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: CardPadding,
  },
})
