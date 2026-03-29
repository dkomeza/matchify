import { StyleSheet } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { CardStack } from "@/components/welcome/card-stack";
import { SpotifyButton } from "@/components/welcome/spotify-button";
import { WelcomeBackground } from "@/components/welcome/welcome-background";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors, Spacing } from "@/constants/theme";

export default function WelcomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <WelcomeBackground />

      <SafeAreaView style={styles.safeArea}>
        <Animated.View
          entering={FadeInDown.delay(0).duration(700)}
          style={styles.logoRow}
        >
          <ThemedText style={styles.logoMark} themeColor="brand">
            ✦
          </ThemedText>
          <ThemedText type="smallBold" style={styles.logoWordmark}>
            matchify
          </ThemedText>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(150).duration(700)}
          style={styles.hero}
        >
          <ThemedText type="display">Your music,</ThemedText>
          <ThemedText type="display" themeColor="brand">
            their ears.
          </ThemedText>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.tagline}
          >
            Swipe songs. Build playlists together with your crew.
          </ThemedText>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(300).duration(700)}
          style={styles.cardStackArea}
        >
          <CardStack />
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(450).duration(700)}
          style={styles.cta}
        >
          <SpotifyButton />
          <ThemedText
            type="micro"
            themeColor="textTertiary"
            style={styles.legal}
          >
            By continuing you agree to our Terms of Service and Privacy Policy.
          </ThemedText>
        </Animated.View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  logoMark: { fontSize: 22, lineHeight: 26 },
  logoWordmark: { fontSize: 17, letterSpacing: 0.5, color: Colors.text },
  hero: {
    gap: Spacing.one,
    paddingTop: Spacing.four,
  },
  tagline: { lineHeight: 20, marginTop: Spacing.two },
  cardStackArea: {
    flex: 1,
  },
  cta: { gap: Spacing.three },
  legal: { textAlign: "center", lineHeight: 16 },
});
