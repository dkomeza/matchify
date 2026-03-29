import { useState, useEffect } from 'react'
import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import { useAuthStore } from '@/store/auth-store'
import type { SpotifyUser } from '@/store/auth-store'

WebBrowser.maybeCompleteAuthSession()

const CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID!

const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
}

export function useSpotifyLogin() {
  const setSession = useAuthStore((s) => s.setSession)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'matchify' })

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID,
      scopes: ['user-read-private', 'user-read-email'],
      usePKCE: true,
      redirectUri,
    },
    DISCOVERY
  )

  useEffect(() => {
    if (!response) return
    if (response.type === 'success') {
      exchangeCodeForSession(response.params.code)
    } else if (response.type === 'error') {
      setError(response.error?.message ?? 'Authentication failed')
      setIsLoading(false)
    } else {
      // cancelled or dismissed
      setIsLoading(false)
    }
  }, [response])

  async function exchangeCodeForSession(code: string) {
    if (!request?.codeVerifier) {
      setError('Authentication request not initialized')
      setIsLoading(false)
      return
    }
    try {
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: CLIENT_ID,
          code_verifier: request.codeVerifier,
        }).toString(),
      })
      if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`)
      const tokens = await tokenRes.json()

      const profileRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (!profileRes.ok) throw new Error(`Profile fetch failed: ${profileRes.status}`)
      const profile = await profileRes.json()

      const user: SpotifyUser = {
        id: profile.id,
        displayName: profile.display_name ?? profile.id,
        imageUrl: profile.images?.[0]?.url ?? null,
      }

      setSession(
        tokens.access_token,
        tokens.refresh_token ?? '',
        Date.now() + tokens.expires_in * 1000,
        user
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  const login = () => {
    setIsLoading(true)
    setError(null)
    promptAsync()
  }

  return { login, isLoading, error, ready: !!request }
}
