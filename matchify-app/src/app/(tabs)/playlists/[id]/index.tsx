import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useSubscription } from "urql";

import { GlassView } from "@/components/glass-view";
import {
  MemberAvatar,
  type MemberAvatarMember,
} from "@/components/playlist/member-avatar";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { TrackRow, type TrackRowTrack } from "@/components/track/track-row";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Colors, Radius, ScreenPadding, Spacing } from "@/constants/theme";
import {
  PLAYLIST_DETAIL_QUERY,
  TRACK_APPROVED_SUBSCRIPTION,
} from "@/lib/graphql/playlists";
import { useSubscriptionConnectionStatus } from "@/lib/subscription-status";

type PlaylistTrack = TrackRowTrack & {
  createdAt?: string | null;
};

type PlaylistDetail = {
  id: string;
  name: string;
  inviteCode: string;
  voteThreshold: number;
  members: MemberAvatarMember[];
  tracks: PlaylistTrack[];
};

type PlaylistDetailData = {
  playlist: PlaylistDetail | null;
};

type TrackApprovedData = {
  trackApproved?: PlaylistTrack | null;
};

const byApprovalTime = (left: PlaylistTrack, right: PlaylistTrack) => {
  const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
  const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;

  return leftTime - rightTime;
};

const mergeTracks = (
  queryTracks: PlaylistTrack[],
  liveTracks: PlaylistTrack[],
) =>
  Array.from(
    [...queryTracks, ...liveTracks]
      .reduce(
        (tracksById, track) => tracksById.set(track.id, track),
        new Map<string, PlaylistTrack>(),
      )
      .values(),
  ).sort(byApprovalTime);

export default function PlaylistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [copied, setCopied] = useState(false);
  const [liveTracks, setLiveTracks] = useState<PlaylistTrack[]>([]);
  const [newTrackIds, setNewTrackIds] = useState<Set<string>>(() => new Set());
  const [approvalToast, setApprovalToast] = useState<string | null>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscriptionStatus = useSubscriptionConnectionStatus();
  const [{ data, fetching, error }, executeQuery] =
    useQuery<PlaylistDetailData>({
      query: PLAYLIST_DETAIL_QUERY,
      variables: { id },
      pause: !id,
    });

  useSubscription<TrackApprovedData, PlaylistTrack[], { playlistId: string }>(
    {
      query: TRACK_APPROVED_SUBSCRIPTION,
      variables: { playlistId: id },
      pause: !id,
    },
    (tracks = [], event) => {
      const approvedTrack = event.trackApproved;

      if (!approvedTrack) return tracks;

      setLiveTracks((currentTracks) =>
        mergeTracks(currentTracks, [approvedTrack]),
      );
      setNewTrackIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.add(approvedTrack.id);
        return nextIds;
      });
      setApprovalToast(`🎵 ${approvedTrack.title} was approved!`);

      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }

      toastTimeoutRef.current = setTimeout(() => {
        setApprovalToast(null);
        toastTimeoutRef.current = null;
      }, 2800);

      return [
        ...tracks.filter((track) => track.id !== approvedTrack.id),
        approvedTrack,
      ].sort(byApprovalTime);
    },
  );

  const playlist = data?.playlist;
  const tracks = useMemo(
    () => mergeTracks(playlist?.tracks ?? [], liveTracks),
    [liveTracks, playlist?.tracks],
  );
  const isInitialLoading = fetching && !data;
  const isReconnecting = subscriptionStatus === "reconnecting";

  useEffect(() => {
    setLiveTracks([]);
    setNewTrackIds(new Set());
    setApprovalToast(null);
  }, [id]);

  useEffect(
    () => () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    },
    [],
  );

  const copyInviteCode = async () => {
    if (!playlist?.inviteCode) return;

    await Clipboard.setStringAsync(playlist.inviteCode);
    void Haptics.selectionAsync();
    setCopied(true);

    if (copiedTimeoutRef.current) {
      clearTimeout(copiedTimeoutRef.current);
    }

    copiedTimeoutRef.current = setTimeout(() => {
      setCopied(false);
      copiedTimeoutRef.current = null;
    }, 1600);
  };

  const startVoting = () => {
    router.push(
      `/(tabs)/playlists/${id}/vote?playlistName=${encodeURIComponent(playlist?.name ?? "Vote")}`,
    );
  };

  const seedTracks = () => {
    router.push(`/(tabs)/playlists/${id}/search`);
  };

  const refresh = () => {
    void executeQuery({ requestPolicy: "network-only" });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {isInitialLoading ? (
          <LoadingState />
        ) : error || !playlist ? (
          <ErrorState onRetry={refresh} />
        ) : (
          <FlatList
            testID="approved-tracks-list"
            data={tracks}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ApprovedTrackRow
                track={item}
                isNew={newTrackIds.has(item.id)}
                onAnimated={() => {
                  setNewTrackIds((currentIds) => {
                    if (!currentIds.has(item.id)) return currentIds;

                    const nextIds = new Set(currentIds);
                    nextIds.delete(item.id);
                    return nextIds;
                  });
                }}
              />
            )}
            contentContainerStyle={[
              styles.listContent,
              tracks.length === 0 && styles.emptyListContent,
            ]}
            ItemSeparatorComponent={() => (
              <View style={styles.trackSeparator} />
            )}
            ListHeaderComponent={
              <PlaylistHeader
                playlist={playlist}
                copied={copied}
                onCopyInviteCode={copyInviteCode}
                onStartVoting={startVoting}
              />
            }
            ListEmptyComponent={<EmptyTracks />}
            refreshing={fetching}
            onRefresh={refresh}
          />
        )}

        {isReconnecting && (
          <GlassView
            glassEffectStyle="regular"
            colorScheme="dark"
            style={styles.liveStatus}
          >
            <ThemedText type="micro" themeColor="textSecondary">
              Reconnecting live updates...
            </ThemedText>
          </GlassView>
        )}

        {approvalToast && (
          <GlassView
            glassEffectStyle="regular"
            colorScheme="dark"
            style={styles.approvalToast}
          >
            <ThemedText type="smallBold">{approvalToast}</ThemedText>
          </GlassView>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={seedTracks}
          style={({ pressed }) => [styles.proposeFab, pressed && styles.pressed]}
        >
          <GlassView
            glassEffectStyle="clear"
            colorScheme="dark"
            style={styles.proposePill}
          >
            <ThemedText type="smallBold" themeColor="brand">
              Seed tracks
            </ThemedText>
          </GlassView>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

function ApprovedTrackRow({
  track,
  isNew,
  onAnimated,
}: {
  track: PlaylistTrack;
  isNew: boolean;
  onAnimated: () => void;
}) {
  const translateX = useSharedValue(isNew ? 32 : 0);
  const opacity = useSharedValue(isNew ? 0 : 1);

  useEffect(() => {
    if (!isNew) return;

    translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
    opacity.value = withSpring(1, { damping: 18, stiffness: 180 });
    onAnimated();
  }, [isNew, onAnimated, opacity, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <TrackRow track={track} />
    </Animated.View>
  );
}

function PlaylistHeader({
  playlist,
  copied,
  onCopyInviteCode,
  onStartVoting,
}: {
  playlist: PlaylistDetail;
  copied: boolean;
  onCopyInviteCode: () => void;
  onStartVoting: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <ThemedText type="title" numberOfLines={2} style={styles.title}>
          {playlist.name}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Copy invite code ${playlist.inviteCode}`}
          onPress={onCopyInviteCode}
          style={({ pressed }) => [
            styles.invitePressable,
            pressed && styles.pressed,
          ]}
        >
          <GlassView
            glassEffectStyle="clear"
            colorScheme="dark"
            style={[styles.inviteChip, copied && styles.inviteChipCopied]}
          >
            <ThemedText
              type="micro"
              themeColor={copied ? "text" : "textSecondary"}
              style={styles.inviteLabel}
            >
              {copied ? "Copied" : "Invite"}
            </ThemedText>
            <ThemedText type="micro" style={styles.inviteCode}>
              {playlist.inviteCode}
            </ThemedText>
          </GlassView>
        </Pressable>
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          Members
        </ThemedText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.members}
        >
          {playlist.members.map((member) => (
            <MemberAvatar key={member.id} member={member} />
          ))}
        </ScrollView>
      </View>

      <PrimaryButton onPress={onStartVoting}>Start Voting</PrimaryButton>

      <ThemedText
        type="smallBold"
        themeColor="textSecondary"
        style={styles.tracksTitle}
      >
        Approved Tracks
      </ThemedText>
    </View>
  );
}

function LoadingState() {
  return (
    <View style={styles.loadingWrap}>
      <View style={styles.loadingHeader} />
      {[0, 1, 2].map((item) => (
        <GlassView
          key={item}
          glassEffectStyle="regular"
          colorScheme="dark"
          style={styles.skeletonRow}
        >
          <View style={styles.skeletonArt} />
          <View style={styles.skeletonText}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonMeta} />
          </View>
        </GlassView>
      ))}
    </View>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.centerState}>
      <ThemedText type="subtitle" style={styles.centerTitle}>
        Playlist could not load
      </ThemedText>
      <ThemedText
        type="small"
        themeColor="textSecondary"
        style={styles.centerCopy}
      >
        Check your connection and try again.
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <GlassView
          glassEffectStyle="clear"
          colorScheme="dark"
          style={styles.retryPill}
        >
          <ThemedText type="smallBold">Retry</ThemedText>
        </GlassView>
      </Pressable>
    </View>
  );
}

function EmptyTracks() {
  return (
    <GlassView
      glassEffectStyle="regular"
      colorScheme="dark"
      style={styles.emptyTracks}
    >
      <ThemedText type="smallBold">No approved tracks yet</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Start voting to approve the first songs for this playlist.
      </ThemedText>
    </GlassView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: ScreenPadding,
    paddingBottom: 124,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  header: {
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.four,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.three,
  },
  title: {
    flex: 1,
    fontSize: 42,
    lineHeight: 46,
  },
  invitePressable: {
    borderRadius: Radius.full,
  },
  inviteChip: {
    minHeight: 44,
    minWidth: 98,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  inviteChipCopied: {
    borderColor: Colors.like,
    backgroundColor: Colors.likeGlow,
  },
  inviteLabel: {
    textTransform: "uppercase",
  },
  inviteCode: {
    letterSpacing: 0,
  },
  section: {
    gap: Spacing.three,
  },
  members: {
    gap: Spacing.three,
    paddingRight: ScreenPadding,
  },
  tracksTitle: {
    marginTop: Spacing.two,
    textTransform: "uppercase",
  },
  trackSeparator: {
    height: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.glassBorder,
  },
  liveStatus: {
    position: "absolute",
    top: 58,
    alignSelf: "center",
    minHeight: 32,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  approvalToast: {
    position: "absolute",
    left: ScreenPadding,
    right: ScreenPadding,
    bottom: 160,
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.like,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: Colors.likeGlow,
  },
  proposeFab: {
    position: "absolute",
    bottom: 96,
    left: "50%",
    transform: [{ translateX: "-50%" }],
    borderRadius: Radius.full,
  },
  proposePill: {
    minHeight: 52,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.four,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  loadingWrap: {
    flex: 1,
    padding: ScreenPadding,
    gap: Spacing.three,
  },
  loadingHeader: {
    width: "72%",
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.glassRaised,
    marginBottom: Spacing.three,
  },
  skeletonRow: {
    minHeight: 64,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: Spacing.two,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    overflow: "hidden",
  },
  skeletonArt: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    backgroundColor: Colors.glassRaised,
  },
  skeletonText: {
    flex: 1,
    gap: Spacing.two,
  },
  skeletonTitle: {
    width: "64%",
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: Colors.glassRaised,
  },
  skeletonMeta: {
    width: "42%",
    height: 12,
    borderRadius: Radius.full,
    backgroundColor: Colors.glass,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: ScreenPadding,
    paddingBottom: 96,
    gap: Spacing.three,
  },
  centerTitle: {
    textAlign: "center",
    fontSize: 28,
    lineHeight: 34,
  },
  centerCopy: {
    textAlign: "center",
    maxWidth: 280,
  },
  retryPill: {
    minHeight: 48,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: Spacing.four,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  emptyTracks: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: Spacing.four,
    gap: Spacing.two,
    overflow: "hidden",
  },
});
