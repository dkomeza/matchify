/* eslint-disable @typescript-eslint/no-require-imports */

import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const mockBack = jest.fn()
const mockReplace = jest.fn()
const mockExecuteMutation = jest.fn()
const mockUseMutation = jest.fn()
const mockClient = {
  query: jest.fn(() => ({ toPromise: jest.fn(() => Promise.resolve({})) })),
}

jest.mock('expo-router', () => ({
  router: {
    back: () => mockBack(),
    replace: (href: string) => mockReplace(href),
  },
}))

jest.mock('urql', () => ({
  gql: jest.fn((strings: TemplateStringsArray) => strings.join('')),
  useClient: () => mockClient,
  useMutation: (mutation: unknown) => mockUseMutation(mutation),
}))

jest.mock('@/components/glass-surface', () => {
  const { View } = require('react-native')

  return {
    GlassSurface: jest.fn(({ children, ...props }) => <View {...props}>{children}</View>),
  }
})

const JoinPlaylistScreen = require('@/app/(tabs)/playlists/join').default

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 34, left: 0 } }}>
      <JoinPlaylistScreen />
    </SafeAreaProvider>
  )

beforeEach(() => {
  jest.clearAllMocks()
  mockExecuteMutation.mockResolvedValue({
    data: { joinPlaylist: { id: 'playlist-joined' } },
  })
  mockUseMutation.mockReturnValue([{ fetching: false }, mockExecuteMutation])
})

describe('JoinPlaylistScreen', () => {
  it('uppercases invite codes while typing', () => {
    const { getByPlaceholderText } = renderScreen()
    const input = getByPlaceholderText('Invite code')

    fireEvent.changeText(input, 'ab12cd')

    expect(input.props.value).toBe('AB12CD')
  })

  it('shows an inline error when invite code length is invalid', () => {
    const { getByPlaceholderText, getByText } = renderScreen()

    fireEvent.changeText(getByPlaceholderText('Invite code'), 'ABC')
    fireEvent.press(getByText('Join playlist'))

    expect(getByText('Invite code must be 6-8 characters.')).toBeTruthy()
    expect(mockExecuteMutation).not.toHaveBeenCalled()
  })

  it('joins a playlist, refreshes MyPlaylists, and navigates to detail', async () => {
    const { getByPlaceholderText, getByText } = renderScreen()

    fireEvent.changeText(getByPlaceholderText('Invite code'), 'room202')
    fireEvent.press(getByText('Join playlist'))

    await waitFor(() => {
      expect(mockExecuteMutation).toHaveBeenCalledWith({ inviteCode: 'ROOM202' })
    })
    expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('MyPlaylists'), {}, { requestPolicy: 'network-only' })
    expect(mockBack).toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/playlists/playlist-joined')
  })
})
