import { router } from 'expo-router'
import { SymbolView } from 'expo-symbols'
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'

import { GlassView } from '@/components/glass-view'
import { Colors, Radius } from '@/constants/theme'

type BackButtonProps = {
  style?: StyleProp<ViewStyle>
}

export function BackButton({ style }: BackButtonProps) {
  return (
    <Pressable
      accessibilityLabel="Go back"
      accessibilityRole="button"
      hitSlop={8}
      onPress={router.back}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed, style]}
    >
      <GlassView glassEffectStyle="clear" colorScheme="dark" style={styles.button}>
        <SymbolView
          name="chevron.left"
          tintColor={Colors.text}
          size={18}
          resizeMode="scaleAspectFit"
          weight="semibold"
        />
      </GlassView>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pressable: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
  },
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: Colors.glass,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
})
