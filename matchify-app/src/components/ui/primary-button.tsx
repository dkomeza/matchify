import { useRef, type ReactNode } from 'react'
import { Animated, Pressable, StyleSheet } from 'react-native'

import { ThemedText } from '@/components/themed-text'
import { Colors, Radius, Typography } from '@/constants/theme'

type PrimaryButtonProps = {
  children: ReactNode
  disabled?: boolean
  onPress: () => void
}

export function PrimaryButton({ children, disabled, onPress }: PrimaryButtonProps) {
  const scale = useRef(new Animated.Value(1)).current

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, damping: 18, stiffness: 220 }).start()
        }}
        onPressOut={() => {
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 220 }).start()
        }}
        style={[styles.button, disabled && styles.disabled]}
      >
        <ThemedText type="smallBold" style={styles.text}>
          {children}
        </ThemedText>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: Radius.sm,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `0 10px 24px ${Colors.brandGlow}`,
  },
  text: {
    ...Typography.smallBold,
    color: Colors.text,
  },
  disabled: {
    opacity: 0.62,
  },
})
