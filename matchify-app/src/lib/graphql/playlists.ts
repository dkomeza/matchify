import { gql, type Client } from 'urql'

export const MY_PLAYLISTS_QUERY = gql`
  query MyPlaylists {
    myPlaylists {
      id
      name
      description
      members {
        id
        displayName
        profileImageUrl
      }
      voteThreshold
    }
  }
`

export const PLAYLIST_DETAIL_QUERY = gql`
  query PlaylistDetail($id: String!) {
    playlist(id: $id) {
      id
      name
      inviteCode
      voteThreshold
      members {
        id
        displayName
        profileImageUrl
      }
      tracks {
        id
        title
        artist
        albumArtUrl
        durationMs
        likeCount
        createdAt
      }
    }
  }
`

export const TRACK_APPROVED_SUBSCRIPTION = gql`
  subscription TrackApproved($playlistId: ID!) {
    trackApproved(playlistId: $playlistId) {
      id
      title
      artist
      albumArtUrl
      durationMs
      likeCount
      createdAt
    }
  }
`

export const refreshMyPlaylists = (client: Client) =>
  client.query(MY_PLAYLISTS_QUERY, {}, { requestPolicy: 'network-only' }).toPromise()
