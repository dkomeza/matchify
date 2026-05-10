import { usePathname } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";

import { Colors } from "@/constants/theme";

export default function AppTabs() {
  const pathname = usePathname();
  const hidesTabBar =
    pathname.includes("/playlists/") &&
    (pathname.endsWith("/vote") || pathname.endsWith("/search"));

  return (
    <NativeTabs
      backgroundColor={Colors.background}
      hidden={hidesTabBar}
      indicatorColor={Colors.glass}
      labelStyle={{ selected: { color: Colors.text } }}
      minimizeBehavior="onScrollDown"
    >
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={"music.house"} renderingMode="template" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="playlists">
        <NativeTabs.Trigger.Label>Playlists</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require("@/assets/images/tabIcons/explore.png")}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
