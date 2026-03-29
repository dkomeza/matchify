import { Dimensions, StyleSheet, View } from "react-native";

import { Colors, Radius, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";

import { Waveform } from "./waveform";
import { GlassSurface } from "../glass-surface";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const CARD_WIDTH = SCREEN_WIDTH * 0.68;
export const CARD_HEIGHT = CARD_WIDTH * 0.8;

type SongCardProps = {
  showContent?: boolean;
  tint?: string;
};

export function SongCard({
  showContent = false,
  tint = "transparent",
}: SongCardProps) {
  return (
    <GlassSurface
      glassEffectStyle="regular"
      tintColor={tint}
      style={[styles.card]}
      forceFallback
    >
      {showContent && (
        <>
          <View style={styles.waveArea}>
            <Waveform />
          </View>
          <View style={styles.footer}>
            <View style={styles.footerText}>
              <ThemedText type="smallBold" style={styles.playlist}>
                CHILL VIBES
              </ThemedText>
              <ThemedText type="micro" themeColor="textSecondary">
                SZA · Kill Bill
              </ThemedText>
            </View>
            <ThemedText style={styles.heart}>♥</ThemedText>
          </View>
        </>
      )}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: "hidden",
    padding: Spacing.four,
    justifyContent: "space-between",
  },
  waveArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingTop: Spacing.two,
  },
  footerText: { gap: 2 },
  playlist: { letterSpacing: 1, fontSize: 12 },
  heart: { fontSize: 20, color: Colors.like },
});
