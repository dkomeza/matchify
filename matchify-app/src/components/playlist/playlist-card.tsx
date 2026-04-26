import { Pressable, StyleSheet, View } from 'react-native'

import { GlassView } from '@/components/glass-view'
import { ThemedText } from '@/components/themed-text'
import { Colors, Radius, Spacing } from '@/constants/theme'

export type PlaylistCardPlaylist = {
  id: string
  name: string
  description?: string | null
  voteThreshold: number
  members: {
    id: string
    displayName: string
    profileImageUrl?: string | null
  }[]
}

type PlaylistCardProps = {
  playlist: PlaylistCardPlaylist
  onPress: () => void
}

export function PlaylistCard({ playlist, onPress }: PlaylistCardProps) {
  const memberCount = playlist.members.length
  const memberLabel = memberCount === 1 ? '1 member' : `${memberCount} members`

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${playlist.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      testID={`playlist-card-${playlist.id}`}
    >
      <GlassView
        glassEffectStyle="regular"
        colorScheme="dark"
        tintColor="rgba(255,255,255,0.04)"
        style={styles.card}
      >
        <View style={styles.content}>
          <View style={styles.textBlock}>
            <ThemedText type="subtitle" numberOfLines={1} style={styles.name}>
              {playlist.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {memberLabel} · {playlist.voteThreshold} vote threshold
            </ThemedText>
          </View>
          <View style={styles.affordance}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              &gt;
            </ThemedText>
          </View>
        </View>
      </GlassView>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: Radius.md,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  card: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: 'hidden',
  },
  content: {
    minHeight: 96,
    padding: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  textBlock: {
    flex: 1,
    gap: Spacing.one,
  },
  name: {
    fontSize: 26,
    lineHeight: 34,
  },
  affordance: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
})
