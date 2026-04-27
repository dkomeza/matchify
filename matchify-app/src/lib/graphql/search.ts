import { gql } from 'urql'

export const SEARCH_TRACKS_QUERY = gql`
  query SearchTracks($query: String!, $limit: Int) {
    searchTracks(query: $query, limit: $limit) {
      spotifyTrackId
      title
      artist
      album
      albumArtUrl
      previewUrl
      durationMs
    }
  }
`
