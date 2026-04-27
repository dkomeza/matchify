import { isAuthFailure } from "@/lib/auth-errors";
import { LOGIN_ROUTE, useAuthStore, type User } from "@/store/auth-store";
import { Redirect, Stack, useSegments, type Href } from "expo-router";
import { useEffect } from "react";
import { gql, useQuery } from "urql";

const ME_QUERY = gql`
  query Me {
    me {
      id
      displayName
      profileImageUrl
    }
  }
`;

interface MeData {
  me: {
    id: string;
    displayName: string;
    profileImageUrl: string | null;
  };
}

const toUser = (me: MeData["me"]): User => ({
  id: String(me.id),
  displayName: me.displayName,
  imageUrl: me.profileImageUrl,
});

const TABS_ROUTE = "/(tabs)/home" as Href;

export function AuthGate() {
  const { token, user, isLoading, initialize, hydrateUser, logout } =
    useAuthStore();
  const segments = useSegments();
  const rootSegment = String(segments[0] ?? "");
  const inAuthGroup = rootSegment === "(auth)";

  const [{ data, error }] = useQuery<MeData>({
    query: ME_QUERY,
    pause: !token || !!user,
  });

  useEffect(() => {
    if (!token) void initialize();
  }, [token, initialize]);

  useEffect(() => {
    if (data?.me) {
      hydrateUser(toUser(data.me));
    }
  }, [data, hydrateUser]);

  useEffect(() => {
    if (isAuthFailure(error)) {
      logout();
    }
  }, [error, logout]);

  const isResolvingAuth = isLoading || (token && !user);

  console.log(isResolvingAuth, token, user, inAuthGroup);

  if (!isResolvingAuth && !token && !inAuthGroup) {
    return <Redirect href={LOGIN_ROUTE} />;
  }

  if (!isResolvingAuth && token && user && inAuthGroup) {
    return <Redirect href={TABS_ROUTE} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
