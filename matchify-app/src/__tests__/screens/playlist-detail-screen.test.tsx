/* eslint-disable @typescript-eslint/no-require-imports */

import { fireEvent, render } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockSetStringAsync = jest.fn()
const mockSelectionAsync = jest.fn()
const mockUseQuery = jest.fn()
const mockUseSubscription = jest.fn()

jest.mock('expo-router', () => ({
  router: {
    push: (href: string) => mockPush(href),
  },
  useLocalSearchParams: () => ({ id: 'playlist-1' }),
}))

jest.mock('expo-clipboard', () => ({
  setStringAsync: (value: string) => mockSetStringAsync(value),
}))

jest.mock('expo-haptics', () => ({
  selectionAsync: () => mockSelectionAsync(),
}))

jest.mock('urql', () => ({
  gql: jest.fn((strings: TemplateStringsArray) => strings.join('')),
  useQuery: (options: unknown) => mockUseQuery(options),
  useSubscription: (options: unknown, handler: unknown) => mockUseSubscription(options, handler),
}))

jest.mock('@/components/glass-surface', () => {
  const { View } = require('react-native')

  return {
    GlassSurface: jest.fn(({ children, ...props }) => <View {...props}>{children}</View>),
  }
})

const PlaylistDetailScreen = require('@/app/(tabs)/playlists/[id]').default

const playlist = {
  id: 'playlist-1',
  name: 'Friday Room',
  inviteCode: 'ABCD1234',
  voteThreshold: 2,
  members: [
    { id: 'user-1', displayName: 'Avery', profileImageUrl: null },
    { id: 'user-2', displayName: 'Blake', profileImageUrl: null },
  ],
  tracks: [
    {
      id: 'track-new',
      title: 'New Track',
      artist: 'New Artist',
      albumArtUrl: 'https://example.com/new.jpg',
      durationMs: 65000,
      likeCount: 4,
      createdAt: '2026-04-26T12:30:00Z',
    },
    {
      id: 'track-old',
      title: 'Old Track',
      artist: 'Old Artist',
      albumArtUrl: 'https://example.com/old.jpg',
      durationMs: 181000,
      likeCount: 2,
      createdAt: '2026-04-26T12:00:00Z',
    },
  ],
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSetStringAsync.mockResolvedValue(undefined)
  mockSelectionAsync.mockResolvedValue(undefined)
  mockUseQuery.mockReturnValue([{ fetching: false, data: { playlist } }, jest.fn()])
  mockUseSubscription.mockReturnValue([{ data: undefined }])
})

describe('PlaylistDetailScreen', () => {
  it('renders playlist members and approved tracks sorted by creation time', () => {
    const { getByText, getAllByTestId } = render(<PlaylistDetailScreen />)

    expect(getByText('Friday Room')).toBeTruthy()
    expect(getByText('ABCD1234')).toBeTruthy()
    expect(getByText('Avery')).toBeTruthy()
    expect(getByText('Blake')).toBeTruthy()

    const rows = getAllByTestId(/^track-row-/)
    expect(rows.map((row) => row.props.testID)).toEqual(['track-row-track-old', 'track-row-track-new'])
  })

  it('copies the invite code and shows confirmation', async () => {
    const { getByText, findByText } = render(<PlaylistDetailScreen />)

    fireEvent.press(getByText('ABCD1234'))

    await findByText('Copied')
    expect(mockSetStringAsync).toHaveBeenCalledWith('ABCD1234')
    expect(mockSelectionAsync).toHaveBeenCalledTimes(1)
  })

  it('navigates to voting with the playlist id', () => {
    const { getByText } = render(<PlaylistDetailScreen />)

    fireEvent.press(getByText('Start Voting'))

    expect(mockPush).toHaveBeenCalledWith('/(tabs)/vote?playlistId=playlist-1&playlistName=Friday%20Room')
  })

  it('subscribes to approved track events for the current playlist', () => {
    render(<PlaylistDetailScreen />)

    expect(mockUseSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { playlistId: 'playlist-1' },
      }),
      expect.any(Function),
    )
  })
})
