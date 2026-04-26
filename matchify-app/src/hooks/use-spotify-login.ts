import { useCallback, useEffect, useState } from 'react'
import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import { gql, useMutation } from 'urql'

import { useAuthStore } from '@/store/auth-store'
import type { SpotifyUser } from '@/store/auth-store'

WebBrowser.maybeCompleteAuthSession()

const CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID
if (!CLIENT_ID) {
  throw new Error('EXPO_PUBLIC_SPOTIFY_CLIENT_ID is not set in .env.local')
}

const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
}

const LOGIN_WITH_SPOTIFY_MUTATION = gql`
  mutation LoginWithSpotify($code: String!, $redirectUri: String!) {
    loginWithSpotify(code: $code, redirectUri: $redirectUri) {
      token
      user {
        id
        displayName
        profileImageUrl
      }
    }
  }
`

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface LoginWithSpotifyData {
  loginWithSpotify: {
    token: string
    user: {
      id: string
      displayName: string
      profileImageUrl: string | null
    }
  }
}

interface LoginWithSpotifyVariables {
  code: string
  redirectUri: string
}

export function useSpotifyLogin() {
  const setSession = useAuthStore((s) => s.setSession)
  const [loginState, executeLogin] = useMutation<
    LoginWithSpotifyData,
    LoginWithSpotifyVariables
  >(LOGIN_WITH_SPOTIFY_MUTATION)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'matchify',
    path: 'redirect',
  })

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID!,
      scopes: ['user-read-email', 'playlist-modify-public', 'playlist-modify-private'],
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: false,
    },
    DISCOVERY
  )

  const completeLogin = useCallback(
    async (code: string) => {
      try {
        const result = await executeLogin({ code, redirectUri })

        if (result.error) {
          throw new Error(result.error.message)
        }

        const payload = result.data?.loginWithSpotify
        if (!payload) {
          throw new Error('Spotify login did not return a session.')
        }

        const user: SpotifyUser = {
          id: String(payload.user.id),
          displayName: payload.user.displayName,
          imageUrl: payload.user.profileImageUrl,
        }

        setSession(payload.token, '', Date.now() + SESSION_TTL_MS, user)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Spotify login failed.')
      } finally {
        setIsLoading(false)
      }
    },
    [executeLogin, redirectUri, setSession]
  )

  useEffect(() => {
    if (!response) return

    if (response.type === 'success') {
      const code = response.params.code

      if (!code) {
        setError('Spotify did not return an authorization code.')
        setIsLoading(false)
        return
      }

      completeLogin(code)
      return
    }

    if (response.type === 'error') {
      setError(response.error?.message ?? 'Spotify login failed.')
      setIsLoading(false)
      return
    }

    if (response.type === 'cancel' || response.type === 'dismiss') {
      setError('Spotify login was cancelled.')
      setIsLoading(false)
    }
  }, [completeLogin, response])

  const login = useCallback(() => {
    if (!request) {
      setError('Spotify login is not ready yet.')
      return
    }

    setIsLoading(true)
    setError(null)
    promptAsync().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not open Spotify login.')
      setIsLoading(false)
    })
  }, [promptAsync, request])

  return {
    login,
    isLoading: isLoading || loginState.fetching,
    error,
    ready: !!request,
    redirectUri,
  }
}
