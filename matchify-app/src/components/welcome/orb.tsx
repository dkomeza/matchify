import { useEffect } from "react";
import { Dimensions, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export type OrbProps = {
  color: string;
  size: number;
  opacity?: number;
  style?: ViewStyle;
  driftX?: number;
  driftY?: number;
  durationX?: number;
  durationY?: number;
};

export function Orb({
  color,
  size,
  opacity = 0.15,
  style,
  driftX = 24,
  driftY = 20,
  durationX = 7000,
  durationY = 5000,
}: OrbProps) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  useEffect(() => {
    tx.value = withRepeat(
      withSequence(
        withTiming(driftX, {
          duration: durationX,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(-driftX * 0.6, {
          duration: durationX * 0.85,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(driftX * 0.3, {
          duration: durationX * 0.7,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
      true,
    );
    ty.value = withRepeat(
      withSequence(
        withTiming(-driftY, {
          duration: durationY,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(driftY * 0.7, {
          duration: durationY * 1.2,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(-driftY * 0.4, {
          duration: durationY * 0.9,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
      true,
    );
  }, [tx, ty, driftX, driftY, durationX, durationY]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  return (
    <Animated.View
      style={[
        { position: "absolute", width: size, height: size, borderRadius: size / 2 },
        style,
        animStyle,
      ]}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity,
        }}
      />
    </Animated.View>
  );
}

export { SCREEN_WIDTH, SCREEN_HEIGHT };
