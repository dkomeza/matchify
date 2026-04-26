/* eslint-disable @typescript-eslint/no-require-imports */

import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { withSpring } from 'react-native-reanimated'

const mockUseQuery = jest.fn()
const mockUseMutation = jest.fn()
const mockUseSubscription = jest.fn()

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ playlistId: 'playlist-1', playlistName: 'Friday Room' }),
}))

jest.mock('urql', () => ({
  gql: jest.fn((strings: TemplateStringsArray) => strings.join('')),
  useMutation: (query: unknown) => mockUseMutation(query),
  useQuery: (options: unknown) => mockUseQuery(options),
  useSubscription: (options: unknown, handler: unknown) => mockUseSubscription(options, handler),
}))

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native')

  return {
    __esModule: true,
    default: {
      View,
    },
    useAnimatedStyle: jest.fn((callback) => callback()),
    useSharedValue: jest.fn((value) => ({ value })),
    withSpring: jest.fn((value) => value),
  }
})

jest.mock('@/components/vote/VoteCard', () => {
  const { Pressable, Text, View } = require('react-native')

  return {
    VoteCard: jest.fn(({ track, onSwipeLeft, onSwipeRight }) => (
      <View testID={`mock-vote-card-${track.id}`}>
        <Text>{track.title}</Text>
        <Text>{track.artist}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Mock swipe left" onPress={onSwipeLeft}>
          <Text>Swipe left</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Mock swipe right" onPress={onSwipeRight}>
          <Text>Swipe right</Text>
        </Pressable>
      </View>
    )),
  }
})

jest.mock('@/components/vote/ActionButton', () => {
  const { Pressable, Text } = require('react-native')

  return {
    ActionButton: jest.fn(({ type, onPress, disabled }) => (
      <Pressable accessibilityRole="button" accessibilityLabel={type === 'like' ? 'Like' : 'Skip'} disabled={disabled} onPress={onPress}>
        <Text>{type}</Text>
      </Pressable>
    )),
  }
})

jest.mock('@/components/glass-surface', () => {
  const { View } = require('react-native')

  return {
    GlassSurface: jest.fn(({ children, ...props }) => <View {...props}>{children}</View>),
  }
})

const VoteScreen = require('@/app/(tabs)/vote').default

const track = {
  id: 'track-1',
  title: 'Midnight City',
  artist: 'M83',
  album: "Hurry Up, We're Dreaming",
  albumArtUrl: 'https://example.com/art.jpg',
  previewUrl: null,
  durationMs: 244000,
  likeCount: 2,
}

describe('VoteScreen', () => {
  const executeQuery = jest.fn()
  const executeMutation = jest.fn()
  const mockWithSpring = jest.mocked(withSpring)

  beforeEach(() => {
    jest.clearAllMocks()
    mockUseQuery.mockReturnValue([{ fetching: false, data: { nextProposal: track } }, executeQuery])
    executeMutation.mockResolvedValue({ data: { voteOnTrack: { id: 'track-1', status: 'APPROVED', likeCount: 3 } } })
    mockUseMutation.mockReturnValue([{ fetching: false }, executeMutation])
    mockUseSubscription.mockReturnValue([{ data: undefined }])
  })

  it('queries the next proposal for the playlist route param and renders the card controls', () => {
    const { getByText, getByTestId, getByLabelText } = render(<VoteScreen />)

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { playlistId: 'playlist-1' },
        pause: false,
      }),
    )
    expect(getByText('Friday Room')).toBeTruthy()
    expect(getByTestId('mock-vote-card-track-1')).toBeTruthy()
    expect(getByLabelText('Skip')).toBeTruthy()
    expect(getByLabelText('Like')).toBeTruthy()
  })

  it('renders a card skeleton while the first proposal is loading', () => {
    mockUseQuery.mockReturnValue([{ fetching: true, data: undefined }, executeQuery])

    const { getByTestId } = render(<VoteScreen />)

    expect(getByTestId('vote-card-skeleton')).toBeTruthy()
  })

  it('renders the empty state when the queue is caught up', () => {
    mockUseQuery.mockReturnValue([{ fetching: false, data: { nextProposal: null } }, executeQuery])

    const { getByText } = render(<VoteScreen />)

    expect(getByText("You're all caught up!")).toBeTruthy()
    expect(getByText('Come back when someone proposes a new track')).toBeTruthy()
  })

  it('flies the card away before the vote mutation resolves and prevents duplicate votes', async () => {
    let resolveMutation: (value: unknown) => void = () => undefined
    executeMutation.mockReturnValue(
      new Promise((resolve) => {
        resolveMutation = resolve
      }),
    )

    const { getByLabelText } = render(<VoteScreen />)

    fireEvent.press(getByLabelText('Like'))
    fireEvent.press(getByLabelText('Skip'))

    expect(mockWithSpring.mock.invocationCallOrder[0]).toBeLessThan(executeMutation.mock.invocationCallOrder[0])
    expect(executeMutation).toHaveBeenCalledTimes(1)
    expect(executeMutation).toHaveBeenCalledWith({ trackId: 'track-1', vote: 'LIKE' })

    act(() => {
      resolveMutation({ data: { voteOnTrack: { id: 'track-1', status: 'APPROVED', likeCount: 3 } } })
    })
    await waitFor(() => {
      expect(executeQuery).toHaveBeenCalledWith({ requestPolicy: 'network-only' })
    })
  })

  it('refreshes the next proposal after a successful vote', async () => {
    const { getByLabelText } = render(<VoteScreen />)

    fireEvent.press(getByLabelText('Skip'))

    await waitFor(() => {
      expect(executeQuery).toHaveBeenCalledWith({ requestPolicy: 'network-only' })
    })
  })

  it('shows an error toast and returns the card when voting fails', async () => {
    executeMutation.mockResolvedValue({ error: new Error('Network down') })

    const { getByLabelText, getByText } = render(<VoteScreen />)

    fireEvent.press(getByLabelText('Like'))

    await waitFor(() => expect(getByText('Network down')).toBeTruthy())
    expect(executeQuery).not.toHaveBeenCalled()
    expect(mockWithSpring).toHaveBeenCalledWith(0, expect.any(Object))
  })

  it('subscribes to new proposal events and refreshes the queue', () => {
    render(<VoteScreen />)

    const [, handler] = mockUseSubscription.mock.calls[0]
    handler(undefined, { newProposal: track })

    expect(mockUseSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { playlistId: 'playlist-1' },
      }),
      expect.any(Function),
    )
    expect(executeQuery).toHaveBeenCalledWith({ requestPolicy: 'network-only' })
  })
})
