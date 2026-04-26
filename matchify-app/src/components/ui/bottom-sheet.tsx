import { useEffect, useRef } from 'react'
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewProps,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { GlassView } from '@/components/ui/glass-view'
import { Blur, Colors, Radius, ScreenPadding, Spacing } from '@/constants/theme'

type BottomSheetProps = ViewProps & {
  onClose: () => void
}

export function BottomSheet({ children, onClose, style }: BottomSheetProps) {
  const insets = useSafeAreaInsets()
  const progress = useRef(new Animated.Value(0)).current
  const isClosing = useRef(false)

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 300,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start()
  }, [progress])

  const close = () => {
    if (isClosing.current) return
    isClosing.current = true

    Animated.timing(progress, {
      toValue: 0,
      duration: 300,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose()
    })
  }

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close sheet" style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>
      <KeyboardAvoidingView
        pointerEvents="box-none"
        behavior={Platform.select({ ios: 'padding', default: undefined })}
        style={styles.keyboard}
      >
        <Animated.View
          style={[
            styles.sheetWrap,
            {
              paddingBottom: Math.max(insets.bottom, Spacing.three),
              transform: [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [480, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <GlassView
            forceFallback
            intensity={Blur.ultra}
            glassEffectStyle="regular"
            colorScheme="dark"
            tintColor={Colors.glassRaised}
            style={[styles.sheet, style]}
          >
            <View style={styles.handle} />
            {children}
          </GlassView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,12,0.58)',
  },
  keyboard: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    paddingHorizontal: ScreenPadding,
  },
  sheet: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: Spacing.four,
    overflow: 'hidden',
    gap: Spacing.three,
    backgroundColor: Colors.glassRaised,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.glassHighlight,
    marginBottom: Spacing.one,
  },
})
