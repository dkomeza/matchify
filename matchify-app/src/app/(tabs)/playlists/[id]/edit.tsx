import { useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useClient, useMutation, useQuery } from 'urql'

import { BottomSheet } from '@/components/ui/bottom-sheet'
import { GlassInput } from '@/components/ui/glass-input'
import { PrimaryButton } from '@/components/ui/primary-button'
import { ThemedText } from '@/components/themed-text'
import { Colors, Spacing } from '@/constants/theme'
import {
  PLAYLIST_DETAIL_QUERY,
  UPDATE_PLAYLIST_MUTATION,
  refreshMyPlaylists,
} from '@/lib/graphql/playlists'

type EditPlaylistDetail = {
  id: string
  name: string
  description?: string | null
  voteThreshold: number
  members: { id: string }[]
}

type PlaylistDetailData = {
  playlist: EditPlaylistDetail | null
}

type UpdatePlaylistData = {
  updatePlaylist: EditPlaylistDetail
}

type UpdatePlaylistVariables = {
  id: string
  input: {
    name: string
    description: string
    voteThreshold?: number | null
  }
}

export default function EditPlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const client = useClient()
  const [{ data, fetching: loading, error: loadError }] = useQuery<PlaylistDetailData>({
    query: PLAYLIST_DETAIL_QUERY,
    variables: { id },
    pause: !id,
  })
  const [{ fetching: saving }, executeUpdate] = useMutation<UpdatePlaylistData, UpdatePlaylistVariables>(
    UPDATE_PLAYLIST_MUTATION,
  )
  const playlist = data?.playlist
  const memberCount = playlist?.members.length ?? 0
  const [hasHydrated, setHasHydrated] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [voteThreshold, setVoteThreshold] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [thresholdError, setThresholdError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!playlist || hasHydrated) return

    setName(playlist.name)
    setDescription(playlist.description ?? '')
    setVoteThreshold(String(playlist.voteThreshold))
    setHasHydrated(true)
  }, [hasHydrated, playlist])

  const submit = async () => {
    if (!id || !playlist) return

    const trimmedName = name.trim()
    const trimmedDescription = description.trim()
    const trimmedThreshold = voteThreshold.trim()
    const parsedThreshold = Number(trimmedThreshold)

    setNameError(null)
    setThresholdError(null)
    setSubmitError(null)

    if (!trimmedName) {
      setNameError('Name is required.')
      return
    }

    if (!trimmedThreshold || !Number.isInteger(parsedThreshold) || parsedThreshold < 1) {
      setThresholdError('Vote threshold must be a positive number.')
      return
    }

    if (parsedThreshold > memberCount) {
      setThresholdError(`Vote threshold cannot exceed ${memberCount} ${memberCount === 1 ? 'member' : 'members'}.`)
      return
    }

    const result = await executeUpdate({
      id,
      input: {
        name: trimmedName,
        description: trimmedDescription,
        voteThreshold: parsedThreshold,
      },
    })

    if (result.error) {
      setSubmitError(result.error.message)
      return
    }

    await Promise.all([
      refreshMyPlaylists(client),
      client
        .query(PLAYLIST_DETAIL_QUERY, { id }, { requestPolicy: 'network-only' })
        .toPromise(),
    ])

    router.back()
  }

  const isBusy = loading || saving || !playlist

  return (
    <BottomSheet onClose={router.back}>
      <View style={styles.header}>
        <ThemedText type="subtitle" style={styles.title}>
          Edit playlist
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Update the room details people see before voting.
        </ThemedText>
      </View>

      {loadError ? (
        <ThemedText selectable type="small" style={styles.errorText}>
          {loadError.message}
        </ThemedText>
      ) : null}

      <View style={styles.form}>
        <Field label="Name" error={nameError}>
          <GlassInput
            placeholder="Name"
            value={name}
            onChangeText={(value) => {
              setName(value)
              if (nameError) setNameError(null)
            }}
            error={nameError}
            autoFocus
            returnKeyType="next"
          />
        </Field>

        <Field label="Description">
          <GlassInput placeholder="Description" value={description} onChangeText={setDescription} returnKeyType="next" />
        </Field>

        <Field label="Vote threshold" error={thresholdError}>
          <GlassInput
            placeholder="Vote threshold"
            value={voteThreshold}
            onChangeText={(value) => {
              setVoteThreshold(value.replace(/\D/g, ''))
              if (thresholdError) setThresholdError(null)
            }}
            error={thresholdError}
            keyboardType="number-pad"
          />
        </Field>
      </View>

      {submitError ? (
        <ThemedText selectable type="small" style={styles.errorText}>
          {submitError}
        </ThemedText>
      ) : null}

      <PrimaryButton disabled={isBusy} onPress={submit}>
        {saving ? 'Saving...' : 'Save changes'}
      </PrimaryButton>
    </BottomSheet>
  )
}

function Field({ children, error, label }: { children: ReactNode; error?: string | null; label: string }) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      {children}
      {error ? (
        <ThemedText selectable type="small" style={styles.errorText}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.two,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
  },
  form: {
    gap: Spacing.three,
  },
  field: {
    gap: Spacing.two,
  },
  errorText: {
    color: Colors.skip,
  },
})
