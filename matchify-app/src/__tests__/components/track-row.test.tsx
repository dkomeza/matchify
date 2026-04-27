/* eslint-disable @typescript-eslint/no-require-imports */

import { fireEvent, render } from '@testing-library/react-native'

import { MemberAvatar } from '@/components/playlist/member-avatar'
import { TrackRow, type TrackRowTrack } from '@/components/track/track-row'
import { TrackSearchRow, type TrackSearchRowTrack } from '@/components/track/track-search-row'

jest.mock('@/components/glass-surface', () => {
  const { View } = require('react-native')

  return {
    GlassSurface: jest.fn(({ children, ...props }) => <View {...props}>{children}</View>),
  }
})

const track: TrackRowTrack = {
  id: 'track-1',
  title: 'Late Night',
  artist: 'Odesza',
  albumArtUrl: 'https://example.com/art.jpg',
  durationMs: 184000,
  likeCount: 3,
}

describe('TrackRow', () => {
  it('renders track metadata with formatted duration', () => {
    const { getByText, getByTestId } = render(<TrackRow track={track} />)

    expect(getByText('Late Night')).toBeTruthy()
    expect(getByText('Odesza')).toBeTruthy()
    expect(getByText('3:04')).toBeTruthy()
    expect(getByTestId('track-art-track-1')).toBeTruthy()
  })
})

const searchTrack: TrackSearchRowTrack = {
  spotifyTrackId: 'spotify-1',
  title: 'Midnight City',
  artist: 'M83',
  album: "Hurry Up, We're Dreaming",
  albumArtUrl: 'https://example.com/midnight.jpg',
  previewUrl: null,
  durationMs: 241000,
}

describe('TrackSearchRow', () => {
  it('renders search result metadata and calls onToggle when pressed', () => {
    const onToggle = jest.fn()
    const { getByText, getByTestId, queryByTestId } = render(
      <TrackSearchRow track={searchTrack} selected={false} onToggle={onToggle} />,
    )

    expect(getByText('Midnight City')).toBeTruthy()
    expect(getByText('M83')).toBeTruthy()
    expect(getByText('4:01')).toBeTruthy()
    expect(getByTestId('track-search-art-spotify-1')).toBeTruthy()
    expect(queryByTestId('track-search-selected-spotify-1')).toBeNull()

    fireEvent.press(getByTestId('track-search-row-spotify-1'))

    expect(onToggle).toHaveBeenCalledWith(searchTrack)
  })

  it('shows a checkmark when selected', () => {
    const { getByText, getByTestId } = render(
      <TrackSearchRow track={searchTrack} selected onToggle={jest.fn()} />,
    )

    expect(getByTestId('track-search-selected-spotify-1')).toBeTruthy()
    expect(getByText('✓')).toBeTruthy()
  })
})

describe('MemberAvatar', () => {
  it('renders the member image and display name', () => {
    const { getByText, getByTestId } = render(
      <MemberAvatar member={{ id: 'user-1', displayName: 'Avery Stone', profileImageUrl: 'https://example.com/avatar.jpg' }} />,
    )

    expect(getByText('Avery Stone')).toBeTruthy()
    expect(getByTestId('member-avatar-image-user-1')).toBeTruthy()
  })

  it('falls back to initials when the member has no image', () => {
    const { getByText } = render(<MemberAvatar member={{ id: 'user-2', displayName: 'Blake Chen', profileImageUrl: null }} />)

    expect(getByText('BC')).toBeTruthy()
    expect(getByText('Blake Chen')).toBeTruthy()
  })
})
