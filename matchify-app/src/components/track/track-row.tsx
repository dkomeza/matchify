import { Image, StyleSheet, View } from 'react-native'

import { ThemedText } from '@/components/themed-text'
import { Colors, Radius, Spacing } from '@/constants/theme'

export type TrackRowTrack = {
  id: string
  title: string
  artist: string
  albumArtUrl?: string | null
  durationMs: number
  likeCount: number
}

type TrackRowProps = {
  track: TrackRowTrack
}

export function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function TrackRow({ track }: TrackRowProps) {
  return (
    <View testID={`track-row-${track.id}`} style={styles.row}>
      {track.albumArtUrl ? (
        <Image testID={`track-art-${track.id}`} source={{ uri: track.albumArtUrl }} style={styles.artwork} />
      ) : (
        <View testID={`track-art-${track.id}`} style={[styles.artwork, styles.artworkFallback]} />
      )}

      <View style={styles.details}>
        <ThemedText type="default" numberOfLines={1}>
          {track.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {track.artist}
        </ThemedText>
      </View>

      <ThemedText type="micro" themeColor="textTertiary" style={styles.duration}>
        {formatDuration(track.durationMs)}
      </ThemedText>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    backgroundColor: Colors.glassRaised,
  },
  artworkFallback: {
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  details: {
    flex: 1,
    minWidth: 0,
  },
  duration: {
    minWidth: 42,
    textAlign: 'right',
  },
})
