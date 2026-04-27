/* eslint-disable @typescript-eslint/no-require-imports */

import { act, fireEvent, render } from '@testing-library/react-native'

const mockUseQuery = jest.fn()

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
