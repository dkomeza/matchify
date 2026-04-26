import { BlurView } from "expo-blur";
import { GlassContainer, GlassView, GlassStyle } from "expo-glass-effect";
import { StyleSheet, View, type ViewProps } from "react-native";

import { useGlass } from "@/hooks/use-glass";

// Mirror GlassView's glassEffectStyle values
export type GlassColorScheme = "light" | "dark" | "auto";

// Fallback blur intensities that roughly match each glass weight
const BLUR_INTENSITY: Record<GlassStyle, number> = {
  none: 0,
  clear: 8,
  regular: 32,
};

const BLUR_TINT: Record<GlassColorScheme, "light" | "dark" | "default"> = {
  light: "light",
  dark: "dark",
  auto: "default",
};

export type GlassSurfaceProps = ViewProps & {
  glassEffectStyle?: GlassStyle;
  colorScheme?: GlassColorScheme;
  tintColor?: string;
  forceFallback?: boolean;
};

export function GlassSurface({
  glassEffectStyle = "regular",
  colorScheme = "dark",
  tintColor,
  style,
  children,
  forceFallback = false,
  ...props
}: GlassSurfaceProps) {
  const isGlass = useGlass();

  if (isGlass && !forceFallback) {
    return (
      <GlassContainer>
        <GlassView
          glassEffectStyle={glassEffectStyle}
          colorScheme={colorScheme}
          tintColor={tintColor}
          style={style}
          {...props}
        >
          {children}
        </GlassView>
      </GlassContainer>
    );
  }

  return (
    <BlurView
      intensity={BLUR_INTENSITY[glassEffectStyle]}
      tint={BLUR_TINT[colorScheme]}
      style={style}
      {...props}
    >
      {tintColor && (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: tintColor }]}
        />
      )}
      {children}
    </BlurView>
  );
}
