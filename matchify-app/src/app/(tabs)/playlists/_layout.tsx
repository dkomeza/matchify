import { Stack } from 'expo-router'

export default function PlaylistsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="[id]/vote" />
      <Stack.Screen name="[id]/search" />
      <Stack.Screen
        name="create"
        options={{
          animation: 'slide_from_bottom',
          contentStyle: { backgroundColor: 'transparent' },
          presentation: 'transparentModal',
        }}
      />
      <Stack.Screen
        name="join"
        options={{
          animation: 'slide_from_bottom',
          contentStyle: { backgroundColor: 'transparent' },
          presentation: 'transparentModal',
        }}
      />
    </Stack>
  )
}
