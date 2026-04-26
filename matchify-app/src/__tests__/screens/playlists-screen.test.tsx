/* eslint-disable @typescript-eslint/no-require-imports */

import { fireEvent, render } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockExecuteQuery = jest.fn()
const mockUseQuery = jest.fn()

jest.mock('expo-router', () => ({
  router: {
    push: (href: string) => mockPush(href),
  },
}))

jest.mock('urql', () => ({
  gql: jest.fn((strings: TemplateStringsArray) => strings.join('')),
  useQuery: (options: unknown) => mockUseQuery(options),
}))

jest.mock('@/components/glass-surface', () => {
  const { View } = require('react-native')

  return {
    GlassSurface: jest.fn(({ children, ...props }) => <View {...props}>{children}</View>),
  }
})

const PlaylistsScreen = require('@/app/(tabs)/playlists').default

const playlist = {
  id: 'playlist-1',
  name: 'Friday Room',
  description: null,
  voteThreshold: 2,
  members: [
    { id: 'user-1', displayName: 'Avery', profileImageUrl: null },
    { id: 'user-2', displayName: 'Blake', profileImageUrl: null },
  ],
}

beforeEach(() => {
  jest.clearAllMocks()
  mockExecuteQuery.mockResolvedValue({})
  mockUseQuery.mockReturnValue([{ fetching: false, data: { myPlaylists: [playlist] } }, mockExecuteQuery])
})

describe('PlaylistsScreen', () => {
  it('renders a card per playlist and navigates to detail on press', () => {
    const { getByText, getByTestId } = render(<PlaylistsScreen />)

    expect(getByText('Playlists')).toBeTruthy()
    expect(getByText('Friday Room')).toBeTruthy()

    fireEvent.press(getByTestId('playlist-card-playlist-1'))

    expect(mockPush).toHaveBeenCalledWith('/playlists/playlist-1')
  })

  it('shows an empty state when the user has no playlists', () => {
    mockUseQuery.mockReturnValue([{ fetching: false, data: { myPlaylists: [] } }, mockExecuteQuery])

    const { getByText } = render(<PlaylistsScreen />)

    expect(getByText('No playlists yet')).toBeTruthy()
    expect(getByText('Join with invite')).toBeTruthy()
  })

  it('refetches when the list is refreshed', () => {
    const { getByTestId } = render(<PlaylistsScreen />)

    fireEvent(getByTestId('playlists-list'), 'refresh')

    expect(mockExecuteQuery).toHaveBeenCalledWith({ requestPolicy: 'network-only' })
  })
})
