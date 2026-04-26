import { useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { gql, useClient, useMutation } from 'urql'

import { BottomSheet } from '@/components/ui/bottom-sheet'
import { GlassInput } from '@/components/ui/glass-input'
import { PrimaryButton } from '@/components/ui/primary-button'
import { ThemedText } from '@/components/themed-text'
import { Colors, Spacing } from '@/constants/theme'
import { refreshMyPlaylists } from '@/lib/graphql/playlists'

const CREATE_PLAYLIST_MUTATION = gql`
  mutation CreatePlaylist($input: CreatePlaylistInput!) {
    createPlaylist(input: $input) {
      id
    }
  }
`

type CreatePlaylistData = {
  createPlaylist: {
    id: string
  }
}

type CreatePlaylistVariables = {
  input: {
    name: string
    description?: string | null
    voteThreshold?: number | null
  }
}

export default function CreatePlaylistScreen() {
  const client = useClient()
  const [{ fetching }, executeCreate] = useMutation<CreatePlaylistData, CreatePlaylistVariables>(CREATE_PLAYLIST_MUTATION)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [voteThreshold, setVoteThreshold] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [thresholdError, setThresholdError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const submit = async () => {
    const trimmedName = name.trim()
    const trimmedDescription = description.trim()
    const trimmedThreshold = voteThreshold.trim()
    const parsedThreshold = trimmedThreshold ? Number(trimmedThreshold) : undefined

    setNameError(null)
    setThresholdError(null)
    setSubmitError(null)

    if (!trimmedName) {
      setNameError('Name is required.')
      return
    }

    if (parsedThreshold !== undefined && (!Number.isInteger(parsedThreshold) || parsedThreshold < 1)) {
      setThresholdError('Vote threshold must be a positive number.')
      return
    }

    const result = await executeCreate({
      input: {
        name: trimmedName,
        description: trimmedDescription || null,
        voteThreshold: parsedThreshold ?? null,
      },
    })

    if (result.error) {
      setSubmitError(result.error.message)
      return
    }

    const playlistId = result.data?.createPlaylist.id
    if (!playlistId) {
      setSubmitError('Playlist could not be created.')
      return
    }

    await refreshMyPlaylists(client)
    router.back()
    router.replace(`/playlists/${playlistId}`)
  }

  return (
    <BottomSheet onClose={router.back}>
      <View style={styles.header}>
        <ThemedText type="subtitle" style={styles.title}>
          New playlist
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Start a shared room for voting on the next tracks.
        </ThemedText>
      </View>

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

      <PrimaryButton disabled={fetching} onPress={submit}>
        {fetching ? 'Creating...' : 'Create playlist'}
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
