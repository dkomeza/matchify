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

export const refreshMyPlaylists = (client: Client) =>
  client.query(MY_PLAYLISTS_QUERY, {}, { requestPolicy: 'network-only' }).toPromise()
