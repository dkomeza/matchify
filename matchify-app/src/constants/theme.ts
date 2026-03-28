import '@/global.css';

import { Platform } from 'react-native';

// Base palette — dark-only (Liquid Glass aesthetic)
export const Colors = {
  // Backgrounds
  background: '#08080C',
  backgroundElevated: '#111116',

  // Glass surface fills (pair with BlurView / backdrop-filter)
  glass: 'rgba(255,255,255,0.07)',
  glassRaised: 'rgba(255,255,255,0.11)',
  glassActive: 'rgba(255,255,255,0.16)',
  glassBorder: 'rgba(255,255,255,0.12)',
  glassHighlight: 'rgba(255,255,255,0.20)',

  // Text
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.55)',
  textTertiary: 'rgba(255,255,255,0.30)',

  // Brand
  brand: '#BF5AF2',
  brandGlow: 'rgba(191,90,242,0.35)',

  // Semantic
  like: '#30D158',
  likeGlow: 'rgba(48,209,88,0.30)',
  skip: '#FF453A',
  skipGlow: 'rgba(255,69,58,0.30)',
  accent: '#0A84FF',
} as const;

export type ThemeColor = keyof typeof Colors;

// Blur intensities (in BlurView intensity units or CSS px — see STYLE_GUIDE.md)
export const Blur = {
  subtle: 16,
  regular: 24,
  heavy: 32,
  ultra: 48,
} as const;

// Border radii
export const Radius = {
  xs: 8,
  sm: 12,
  md: 20,
  lg: 28,
  xl: 40,
  full: 9999,
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

// Semantic spacing aliases
export const ScreenPadding = Spacing.four;
export const CardPadding = Spacing.four;
export const SectionGap = Spacing.five;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
