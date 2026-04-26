import { type ViewProps } from 'react-native'

import { GlassView } from '@/components/ui/glass-view'

export type GlassStyle = 'none' | 'clear' | 'regular'
export type GlassColorScheme = 'light' | 'dark' | 'auto'

const BLUR_INTENSITY: Record<GlassStyle, number> = {
  none: 0,
  clear: 8,
  regular: 32,
}

const BLUR_TINT: Record<GlassColorScheme, 'light' | 'dark' | 'default'> = {
  light: 'light',
  dark: 'dark',
  auto: 'default',
}

export type GlassSurfaceProps = ViewProps & {
  glassEffectStyle?: GlassStyle
  colorScheme?: GlassColorScheme
  tintColor?: string
  forceFallback?: boolean
}

/**
 * Backwards-compatible wrapper around the shared GlassView.
 */
export function GlassSurface({
  glassEffectStyle = 'regular',
  colorScheme = 'dark',
  tintColor,
  forceFallback,
  style,
  children,
  ...props
}: GlassSurfaceProps) {
  return (
    <GlassView
      intensity={BLUR_INTENSITY[glassEffectStyle]}
      tint={BLUR_TINT[colorScheme]}
      fillColor={tintColor}
      forceFallback={forceFallback}
      style={style}
      {...props}
    >
      {children}
    </GlassView>
  )
}
