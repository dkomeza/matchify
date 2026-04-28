import { Image, Pressable, StyleSheet, View } from 'react-native'

import { ThemedText } from '@/components/themed-text'
import { Colors, Radius, Spacing } from '@/constants/theme'
import { formatDuration } from '@/components/track/track-row'

export type TrackSearchRowTrack = {
  spotifyTrackId: string
  title: string
  artist: string
  album?: string | null
  albumArtUrl?: string | null
  previewUrl?: string | null
  durationMs: number
}

type TrackSearchRowProps = {
  track: TrackSearchRowTrack
  selected: boolean
  selectionIndex?: number
  onToggle: (track: TrackSearchRowTrack) => void
}

export function TrackSearchRow({ track, selected, selectionIndex, onToggle }: TrackSearchRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => onToggle(track)}
      testID={`track-search-row-${track.spotifyTrackId}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {track.albumArtUrl ? (
        <Image
          testID={`track-search-art-${track.spotifyTrackId}`}
          source={{ uri: track.albumArtUrl }}
          style={styles.artwork}
        />
      ) : (
        <View testID={`track-search-art-${track.spotifyTrackId}`} style={[styles.artwork, styles.artworkFallback]}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            M
          </ThemedText>
        </View>
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

      <View style={[styles.checkSlot, selected && styles.checkSlotSelected]}>
        {selected ? (
          <ThemedText testID={`track-search-selected-${track.spotifyTrackId}`} type="micro" style={styles.checkmark}>
            {selectionIndex ?? '✓'}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.72,
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    backgroundColor: Colors.glassRaised,
  },
  artworkFallback: {
    alignItems: 'center',
    justifyContent: 'center',
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
  checkSlot: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkSlotSelected: {
    borderColor: Colors.like,
    backgroundColor: Colors.likeGlow,
  },
  checkmark: {
    color: Colors.like,
    fontWeight: '700',
    lineHeight: 14,
  },
})
