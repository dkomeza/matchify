import { gql } from 'urql'

export const HOME_REPORT_QUERY = gql`
  query HomeReport {
    homeReport {
      overview {
        joinedPlaylists
        tracksProposedByMe
        votesCastByMe
        approvedTracksFromMyProposals
        myApprovalRate
      }
      playlistHealth {
        playlistId
        name
        totalProposals
        approvedCount
        pendingCount
        skippedCount
        approvalRate
        totalVotesCast
        averageVotesPerProposal
      }
      activeMembers {
        user {
          id
          displayName
          profileImageUrl
        }
        votesCast
        tracksProposed
        participationRate
      }
      topArtists {
        artist
        approvedTracks
        averageDurationMs
      }
      pendingTracks {
        playlistId
        playlistName
        voteThreshold
        likesNeeded
        skipVotes
        track {
          id
          title
          artist
          albumArtUrl
          likeCount
        }
      }
    }
  }
`
