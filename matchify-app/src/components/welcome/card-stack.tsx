import { StyleSheet, View } from "react-native";

import { CARD_WIDTH, CARD_HEIGHT, SongCard } from "./song-card";

export function CardStack() {
  return (
    <View style={styles.area}>
      {/* Back-left */}
      <View
        style={[
          styles.wrapper,
          {
            transform: [
              { rotate: "-22deg" },
              { translateX: -CARD_WIDTH * 0.14 },
              { translateY: 24 },
            ],
            zIndex: 1,
          },
        ]}
      >
        <SongCard tint="rgba(191,90,242,0.06)" />
      </View>

      {/* Back-right */}
      <View
        style={[
          styles.wrapper,
          {
            transform: [
              { rotate: "16deg" },
              { translateX: CARD_WIDTH * 0.12 },
              { translateY: -12 },
            ],
            zIndex: 2,
          },
        ]}
      >
        <SongCard tint="rgba(10,132,255,0.05)" />
      </View>

      {/* Front */}
      <View
        style={[
          styles.wrapper,
          { transform: [{ rotate: "-4deg" }], zIndex: 3 },
        ]}
      >
        <SongCard showContent tint="rgba(29,185,84,0.07)" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  area: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  wrapper: {
    position: "absolute",
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
});
