import { gql } from 'urql'

export const NEXT_PROPOSAL_QUERY = gql`
  query NextProposal($playlistId: String!) {
    nextProposal(playlistId: $playlistId) {
      id
      title
      artist
      album
      albumArtUrl
      previewUrl
      durationMs
      likeCount
    }
  }
`

export const VOTE_ON_TRACK_MUTATION = gql`
  mutation VoteOnTrack($trackId: ID!, $vote: VoteType!) {
    voteOnTrack(trackId: $trackId, vote: $vote) {
      id
      status
      likeCount
    }
  }
`

export const NEW_PROPOSAL_SUBSCRIPTION = gql`
  subscription NewProposal($playlistId: ID!) {
    newProposal(playlistId: $playlistId) {
      id
      title
      artist
      album
      albumArtUrl
      previewUrl
      durationMs
      likeCount
    }
  }
`
