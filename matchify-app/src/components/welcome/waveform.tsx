import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { Colors } from "@/constants/theme";

const BARS = [
  18, 35, 58, 44, 72, 38, 66, 90, 70, 48,
  82, 55, 28, 68, 52, 74, 40, 80, 24, 56,
  44, 70, 32, 62, 85,
];
const BAR_MAX_H = 52;

export function Waveform() {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.18, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.78, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.08, { duration: 750, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, [pulse]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: pulse.value }],
  }));

  return (
    <Animated.View style={[styles.row, animStyle]}>
      {BARS.map((h, i) => (
        <View key={i} style={[styles.bar, { height: (h / 100) * BAR_MAX_H }]} />
      ))}
    </Animated.View>
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
