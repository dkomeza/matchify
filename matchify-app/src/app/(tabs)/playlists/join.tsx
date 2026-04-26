import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { gql, useClient, useMutation } from 'urql'

import { BottomSheet } from '@/components/ui/bottom-sheet'
import { GlassInput } from '@/components/ui/glass-input'
import { PrimaryButton } from '@/components/ui/primary-button'
import { ThemedText } from '@/components/themed-text'
import { Colors, Spacing } from '@/constants/theme'
import { refreshMyPlaylists } from '@/lib/graphql/playlists'

const JOIN_PLAYLIST_MUTATION = gql`
  mutation JoinPlaylist($inviteCode: String!) {
    joinPlaylist(inviteCode: $inviteCode) {
      id
    }
  }
`

type JoinPlaylistData = {
  joinPlaylist: {
    id: string
  }
}

type JoinPlaylistVariables = {
  inviteCode: string
}

export default function JoinPlaylistScreen() {
  const client = useClient()
  const [{ fetching }, executeJoin] = useMutation<JoinPlaylistData, JoinPlaylistVariables>(JOIN_PLAYLIST_MUTATION)
  const [inviteCode, setInviteCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const submit = async () => {
    const code = inviteCode.trim().toUpperCase()
    setCodeError(null)
    setSubmitError(null)

    if (!/^[A-Z0-9]{6,8}$/.test(code)) {
      setCodeError('Invite code must be 6-8 characters.')
      return
    }

    const result = await executeJoin({ inviteCode: code })

    if (result.error) {
      setSubmitError(result.error.message)
      return
    }

    const playlistId = result.data?.joinPlaylist.id
    if (!playlistId) {
      setSubmitError('Playlist could not be joined.')
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
          Join with invite
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Enter the invite code shared by your group.
        </ThemedText>
      </View>

      <View style={styles.form}>
        <View style={styles.field}>
          <ThemedText type="smallBold">Invite code</ThemedText>
          <GlassInput
            placeholder="Invite code"
            value={inviteCode}
            onChangeText={(value) => {
              setInviteCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))
              if (codeError) setCodeError(null)
            }}
            error={codeError}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            maxLength={8}
          />
          {codeError ? (
            <ThemedText selectable type="small" style={styles.errorText}>
              {codeError}
            </ThemedText>
          ) : null}
        </View>
      </View>

      {submitError ? (
        <ThemedText selectable type="small" style={styles.errorText}>
          {submitError}
        </ThemedText>
      ) : null}

      <PrimaryButton disabled={fetching} onPress={submit}>
        {fetching ? 'Joining...' : 'Join playlist'}
      </PrimaryButton>
    </BottomSheet>
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
