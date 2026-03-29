import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { Colors } from "@/constants/theme";

const BAR_MAX_H = 52;

const BARS = [
  18, 35, 58, 44, 72, 38, 66, 90, 70, 48, 82, 55, 28, 68, 52, 74, 40, 80, 24,
  56, 44, 70,
];

// Interpolate between sparse random anchors so neighboring bars behave similarly.
const ANCHOR_STRIDE = 5;
const ANCHOR_COUNT = Math.ceil(BARS.length / ANCHOR_STRIDE) + 1;
const delayAnchors = Array.from(
  { length: ANCHOR_COUNT },
  () => Math.random() * 1500,
);
const durationAnchors = Array.from(
  { length: ANCHOR_COUNT },
  () => 0.7 + Math.random() * 0.6,
);

const BAR_CONFIGS = BARS.map((_, i) => {
  const t = (i / (BARS.length - 1)) * (ANCHOR_COUNT - 1);
  const lo = Math.floor(t);
  const hi = Math.min(lo + 1, ANCHOR_COUNT - 1);
  const frac = t - lo;
  return {
    delay: delayAnchors[lo] + (delayAnchors[hi] - delayAnchors[lo]) * frac,
    durationScale:
      durationAnchors[lo] + (durationAnchors[hi] - durationAnchors[lo]) * frac,
  };
});

type BarProps = { height: number; delay: number; durationScale: number };

function WaveformBar({ height, delay, durationScale }: BarProps) {
  const scale = useSharedValue(1);

  useEffect(() => {
    const d = durationScale;
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.18, {
            duration: 900 * d,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(0.78, {
            duration: 1100 * d,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(1.08, {
            duration: 750 * d,
            easing: Easing.inOut(Easing.sin),
          }),
        ),
        -1,
        true,
      ),
    );
  }, [scale, delay, durationScale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: scale.value }],
  }));

  return (
    <Animated.View
      style={[styles.bar, { height: (height / 100) * BAR_MAX_H }, animStyle]}
    />
  );
}

export function Waveform() {
  return (
    <View style={styles.row}>
      {BARS.map((h, i) => (
        <WaveformBar
          key={i}
          height={h}
          delay={BAR_CONFIGS[i].delay}
          durationScale={BAR_CONFIGS[i].durationScale}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  bar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: Colors.like,
  },
});
