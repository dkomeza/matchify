import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { SymbolView } from 'expo-symbols'

import { GlassView } from '@/components/glass-view'
import { Blur, Colors, Motion, Radius } from '@/constants/theme'

type ActionButtonType = 'like' | 'skip'

type ActionButtonProps = {
  type: ActionButtonType
  onPress: () => void
  disabled?: boolean
}

const BUTTON_SIZE = 64
const ICON_SIZE = 28

const BUTTON_CONFIG = {
  like: {
    accessibilityLabel: 'Like',
    borderColor: Colors.like,
    glowColor: Colors.likeGlow,
    iconName: 'heart.fill',
  },
  skip: {
    accessibilityLabel: 'Skip',
    borderColor: Colors.skip,
    glowColor: Colors.skipGlow,
    iconName: 'xmark',
  },
} as const

export function ActionButton({ type, onPress, disabled = false }: ActionButtonProps) {
  const scale = useSharedValue(1)
  const active = useSharedValue(0)
  const config = BUTTON_CONFIG[type]

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(active.value, [0, 1], [Colors.glass, Colors.glassActive]),
    transform: [{ scale: scale.value }],
  }))

  const handlePressIn = () => {
    if (disabled) {
      return
    }

    scale.value = withSpring(0.95, Motion.spring)
    active.value = withSpring(1, Motion.spring)
  }

  const handlePressOut = () => {
    if (disabled) {
      return
    }

    scale.value = withSpring(1, Motion.spring)
    active.value = withSpring(0, Motion.spring)
  }

  return (
    <Pressable
      accessibilityLabel={config.accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={disabled && styles.disabled}
    >
      <Animated.View
        style={[
          styles.button,
          {
            borderColor: config.borderColor,
            boxShadow: `0 0 22px ${config.glowColor}`,
          },
          animatedStyle,
        ]}
      >
        <GlassView
          glassEffectStyle="regular"
          colorScheme="dark"
          intensity={Blur.regular}
          style={styles.glass}
        >
          <View style={styles.content}>
            <SymbolView
              name={config.iconName}
              tintColor={config.borderColor}
              size={ICON_SIZE}
              resizeMode="scaleAspectFit"
              weight="semibold"
            />
          </View>
        </GlassView>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    overflow: 'hidden',
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  glass: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: Radius.full,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
})
