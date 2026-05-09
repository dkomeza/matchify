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
      ownerId
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
      proposals {
        id
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

export const ADD_INITIAL_TRACKS_MUTATION = gql`
  mutation AddInitialTracks($playlistId: String!, $spotifyTrackIds: [String!]!) {
    addInitialTracks(playlistId: $playlistId, spotifyTrackIds: $spotifyTrackIds) {
      id
      spotifyTrackId
      title
      artist
      albumArtUrl
      durationMs
      likeCount
      createdAt
    }
  }
`

export const PROPOSE_TRACK_MUTATION = gql`
  mutation ProposeTrack($playlistId: ID!, $spotifyTrackId: String!) {
    proposeTrack(playlistId: $playlistId, spotifyTrackId: $spotifyTrackId) {
      id
      spotifyTrackId
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
