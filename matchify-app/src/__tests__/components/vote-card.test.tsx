/* eslint-disable @typescript-eslint/no-require-imports */

import { render } from '@testing-library/react-native'

import { VoteCard, type VoteCardTrack } from '@/components/vote/VoteCard'

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native')

  return {
    __esModule: true,
    default: {
      View,
    },
    Extrapolation: {
      CLAMP: 'clamp',
    },
    interpolate: jest.fn(() => 0),
    runOnJS: jest.fn((callback) => callback),
    useAnimatedStyle: jest.fn((callback) => callback()),
    useSharedValue: jest.fn((value) => ({ value })),
    withSpring: jest.fn((value, _config, callback) => {
      callback?.(true)
      return value
    }),
  }
})

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native')

  return {
    Gesture: {
      Pan: jest.fn(() => {
        const gesture = {} as {
          onBegin: jest.Mock
          onUpdate: jest.Mock
          onEnd: jest.Mock
        }
        gesture.onBegin = jest.fn(() => gesture)
        gesture.onUpdate = jest.fn(() => gesture)
        gesture.onEnd = jest.fn(() => gesture)

        return gesture
      }),
    },
    GestureDetector: jest.fn(({ children }) => <View>{children}</View>),
  }
})

jest.mock('expo-image', () => {
  const { View } = require('react-native')

  return {
    Image: jest.fn((props) => <View {...props} />),
  }
})

jest.mock('@/components/glass-surface', () => {
  const { View } = require('react-native')

  return {
    GlassSurface: jest.fn(({ children, ...props }) => <View {...props}>{children}</View>),
  }
})

const track: VoteCardTrack = {
  id: 'track-1',
  title: 'Midnight City',
  artist: 'M83',
  album: "Hurry Up, We're Dreaming",
  albumArtUrl: 'https://example.com/art.jpg',
  albumArtBlurhash: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH',
  durationMs: 244000,
}

describe('VoteCard', () => {
  it('renders the swipe card track metadata and album art', () => {
    const { getByText, getByTestId } = render(
      <VoteCard track={track} onSwipeRight={jest.fn()} onSwipeLeft={jest.fn()} />,
    )

    expect(getByTestId('vote-card-track-1')).toBeTruthy()
    expect(getByTestId('vote-card-art-track-1')).toBeTruthy()
    expect(getByText('Midnight City')).toBeTruthy()
    expect(getByText('M83')).toBeTruthy()
    expect(getByText("Hurry Up, We're Dreaming · 4:04")).toBeTruthy()
  })
})
