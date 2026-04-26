/* eslint-disable @typescript-eslint/no-require-imports */

process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000'

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
  },
}))

const { getAuthHeaders } = require('@/lib/auth-headers')
const { handleUnauthorized } = require('@/lib/urql')
const { useAuthStore } = require('@/store/auth-store')

const mockUser = {
  id: 'user123',
  displayName: 'Test User',
  imageUrl: null as null,
}

beforeEach(() => {
  useAuthStore.setState({
    token: null,
    user: null,
    isLoading: false,
  })
})

describe('urql auth headers', () => {
  it('injects the current persisted auth token as a bearer token', () => {
    useAuthStore.getState().login('jwt_token', mockUser)

    expect(getAuthHeaders()).toEqual({
      Authorization: 'Bearer jwt_token',
    })
  })

  it('allows later 401s to trigger logout after the previous one finishes', async () => {
    const logout = jest.fn()
    useAuthStore.setState({ logout })

    handleUnauthorized()
    await Promise.resolve()
    await Promise.resolve()

    expect(logout).toHaveBeenCalledTimes(1)

    handleUnauthorized()
    await Promise.resolve()
    await Promise.resolve()

    expect(logout).toHaveBeenCalledTimes(2)
  })
})
