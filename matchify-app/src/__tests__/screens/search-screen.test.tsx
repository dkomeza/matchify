/* eslint-disable @typescript-eslint/no-require-imports */

import { act, fireEvent, render } from '@testing-library/react-native'
import { Alert } from 'react-native'

const mockBack = jest.fn()
const mockDispatch = jest.fn()
const mockUseLocalSearchParams = jest.fn()
const mockUseNavigation = jest.fn()
const mockUseMutation = jest.fn()
const mockUseQuery = jest.fn()
const mockClientQuery = jest.fn()

jest.mock('expo-router', () => ({
  router: {
    back: () => mockBack(),
  },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useNavigation: () => mockUseNavigation(),
}))

jest.mock('urql', () => ({
  gql: jest.fn((strings: TemplateStringsArray) => strings.join('')),
  useClient: () => ({
    query: (...args: unknown[]) => mockClientQuery(...args),
  }),
  useMutation: (mutation: unknown) => mockUseMutation(mutation),
  useQuery: (options: unknown) => mockUseQuery(options),
}))

jest.mock('@/components/glass-surface', () => {
  const { View } = require('react-native')

  return {
    GlassSurface: jest.fn(({ children, ...props }) => <View {...props}>{children}</View>),
  }
})

const SearchScreen = require('@/app/(tabs)/search').default

const resultTrack = {
  spotifyTrackId: 'spotify-1',
  title: 'Midnight City',
  artist: 'M83',
  album: "Hurry Up, We're Dreaming",
  albumArtUrl: 'https://example.com/midnight.jpg',
  previewUrl: null,
  durationMs: 241000,
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  mockUseLocalSearchParams.mockReturnValue({})
  mockUseNavigation.mockReturnValue({ addListener: jest.fn(() => jest.fn()), dispatch: mockDispatch })
  mockUseMutation.mockReturnValue([{ fetching: false }, jest.fn().mockResolvedValue({ data: {} })])
  mockClientQuery.mockReturnValue({ toPromise: jest.fn().mockResolvedValue({}) })
  mockUseQuery.mockReturnValue([{ fetching: false, data: undefined, error: undefined }])
})

afterEach(() => {
  jest.runOnlyPendingTimers()
  jest.useRealTimers()
})

describe('SearchScreen', () => {
  it('pauses the query for empty input and shows a prompt', () => {
    const { getByText } = render(<SearchScreen />)

    expect(mockUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pause: true,
        variables: { query: '', limit: 20 },
      }),
    )
    expect(getByText('Search for tracks')).toBeTruthy()
  })

  it('debounces search input for 300ms before querying', () => {
    const { getByTestId } = render(<SearchScreen />)

    fireEvent.changeText(getByTestId('track-search-input'), 'mid')
    expect(mockUseQuery).toHaveBeenLastCalledWith(expect.objectContaining({ pause: true }))

    act(() => {
      jest.advanceTimersByTime(299)
    })
    expect(mockUseQuery).toHaveBeenLastCalledWith(expect.objectContaining({ pause: true }))

    act(() => {
      jest.advanceTimersByTime(1)
    })
    expect(mockUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pause: false,
        variables: { query: 'mid', limit: 20 },
      }),
    )
  })

  it('renders skeleton rows while loading results', () => {
    mockUseQuery.mockReturnValue([{ fetching: true, data: undefined, error: undefined }])

    const { getAllByTestId, getByTestId } = render(<SearchScreen />)

    fireEvent.changeText(getByTestId('track-search-input'), 'mid')
    act(() => {
      jest.advanceTimersByTime(300)
    })

    expect(getAllByTestId('track-search-skeleton')).toHaveLength(6)
  })

  it('renders results and toggles row selection', () => {
    mockUseQuery.mockReturnValue([{ fetching: false, data: { searchTracks: [resultTrack] }, error: undefined }])

    const { getByText, getByTestId, queryByTestId } = render(<SearchScreen />)

    expect(getByText('Midnight City')).toBeTruthy()
    expect(queryByTestId('track-search-selected-spotify-1')).toBeNull()

    fireEvent.press(getByTestId('track-search-row-spotify-1'))

    expect(getByTestId('track-search-selected-spotify-1')).toBeTruthy()
  })

  it('shows ordered row badges and the add button in playlist seed mode', () => {
    mockUseLocalSearchParams.mockReturnValue({ playlistId: 'playlist-1' })
    mockUseQuery.mockReturnValue([
      {
        fetching: false,
        data: {
          searchTracks: [
            resultTrack,
            { ...resultTrack, spotifyTrackId: 'spotify-2', title: 'Wait' },
          ],
        },
        error: undefined,
      },
    ])

    const { getByText, getByTestId } = render(<SearchScreen />)

    fireEvent.press(getByTestId('track-search-row-spotify-2'))
    fireEvent.press(getByTestId('track-search-row-spotify-1'))

    expect(getByText('Add 2 tracks')).toBeTruthy()
    expect(getByTestId('track-search-selected-spotify-2')).toHaveTextContent('1')
    expect(getByTestId('track-search-selected-spotify-1')).toHaveTextContent('2')
  })

  it('adds selected tracks in one mutation, refreshes the playlist, and navigates back', async () => {
    const executeMutation = jest.fn().mockResolvedValue({ data: { addInitialTracks: [] } })
    mockUseLocalSearchParams.mockReturnValue({ playlistId: 'playlist-1' })
    mockUseMutation.mockReturnValue([{ fetching: false }, executeMutation])
    mockUseQuery.mockReturnValue([
      {
        fetching: false,
        data: {
          searchTracks: [
            resultTrack,
            { ...resultTrack, spotifyTrackId: 'spotify-2', title: 'Wait' },
          ],
        },
        error: undefined,
      },
    ])

    const { getByText, getByTestId } = render(<SearchScreen />)

    fireEvent.press(getByTestId('track-search-row-spotify-1'))
    fireEvent.press(getByTestId('track-search-row-spotify-2'))
    await act(async () => {
      fireEvent.press(getByText('Add 2 tracks'))
    })

    expect(executeMutation).toHaveBeenCalledWith({
      playlistId: 'playlist-1',
      spotifyTrackIds: ['spotify-1', 'spotify-2'],
    })
    expect(mockClientQuery).toHaveBeenCalledWith(expect.anything(), { id: 'playlist-1' }, { requestPolicy: 'network-only' })
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('caps selection at 50 tracks', () => {
    mockUseLocalSearchParams.mockReturnValue({ playlistId: 'playlist-1' })
    const tracksForBatch = (batch: number) =>
      Array.from({ length: 10 }, (_, index) => {
        const trackNumber = batch * 10 + index + 1

        return {
          ...resultTrack,
          spotifyTrackId: `spotify-${trackNumber}`,
          title: `Track ${trackNumber}`,
        }
      })

    mockUseQuery.mockReturnValue([
      {
        fetching: false,
        data: {
          searchTracks: tracksForBatch(0),
        },
        error: undefined,
      },
    ])

    const { getByText, getByTestId, queryByTestId, rerender } = render(<SearchScreen />)

    for (let batch = 0; batch < 5; batch += 1) {
      mockUseQuery.mockReturnValue([
        {
          fetching: false,
          data: {
            searchTracks: tracksForBatch(batch),
          },
          error: undefined,
        },
      ])
      rerender(<SearchScreen />)

      for (let index = 1; index <= 10; index += 1) {
        fireEvent.press(getByTestId(`track-search-row-spotify-${batch * 10 + index}`))
      }
    }

    mockUseQuery.mockReturnValue([
      {
        fetching: false,
        data: {
          searchTracks: [
            {
              ...resultTrack,
              spotifyTrackId: 'spotify-51',
              title: 'Track 51',
            },
          ],
        },
        error: undefined,
      },
    ])
    rerender(<SearchScreen />)
    fireEvent.press(getByTestId('track-search-row-spotify-51'))

    expect(getByText('50 selected')).toBeTruthy()
    expect(getByText('Add 50 tracks')).toBeTruthy()
    expect(queryByTestId('track-search-selected-spotify-51')).toBeNull()
  })

  it('confirms back navigation and clears selected tracks before discarding', () => {
    const unsubscribe = jest.fn()
    const preventDefault = jest.fn()
    const action = { type: 'GO_BACK' }
    let beforeRemove: ((event: { preventDefault: () => void; data: { action: unknown } }) => void) | undefined

    const addListener = jest.fn((eventName: string, handler: typeof beforeRemove) => {
      if (eventName === 'beforeRemove') {
        beforeRemove = handler
      }

      return unsubscribe
    })
    mockUseLocalSearchParams.mockReturnValue({ playlistId: 'playlist-1' })
    mockUseNavigation.mockReturnValue({ addListener, dispatch: mockDispatch })
    mockUseQuery.mockReturnValue([{ fetching: false, data: { searchTracks: [resultTrack] }, error: undefined }])
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      buttons?.[1]?.onPress?.()
    })

    const { getByTestId, queryByTestId } = render(<SearchScreen />)

    fireEvent.press(getByTestId('track-search-row-spotify-1'))
    act(() => {
      beforeRemove?.({ preventDefault, data: { action } })
    })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(Alert.alert).toHaveBeenCalledWith('Discard selected tracks?', expect.any(String), expect.any(Array))
    expect(mockDispatch).toHaveBeenCalledWith(action)
    expect(queryByTestId('track-search-selected-spotify-1')).toBeNull()
  })

  it('shows a no-results state for completed empty searches', () => {
    mockUseQuery.mockReturnValue([{ fetching: false, data: { searchTracks: [] }, error: undefined }])

    const { getByText, getByTestId } = render(<SearchScreen />)

    fireEvent.changeText(getByTestId('track-search-input'), 'unknown song')
    act(() => {
      jest.advanceTimersByTime(300)
    })

    expect(getByText('No tracks found')).toBeTruthy()
  })
})
