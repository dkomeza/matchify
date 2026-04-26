/* eslint-disable import/first */

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

import { getAuthHeaders } from '@/lib/auth-headers'
import { useAuthStore } from '@/store/auth-store'

const mockUser = {
  id: 'user123',
  displayName: 'Test User',
  imageUrl: null as null,
}

beforeEach(() => {
  useAuthStore.setState({
    status: 'unauthenticated',
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    user: null,
  })
})

describe('urql auth headers', () => {
  it('injects the current persisted auth token as a bearer token', () => {
    useAuthStore
      .getState()
      .setSession('jwt_token', 'refresh_token', Date.now() + 3600000, mockUser)

    expect(getAuthHeaders()).toEqual({
      Authorization: 'Bearer jwt_token',
    })
  })
})
