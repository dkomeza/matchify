import { BlurView, type BlurTint } from 'expo-blur'
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native'

import { Blur, Colors, Radius } from '@/constants/theme'

type GlassTone = 'default' | 'raised' | 'active'

export type GlassViewProps = ViewProps & {
  intensity?: number
  tint?: BlurTint
  tone?: GlassTone
  fillColor?: string
  border?: boolean
  contentStyle?: StyleProp<ViewStyle>
  forceFallback?: boolean
}

const GLASS_FILL: Record<GlassTone, string> = {
  default: Colors.glass,
  raised: Colors.glassRaised,
  active: Colors.glassActive,
}

export function GlassView({
  intensity = Blur.regular,
  tint = 'dark',
  tone = 'default',
  fillColor,
  border = true,
  style,
  contentStyle,
  forceFallback = false,
  children,
  ...props
}: GlassViewProps) {
  const fill = fillColor ?? GLASS_FILL[tone]

  if (Platform.OS === 'web' || forceFallback) {
    return (
      <View
        style={[
          styles.base,
          Platform.OS === 'web' && styles.webGlass,
          border && styles.border,
          {
            backgroundColor: fill,
            ...(Platform.OS === 'web' ? { backdropFilter: `blur(${intensity}px)` } : {}),
          } as ViewStyle,
          style,
        ]}
        {...props}
      >
        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    )
  }

  return (
    <BlurView
      intensity={intensity}
      tint={tint}
      style={[styles.base, border && styles.border, style]}
      {...props}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </BlurView>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  border: {
    borderColor: Colors.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
  },
  content: {
  },
  webGlass: {
    // react-native-web forwards these CSS-only keys to the DOM style.
    WebkitBackdropFilter: `blur(${Blur.regular}px)`,
  } as ViewStyle,
})
