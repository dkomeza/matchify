import { Dimensions, StyleSheet, View } from "react-native";

import { Colors } from "@/constants/theme";

import { Orb } from "./orb";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export function WelcomeBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.decorLayer}>
        <Orb
          color={Colors.brand}
          size={340}
          opacity={0.18}
          style={styles.orbPurple}
          driftX={28}
          driftY={22}
          durationX={8000}
          durationY={6500}
        />
        <Orb
          color={Colors.like}
          size={280}
          opacity={0.13}
          style={styles.orbGreen}
          driftX={20}
          driftY={30}
          durationX={6500}
          durationY={8500}
        />
        <Orb
          color={Colors.accent}
          size={210}
          opacity={0.09}
          style={styles.orbBlue}
          driftX={16}
          driftY={18}
          durationX={9000}
          durationY={7000}
        />
        <Orb
          color={Colors.like}
          size={300}
          opacity={0.12}
          style={{ top: SCREEN_HEIGHT * 0.3, left: SCREEN_WIDTH / 2 - 150 }}
          driftX={12}
          driftY={10}
          durationX={11000}
          durationY={9000}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  decorLayer: {
    flex: 1,
    overflow: "hidden",
  },
  orbPurple: { top: -100, right: -80 },
  orbGreen: { bottom: 80, left: -100 },
  orbBlue: { top: SCREEN_HEIGHT * 0.38, left: -50 },
});
