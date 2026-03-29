import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { GlassSurface } from '@/components/glass-surface'
import { ThemedText } from '@/components/themed-text'
import { Radius, Spacing } from '@/constants/theme'
import { useSpotifyLogin } from '@/hooks/use-spotify-login'

const SPOTIFY_GREEN = '#1DB954'

export function SpotifyButton() {
  const scale = useSharedValue(1)
  const { login, isLoading, ready } = useSpotifyLogin()

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const handlePressIn = () => {
    scale.value = withTiming(0.97, { duration: 80 })
  }

  const handlePressOut = () => {
    scale.value = withTiming(1, { duration: 200 })
  }

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={login}
        disabled={isLoading || !ready}
      >
        <GlassSurface
          glassEffectStyle="regular"
          colorScheme="dark"
          tintColor="rgba(29,185,84,0.20)"
          style={styles.surface}
          forceFallback
          className="overflow-hidden"
        >
          <View style={styles.inner}>
            {isLoading ? (
              <ActivityIndicator color={SPOTIFY_GREEN} size="small" />
            ) : (
              <>
                <ThemedText style={styles.icon}>♫</ThemedText>
                <ThemedText type="smallBold">Continue with Spotify</ThemedText>
              </>
            )}
          </View>
        </GlassSurface>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: 'rgba(29,185,84,0.65)',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  icon: { fontSize: 20, color: SPOTIFY_GREEN },
})
