/* eslint-disable import/first */

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}))

import { act } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { JWT_KEY, useAuthStore } from '../../store/auth-store'

const mockUser = {
  id: 'user123',
  displayName: 'Test User',
  imageUrl: null as null,
}

beforeEach(() => {
  jest.clearAllMocks()
  useAuthStore.setState({
    token: null,
    user: null,
    isLoading: false,
  })
})

describe('useAuthStore', () => {
  it('login stores the jwt and sets authenticated user state', () => {
    act(() => {
      useAuthStore.getState().login('jwt-token', mockUser)
    })

    const s = useAuthStore.getState()
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(JWT_KEY, 'jwt-token')
    expect(s.token).toBe('jwt-token')
    expect(s.user).toEqual(mockUser)
    expect(s.isLoading).toBe(false)
  })

  it('initialize reads an existing jwt from SecureStore', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce('persisted-jwt')

    await act(async () => {
      await useAuthStore.getState().initialize()
    })

    const s = useAuthStore.getState()
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(JWT_KEY)
    expect(s.token).toBe('persisted-jwt')
    expect(s.user).toBeNull()
    expect(s.isLoading).toBe(false)
  })

  it('logout clears SecureStore and resets auth state', () => {
    act(() => {
      useAuthStore.getState().login('jwt-token', mockUser)
    })

    act(() => {
      useAuthStore.getState().logout()
    })

    const s = useAuthStore.getState()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(JWT_KEY)
    expect(s.token).toBeNull()
    expect(s.user).toBeNull()
    expect(s.isLoading).toBe(false)
  })
})
