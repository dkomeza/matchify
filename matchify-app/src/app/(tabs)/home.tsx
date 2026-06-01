import { Image } from 'expo-image'
import React from 'react'
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from 'urql'

import { GlassView } from '@/components/glass-view'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors, Radius, ScreenPadding, Spacing } from '@/constants/theme'
import { HOME_REPORT_QUERY } from '@/lib/graphql/reporting'
import { useAuthStore } from '@/store/auth-store'

type Overview = {
  joinedPlaylists: number
  tracksProposedByMe: number
  votesCastByMe: number
  approvedTracksFromMyProposals: number
  myApprovalRate: number
}

type PlaylistHealth = {
  playlistId: string
  name: string
  totalProposals: number
  approvedCount: number
  pendingCount: number
  skippedCount: number
  approvalRate: number
  totalVotesCast: number
  averageVotesPerProposal: number
}

type ActiveMember = {
  user: {
    id: string
    displayName: string
    profileImageUrl: string | null
  }
  votesCast: number
  tracksProposed: number
  participationRate: number
}

type ArtistStat = {
  artist: string
  approvedTracks: number
  averageDurationMs: number
}

type PendingTrack = {
  playlistId: string
  playlistName: string
  voteThreshold: number
  likesNeeded: number
  skipVotes: number
  track: {
    id: string
    title: string
    artist: string
    albumArtUrl: string
    likeCount: number
  }
}

type HomeReport = {
  overview: Overview
  playlistHealth: PlaylistHealth[]
  activeMembers: ActiveMember[]
  topArtists: ArtistStat[]
  pendingTracks: PendingTrack[]
}

type HomeReportData = {
  homeReport: HomeReport
}

const percent = (value: number) => `${Math.round(value * 100)}%`

const compact = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)

const minutes = (durationMs: number) => {
  if (!durationMs) return '0:00'

  const totalSeconds = Math.round(durationMs / 1000)
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60

  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function Home() {
  const user = useAuthStore((state) => state.user)
  const [{ data, fetching, error }, executeQuery] = useQuery<HomeReportData>({
    query: HOME_REPORT_QUERY,
    pause: !user,
  })

  if (!user) {
    return null
  }

  const report = data?.homeReport
  const isInitialLoading = fetching && !data

  const refresh = () => {
    void executeQuery({ requestPolicy: 'network-only' })
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={fetching && Boolean(data)}
              onRefresh={refresh}
              tintColor={Colors.text}
            />
          }
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <ThemedText type="micro" themeColor="textSecondary" style={styles.eyebrow}>
                Home report
              </ThemedText>
              <ThemedText type="subtitle" style={styles.title}>
                {user.displayName}
              </ThemedText>
            </View>
            {user.imageUrl ? (
              <Image source={user.imageUrl} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <ThemedText type="smallBold">{user.displayName.slice(0, 1)}</ThemedText>
              </View>
            )}
          </View>

          {isInitialLoading ? (
            <LoadingState />
          ) : error || !report ? (
            <ErrorState onRetry={refresh} />
          ) : report.overview.joinedPlaylists === 0 ? (
            <EmptyState />
          ) : (
            <>
              <OverviewGrid overview={report.overview} />
              <PlaylistHealthSection playlists={report.playlistHealth} />
              <PendingTracksSection tracks={report.pendingTracks} />
              <ActiveMembersSection members={report.activeMembers} />
              <TopArtistsSection artists={report.topArtists} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  )
}

function OverviewGrid({ overview }: { overview: Overview }) {
  const metricRows = [
    [
      { label: 'Joined', value: overview.joinedPlaylists.toString() },
      { label: 'Proposed', value: overview.tracksProposedByMe.toString() },
    ],
    [
      { label: 'Votes cast', value: overview.votesCastByMe.toString() },
      { label: 'Approved', value: overview.approvedTracksFromMyProposals.toString() },
    ],
  ]

  return (
    <View style={styles.metricGrid}>
      {metricRows.map((row) => (
        <View key={row.map((metric) => metric.label).join('-')} style={styles.metricRow}>
          {row.map((metric) => (
            <View key={metric.label} style={styles.metricCell}>
              <MetricCard label={metric.label} value={metric.value} />
            </View>
          ))}
        </View>
      ))}
      <MetricCard label="My approval" value={percent(overview.myApprovalRate)} />
    </View>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <GlassView glassEffectStyle="regular" colorScheme="dark" style={styles.metricCard}>
      <ThemedText type="micro" themeColor="textSecondary" style={styles.metricLabel} numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText type="subtitle" style={styles.metricValue} adjustsFontSizeToFit numberOfLines={1}>
        {value}
      </ThemedText>
    </GlassView>
  )
}

function PlaylistHealthSection({ playlists }: { playlists: PlaylistHealth[] }) {
  return (
    <ReportSection title="Playlist health" emptyLabel="No playlist activity yet">
      {playlists.map((playlist) => (
        <GlassView key={playlist.playlistId} glassEffectStyle="regular" colorScheme="dark" style={styles.healthCard}>
          <View style={styles.rowBetween}>
            <View style={styles.flexText}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {playlist.name}
              </ThemedText>
              <ThemedText type="micro" themeColor="textSecondary">
                {playlist.totalProposals} proposals · {playlist.totalVotesCast} votes
              </ThemedText>
            </View>
            <ThemedText type="smallBold" themeColor="like">
              {percent(playlist.approvalRate)}
            </ThemedText>
          </View>

          <View style={styles.statusTrack}>
            <StatusSegment count={playlist.approvedCount} total={playlist.totalProposals} color={Colors.like} />
            <StatusSegment count={playlist.pendingCount} total={playlist.totalProposals} color={Colors.accent} />
            <StatusSegment count={playlist.skippedCount} total={playlist.totalProposals} color={Colors.skip} />
          </View>

          <View style={styles.healthMeta}>
            <Meta label="Approved" value={playlist.approvedCount.toString()} />
            <Meta label="Pending" value={playlist.pendingCount.toString()} />
            <Meta label="Avg votes" value={compact(playlist.averageVotesPerProposal)} />
          </View>
        </GlassView>
      ))}
    </ReportSection>
  )
}

function PendingTracksSection({ tracks }: { tracks: PendingTrack[] }) {
  return (
    <ReportSection title="Closest to approval" emptyLabel="No pending proposals">
      {tracks.map((item) => (
        <GlassView key={item.track.id} glassEffectStyle="regular" colorScheme="dark" style={styles.trackCard}>
          <Image source={item.track.albumArtUrl} style={styles.albumArt} />
          <View style={styles.trackCopy}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {item.track.title}
            </ThemedText>
            <ThemedText type="micro" themeColor="textSecondary" numberOfLines={1}>
              {item.track.artist} · {item.playlistName}
            </ThemedText>
          </View>
          <View style={styles.trackVotes}>
            <ThemedText type="smallBold">{item.track.likeCount}/{item.voteThreshold}</ThemedText>
            <ThemedText type="micro" themeColor="textSecondary">
              {item.likesNeeded} left
            </ThemedText>
          </View>
        </GlassView>
      ))}
    </ReportSection>
  )
}

function ActiveMembersSection({ members }: { members: ActiveMember[] }) {
  return (
    <ReportSection title="Most active members" emptyLabel="No member activity yet">
      {members.map((member, index) => (
        <View key={member.user.id} style={styles.memberRow}>
          {member.user.profileImageUrl ? (
            <Image source={member.user.profileImageUrl} style={styles.memberAvatar} />
          ) : (
            <View style={styles.memberAvatarFallback}>
              <ThemedText type="micro">{member.user.displayName.slice(0, 1)}</ThemedText>
            </View>
          )}
          <View style={styles.flexText}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {index + 1}. {member.user.displayName}
            </ThemedText>
            <ThemedText type="micro" themeColor="textSecondary">
              {member.votesCast} votes · {member.tracksProposed} proposals
            </ThemedText>
          </View>
          <ThemedText type="smallBold">{percent(member.participationRate)}</ThemedText>
        </View>
      ))}
    </ReportSection>
  )
}

function TopArtistsSection({ artists }: { artists: ArtistStat[] }) {
  return (
    <ReportSection title="Taste breakdown" emptyLabel="No approved tracks yet">
      {artists.map((artist) => (
        <View key={artist.artist} style={styles.artistRow}>
          <View style={styles.flexText}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {artist.artist}
            </ThemedText>
            <ThemedText type="micro" themeColor="textSecondary">
              avg {minutes(artist.averageDurationMs)}
            </ThemedText>
          </View>
          <ThemedText type="smallBold">{artist.approvedTracks}</ThemedText>
        </View>
      ))}
    </ReportSection>
  )
}

function ReportSection({
  title,
  emptyLabel,
  children,
}: {
  title: string
  emptyLabel: string
  children: React.ReactNode
}) {
  const items = React.Children.toArray(children)

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      {items.length > 0 ? (
        <View style={styles.sectionStack}>{children}</View>
      ) : (
        <GlassView glassEffectStyle="clear" colorScheme="dark" style={styles.emptyPanel}>
          <ThemedText type="small" themeColor="textSecondary">
            {emptyLabel}
          </ThemedText>
        </GlassView>
      )}
    </View>
  )
}

function StatusSegment({ count, total, color }: { count: number; total: number; color: string }) {
  if (count === 0 || total === 0) return null

  return <View style={[styles.statusSegment, { flex: count, backgroundColor: color }]} />
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <ThemedText type="micro" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  )
}

function LoadingState() {
  return (
    <View style={styles.sectionStack}>
      {[0, 1, 2, 3].map((item) => (
        <GlassView key={item} glassEffectStyle="regular" colorScheme="dark" style={styles.skeletonCard}>
          <View style={styles.skeletonLineLarge} />
          <View style={styles.skeletonLineSmall} />
        </GlassView>
      ))}
    </View>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.centerState}>
      <ThemedText type="subtitle" style={styles.centerTitle}>
        Report could not load
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centerCopy}>
        Check your connection and try again.
      </ThemedText>
      <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => pressed && styles.pressed}>
        <GlassView glassEffectStyle="clear" colorScheme="dark" style={styles.retryButton}>
          <ThemedText type="smallBold">Retry</ThemedText>
        </GlassView>
      </Pressable>
    </View>
  )
}

function EmptyState() {
  return (
    <View style={styles.centerState}>
      <ThemedText type="subtitle" style={styles.centerTitle}>
        No reporting data yet
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centerCopy}>
        Join or create a playlist, propose tracks, and vote to populate this dashboard.
      </ThemedText>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    paddingTop: Spacing.three,
    paddingHorizontal: ScreenPadding,
    paddingBottom: 128,
    gap: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.glassRaised,
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.glassRaised,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  metricGrid: {
    gap: Spacing.two,
  },
  metricRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  metricCell: {
    flex: 1,
    minWidth: 0,
  },
  metricCard: {
    minHeight: 86,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: Spacing.three,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  metricLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  metricValue: {
    fontSize: 30,
    lineHeight: 36,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 0,
    color: Colors.textSecondary,
  },
  sectionStack: {
    gap: Spacing.two,
  },
  healthCard: {
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: Spacing.three,
    gap: Spacing.three,
    overflow: 'hidden',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  flexText: {
    flex: 1,
    minWidth: 0,
  },
  statusTrack: {
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.glassRaised,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  statusSegment: {
    height: 8,
  },
  healthMeta: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  metaItem: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.xs,
    backgroundColor: Colors.glass,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
  trackCard: {
    minHeight: 72,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    overflow: 'hidden',
  },
  albumArt: {
    width: 56,
    height: 56,
    borderRadius: Radius.xs,
    backgroundColor: Colors.glassRaised,
  },
  trackCopy: {
    flex: 1,
    minWidth: 0,
  },
  trackVotes: {
    minWidth: 58,
    alignItems: 'flex-end',
  },
  memberRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.glassRaised,
  },
  memberAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.glassRaised,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  artistRow: {
    minHeight: 50,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glassBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  emptyPanel: {
    minHeight: 72,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
    overflow: 'hidden',
  },
  skeletonCard: {
    height: 112,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: Spacing.three,
    justifyContent: 'center',
    gap: Spacing.two,
    overflow: 'hidden',
  },
  skeletonLineLarge: {
    width: '62%',
    height: 24,
    borderRadius: Radius.full,
    backgroundColor: Colors.glassRaised,
  },
  skeletonLineSmall: {
    width: '42%',
    height: 14,
    borderRadius: Radius.full,
    backgroundColor: Colors.glass,
  },
  centerState: {
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  centerTitle: {
    textAlign: 'center',
    fontSize: 28,
    lineHeight: 34,
  },
  centerCopy: {
    maxWidth: 320,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.72,
  },
})
