import { ThemedText } from "@/components/themed-text";
import { useAuthStore } from "@/store/auth-store";
import { Image } from "expo-image";
import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function Home() {
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();

  if (!user) {
    return null;
  }

  return (
    <View style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <ThemedText className="text-2xl font-bold">
        Welcome back, {user.displayName}!
        {user.imageUrl && (
          <Image
            source={user.imageUrl}
            style={{ width: 40, height: 40, borderRadius: 20, display: "flex" }}
          />
        )}
      </ThemedText>
    </View>
  );
}

export default Home;
