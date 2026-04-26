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

const CreatePlaylistScreen = require('@/app/(tabs)/playlists/create').default

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 34, left: 0 } }}>
      <CreatePlaylistScreen />
    </SafeAreaProvider>
  )

beforeEach(() => {
  jest.clearAllMocks()
  mockExecuteMutation.mockResolvedValue({
    data: { createPlaylist: { id: 'playlist-new' } },
  })
  mockUseMutation.mockReturnValue([{ fetching: false }, mockExecuteMutation])
})

describe('CreatePlaylistScreen', () => {
  it('shows an inline error when name is empty', async () => {
    const { getByText } = renderScreen()

    fireEvent.press(getByText('Create playlist'))

    expect(getByText('Name is required.')).toBeTruthy()
    expect(mockExecuteMutation).not.toHaveBeenCalled()
  })

  it('creates a playlist, refreshes MyPlaylists, and navigates to detail', async () => {
    const { getByPlaceholderText, getByText } = renderScreen()

    fireEvent.changeText(getByPlaceholderText('Name'), 'Friday Room')
    fireEvent.changeText(getByPlaceholderText('Description'), 'After work picks')
    fireEvent.changeText(getByPlaceholderText('Vote threshold'), '3')
    fireEvent.press(getByText('Create playlist'))

    await waitFor(() => {
      expect(mockExecuteMutation).toHaveBeenCalledWith({
        input: {
          name: 'Friday Room',
          description: 'After work picks',
          voteThreshold: 3,
        },
      })
    })
    expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('MyPlaylists'), {}, { requestPolicy: 'network-only' })
    expect(mockBack).toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/playlists/playlist-new')
  })
})
