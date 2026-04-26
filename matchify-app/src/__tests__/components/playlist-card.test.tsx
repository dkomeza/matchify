/* eslint-disable @typescript-eslint/no-require-imports */

import { fireEvent, render } from '@testing-library/react-native'

import { PlaylistCard, type PlaylistCardPlaylist } from '@/components/playlist/playlist-card'

jest.mock('@/components/glass-surface', () => {
  const { View } = require('react-native')

  return {
    GlassSurface: jest.fn(({ children, ...props }) => <View {...props}>{children}</View>),
  }
})

const playlist: PlaylistCardPlaylist = {
  id: 'playlist-1',
  name: 'Friday Room',
  description: null,
  voteThreshold: 2,
  members: [
    { id: 'user-1', displayName: 'Avery', profileImageUrl: null },
    { id: 'user-2', displayName: 'Blake', profileImageUrl: null },
    { id: 'user-3', displayName: 'Casey', profileImageUrl: null },
  ],
}

describe('PlaylistCard', () => {
  it('renders playlist metadata and opens on press', () => {
    const onPress = jest.fn()
    const { getByText, getByTestId } = render(<PlaylistCard playlist={playlist} onPress={onPress} />)

    expect(getByText('Friday Room')).toBeTruthy()
    expect(getByText('3 members · 2 vote threshold')).toBeTruthy()
    expect(getByText('>')).toBeTruthy()

    fireEvent.press(getByTestId('playlist-card-playlist-1'))

    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
