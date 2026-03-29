jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}))

import { act } from '@testing-library/react-native'
import { useAuthStore } from '../../store/auth-store'

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

describe('useAuthStore', () => {
  it('setSession sets authenticated status and stores all session fields', () => {
    const expiresAt = Date.now() + 3600000
    act(() => {
      useAuthStore.getState().setSession('tok_access', 'tok_refresh', expiresAt, mockUser)
    })
    const s = useAuthStore.getState()
    expect(s.status).toBe('authenticated')
    expect(s.accessToken).toBe('tok_access')
    expect(s.refreshToken).toBe('tok_refresh')
    expect(s.expiresAt).toBe(expiresAt)
    expect(s.user).toEqual(mockUser)
  })

  it('logout clears all session fields and sets unauthenticated status', () => {
    act(() => {
      useAuthStore.getState().setSession('tok_access', 'tok_refresh', Date.now() + 3600000, mockUser)
    })
    act(() => {
      useAuthStore.getState().logout()
    })
    const s = useAuthStore.getState()
    expect(s.status).toBe('unauthenticated')
    expect(s.accessToken).toBeNull()
    expect(s.refreshToken).toBeNull()
    expect(s.expiresAt).toBeNull()
    expect(s.user).toBeNull()
  })
})
