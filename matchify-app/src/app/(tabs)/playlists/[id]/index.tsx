import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { PencilIcon, Trash2Icon } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useClient, useMutation, useQuery, useSubscription } from "urql";

import { GlassView } from "@/components/glass-view";
import {
  MemberAvatar,
  type MemberAvatarMember,
} from "@/components/playlist/member-avatar";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { TrackRow, type TrackRowTrack } from "@/components/track/track-row";
import { BackButton } from "@/components/ui/back-button";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Colors, Radius, ScreenPadding, Spacing } from "@/constants/theme";
import {
  DELETE_PLAYLIST_MUTATION,
  DELETE_TRACK_MUTATION,
  PLAYLIST_DETAIL_QUERY,
  refreshMyPlaylists,
  TRACK_APPROVED_SUBSCRIPTION,
} from "@/lib/graphql/playlists";
import { useAuthStore } from "@/store/auth";
import { useSubscriptionConnectionStatus } from "@/lib/subscription-status";

type PlaylistTrack = TrackRowTrack & {
  createdAt?: string | null;
};

type PlaylistDetail = {
  id: string;
  name: string;
  description?: string | null;
  ownerId: string;
  inviteCode: string;
  voteThreshold: number;
  state: "SEEDING" | "ACTIVE";
  members: MemberAvatarMember[];
  tracks: PlaylistTrack[];
  proposals: { id: string }[];
};

type PlaylistDetailData = {
  playlist: PlaylistDetail | null;
};

type TrackApprovedData = {
  trackApproved?: PlaylistTrack | null;
};

type DeletePlaylistData = {
  deletePlaylist: boolean;
};

type DeletePlaylistVariables = {
  id: string;
};

type DeleteTrackData = {
  deleteTrack: boolean;
};

type DeleteTrackVariables = {
  trackId: string;
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
  const client = useClient();
  const userId = useAuthStore((state) => state.user?.id);
  const [copied, setCopied] = useState(false);
  const [liveTracks, setLiveTracks] = useState<PlaylistTrack[]>([]);
  const [hiddenTrackIds, setHiddenTrackIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [deletingTrackIds, setDeletingTrackIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [newTrackIds, setNewTrackIds] = useState<Set<string>>(() => new Set());
  const [approvalToast, setApprovalToast] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [seedPromptPlaylistId, setSeedPromptPlaylistId] = useState<
    string | null
  >(null);
  const [dismissedSeedPromptId, setDismissedSeedPromptId] = useState<
    string | null
  >(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscriptionStatus = useSubscriptionConnectionStatus();
  const [{ data, fetching, error }, executeQuery] =
    useQuery<PlaylistDetailData>({
      query: PLAYLIST_DETAIL_QUERY,
      variables: { id },
      pause: !id,
    });
  const [{ fetching: deletingPlaylist }, executeDeletePlaylist] = useMutation<
    DeletePlaylistData,
    DeletePlaylistVariables
  >(DELETE_PLAYLIST_MUTATION);
  const [, executeDeleteTrack] = useMutation<
    DeleteTrackData,
    DeleteTrackVariables
  >(DELETE_TRACK_MUTATION);

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
    () =>
      mergeTracks(playlist?.tracks ?? [], liveTracks).filter(
        (track) => !hiddenTrackIds.has(track.id),
      ),
    [hiddenTrackIds, liveTracks, playlist?.tracks],
  );
  const isInitialLoading = fetching && !data;
  const isReconnecting = subscriptionStatus === "reconnecting";
  const isPlaylistAdmin = Boolean(
    playlist && userId && playlist.ownerId === userId,
  );
  const isSeeding = playlist?.state === "SEEDING";
  const isReadyForVoting = (playlist?.proposals.length ?? 0) > 0;
  const showInactivePlaceholder = Boolean(
    playlist && !isPlaylistAdmin && isSeeding,
  );

  useEffect(() => {
    setLiveTracks([]);
    setHiddenTrackIds(new Set());
    setDeletingTrackIds(new Set());
    setNewTrackIds(new Set());
    setApprovalToast(null);
    setDeleteError(null);
    setSeedPromptPlaylistId(null);
    setDismissedSeedPromptId(null);
  }, [id]);

  useEffect(() => {
    if (!playlist) return;

    if (!isPlaylistAdmin || !isSeeding) {
      setSeedPromptPlaylistId(null);
      return;
    }

    if (dismissedSeedPromptId !== playlist.id) {
      setSeedPromptPlaylistId(playlist.id);
    }
  }, [dismissedSeedPromptId, isPlaylistAdmin, isSeeding, playlist]);

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

  const openEdit = () => {
    router.push(`/(tabs)/playlists/${id}/edit`);
  };

  const deletePlaylist = async () => {
    if (!playlist || deletingPlaylist) return;

    setDeleteError(null);
    const result = await executeDeletePlaylist({ id: playlist.id });

    if (result.error || !result.data?.deletePlaylist) {
      setDeleteError(result.error?.message ?? "Playlist could not be deleted.");
      return;
    }

    await refreshMyPlaylists(client);
    router.replace("/playlists");
  };

  const confirmDeletePlaylist = () => {
    if (!playlist) return;

    Alert.alert(
      "Delete playlist?",
      `This will remove "${playlist.name}" and all songs in it.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void deletePlaylist(),
        },
      ],
    );
  };

  const openSeedSearch = () => {
    if (playlist) {
      setDismissedSeedPromptId(playlist.id);
    }
    setSeedPromptPlaylistId(null);
    router.push(`/(tabs)/playlists/${id}/search`);
  };

  const dismissSeedPrompt = () => {
    if (playlist) {
      setDismissedSeedPromptId(playlist.id);
    }
    setSeedPromptPlaylistId(null);
  };

  const proposeTrack = () => {
    router.push(`/(tabs)/playlists/${id}/search?mode=propose`);
  };

  const deleteTrack = async (track: PlaylistTrack) => {
    setDeleteError(null);
    setDeletingTrackIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.add(track.id);
      return nextIds;
    });

    const result = await executeDeleteTrack({ trackId: track.id });

    setDeletingTrackIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(track.id);
      return nextIds;
    });

    if (result.error || !result.data?.deleteTrack) {
      setDeleteError(result.error?.message ?? "Track could not be deleted.");
      return;
    }

    setHiddenTrackIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.add(track.id);
      return nextIds;
    });
    setLiveTracks((currentTracks) =>
      currentTracks.filter((currentTrack) => currentTrack.id !== track.id),
    );
  };

  const refresh = () => {
    setDeleteError(null);
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
                canDelete={isPlaylistAdmin}
                isDeleting={deletingTrackIds.has(item.id)}
                onDelete={() => void deleteTrack(item)}
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
                isPlaylistAdmin={isPlaylistAdmin}
                isReadyForVoting={isReadyForVoting}
                copied={copied}
                deletingPlaylist={deletingPlaylist}
                onCopyInviteCode={copyInviteCode}
                onEdit={openEdit}
                onDelete={confirmDeletePlaylist}
                onStartVoting={startVoting}
                onProposeTrack={proposeTrack}
              />
            }
            ListFooterComponent={
              deleteError ? (
                <ThemedText selectable type="small" style={styles.deleteError}>
                  {deleteError}
                </ThemedText>
              ) : null
            }
            ListEmptyComponent={
              showInactivePlaceholder ? <InactivePlaylist /> : <EmptyTracks />
            }
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

        <SeedTracksPrompt
          visible={Boolean(playlist && seedPromptPlaylistId === playlist.id)}
          onSeedTracks={openSeedSearch}
          onDismiss={dismissSeedPrompt}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function ApprovedTrackRow({
  track,
  isNew,
  canDelete,
  isDeleting,
  onDelete,
  onAnimated,
}: {
  track: PlaylistTrack;
  isNew: boolean;
  canDelete: boolean;
  isDeleting: boolean;
  onDelete: () => void;
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

  const renderRightActions = () => (
    <View style={styles.deleteTrackActionWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${track.title}`}
        disabled={isDeleting}
        onPress={onDelete}
        style={({ pressed }) => [
          pressed && styles.deleteTrackActionPressed,
          isDeleting && styles.disabledAction,
          styles.deleteTrackAction,
        ]}
      >
        <Trash2Icon color={Colors.text} size={26} />
      </Pressable>
    </View>
  );

  const row = <TrackRow track={track} />;

  return (
    <Animated.View style={animatedStyle}>
      {canDelete ? (
        <Swipeable
          enabled={!isDeleting}
          friction={2}
          overshootRight={false}
          renderRightActions={renderRightActions}
          rightThreshold={36}
          containerStyle={styles.swipeContainer}
          childrenContainerStyle={styles.swipeForeground}
        >
          {row}
        </Swipeable>
      ) : (
        row
      )}
    </Animated.View>
  );
}

function PlaylistHeader({
  playlist,
  isPlaylistAdmin,
  isReadyForVoting,
  copied,
  deletingPlaylist,
  onCopyInviteCode,
  onEdit,
  onDelete,
  onStartVoting,
  onProposeTrack,
}: {
  playlist: PlaylistDetail;
  isPlaylistAdmin: boolean;
  isReadyForVoting: boolean;
  copied: boolean;
  deletingPlaylist: boolean;
  onCopyInviteCode: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStartVoting: () => void;
  onProposeTrack: () => void;
}) {
  const description = playlist.description?.trim();

  return (
    <View style={styles.header}>
      <View style={styles.navRow}>
        <BackButton />
        <View style={styles.headerActions}>
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
          {isPlaylistAdmin ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${playlist.name}`}
                onPress={onEdit}
                style={({ pressed }) => [
                  styles.editPressable,
                  pressed && styles.pressed,
                ]}
              >
                <GlassView
                  glassEffectStyle="clear"
                  colorScheme="dark"
                  style={styles.editButton}
                >
                  <PencilIcon color={Colors.text} size={18} />
                </GlassView>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${playlist.name}`}
                disabled={deletingPlaylist}
                onPress={onDelete}
                style={({ pressed }) => [
                  styles.editPressable,
                  pressed && styles.pressed,
                  deletingPlaylist && styles.disabledAction,
                ]}
              >
                <GlassView
                  glassEffectStyle="clear"
                  colorScheme="dark"
                  style={[styles.editButton, styles.deletePlaylistButton]}
                >
                  <Trash2Icon color={Colors.skip} size={18} />
                </GlassView>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>

      <View style={styles.titleBlock}>
        <ThemedText type="title" numberOfLines={2} style={styles.title}>
          {playlist.name}
        </ThemedText>

        {description ? (
          <ThemedText
            type="small"
            themeColor="textSecondary"
            numberOfLines={3}
            style={styles.description}
          >
            {description}
          </ThemedText>
        ) : null}
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

      {isReadyForVoting ? (
        <View style={styles.actions}>
          <PrimaryButton onPress={onStartVoting}>Start Voting</PrimaryButton>
          <Pressable
            accessibilityRole="button"
            onPress={onProposeTrack}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <GlassView
              glassEffectStyle="clear"
              colorScheme="dark"
              style={styles.secondaryAction}
            >
              <ThemedText type="smallBold">Propose a track</ThemedText>
            </GlassView>
          </Pressable>
        </View>
      ) : null}

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

function SeedTracksPrompt({
  visible,
  onSeedTracks,
  onDismiss,
}: {
  visible: boolean;
  onSeedTracks: () => void;
  onDismiss: () => void;
}) {
  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onDismiss}
    >
      <View style={styles.modalBackdrop}>
        <GlassView
          glassEffectStyle="regular"
          colorScheme="dark"
          style={styles.seedModal}
        >
          <ThemedText type="subtitle" style={styles.seedModalTitle}>
            Not enough tracks yet
          </ThemedText>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.seedModalCopy}
          >
            Not enough tracks have been added. Seed tracks to start voting in
            this playlist.
          </ThemedText>
          <PrimaryButton onPress={onSeedTracks}>Search tracks</PrimaryButton>
          <Pressable
            accessibilityRole="button"
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.modalDismiss,
              pressed && styles.pressed,
            ]}
          >
            <ThemedText type="smallBold" themeColor="textSecondary">
              Not now
            </ThemedText>
          </Pressable>
        </GlassView>
      </View>
    </Modal>
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

function InactivePlaylist() {
  return (
    <GlassView
      glassEffectStyle="regular"
      colorScheme="dark"
      style={styles.emptyTracks}
    >
      <ThemedText type="smallBold">Playlist is not active yet</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        The playlist owner still needs to add tracks before voting can begin.
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
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
  },
  titleBlock: {
    gap: Spacing.two,
  },
  title: {
    fontSize: 42,
    lineHeight: 46,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  description: {
    maxWidth: 620,
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
  editPressable: {
    borderRadius: Radius.full,
  },
  editButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  deletePlaylistButton: {
    borderColor: Colors.skip,
    backgroundColor: Colors.skipGlow,
  },
  section: {
    gap: Spacing.three,
  },
  members: {
    gap: Spacing.three,
    paddingRight: ScreenPadding,
  },
  actions: {
    gap: Spacing.three,
  },
  secondaryAction: {
    minHeight: 48,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
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
  swipeContainer: {
    width: "100%",
    alignSelf: "stretch",
    overflow: "hidden",
  },
  swipeForeground: {
    minHeight: 64,
    width: "100%",
    backgroundColor: Colors.background,
  },
  deleteTrackActionWrap: {
    marginLeft: Spacing.two,
    borderTopRightRadius: Radius.sm,
    borderBottomRightRadius: Radius.sm,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.skip,
    paddingHorizontal: Spacing.three,
  },
  deleteTrackAction: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.two,
    flex: 1,
    backgroundColor: Colors.textSecondary,
  },
  deleteTrackActionPressed: {
    opacity: 0.82,
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
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  disabledAction: {
    opacity: 0.55,
  },
  deleteError: {
    marginTop: Spacing.three,
    color: Colors.skip,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: ScreenPadding,
    backgroundColor: "rgba(0, 0, 0, 0.62)",
  },
  seedModal: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: Spacing.four,
    gap: Spacing.three,
    overflow: "hidden",
  },
  seedModalTitle: {
    textAlign: "center",
  },
  seedModalCopy: {
    textAlign: "center",
  },
  modalDismiss: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
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
