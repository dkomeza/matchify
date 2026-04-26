/* eslint-disable import/first, @typescript-eslint/no-require-imports */

process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID = 'spotify-client-id'
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000'

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}))

const mockPromptAsync = jest.fn()
let mockAuthResponse: unknown = null

jest.mock('expo-auth-session', () => ({
  ResponseType: { Code: 'code' },
  makeRedirectUri: jest.fn(() => 'matchify://redirect'),
  useAuthRequest: jest.fn(() => [{}, mockAuthResponse, mockPromptAsync]),
}))

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}))

const mockExecuteLogin = jest.fn()

jest.mock('urql', () => ({
  gql: jest.fn((strings: TemplateStringsArray) => strings.join('')),
  useMutation: jest.fn(() => [{ fetching: false }, mockExecuteLogin]),
}))

import { act, renderHook, waitFor } from '@testing-library/react-native'

const { useSpotifyLogin } = require('@/hooks/use-spotify-login')
const { useAuthStore } = require('@/store/auth-store')

beforeEach(() => {
  mockAuthResponse = null
  mockPromptAsync.mockReset()
  mockExecuteLogin.mockReset()
  useAuthStore.setState({
    token: null,
    user: null,
    isLoading: false,
  })
})

describe('useSpotifyLogin', () => {
  it('exchanges a successful Spotify auth code through the backend login mutation', async () => {
    mockExecuteLogin.mockResolvedValue({
      data: {
        loginWithSpotify: {
          token: 'jwt-token',
          user: {
            id: 'user-id',
            displayName: 'Daria',
            profileImageUrl: 'https://example.com/avatar.jpg',
          },
        },
      },
    })

    const { rerender, result } = renderHook(() => useSpotifyLogin())

    act(() => {
      mockAuthResponse = {
        type: 'success',
        params: { code: 'spotify-code' },
      }
      rerender({})
    })

    await waitFor(() => {
      expect(mockExecuteLogin).toHaveBeenCalledWith({
        code: 'spotify-code',
        redirectUri: 'matchify://redirect',
      })
    })

    expect(useAuthStore.getState()).toEqual(
      expect.objectContaining({
        token: 'jwt-token',
        user: {
          id: 'user-id',
          displayName: 'Daria',
          imageUrl: 'https://example.com/avatar.jpg',
        },
      })
    )
    expect(result.current.error).toBeNull()
  })

  it('reports cancelled OAuth attempts to the caller', () => {
    const { rerender, result } = renderHook(() => useSpotifyLogin())

    act(() => {
      mockAuthResponse = { type: 'cancel' }
      rerender({})
    })

    expect(result.current.error).toBe('Spotify login was cancelled.')
    expect(mockExecuteLogin).not.toHaveBeenCalled()
  })
})
