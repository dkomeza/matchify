# Matchify — Project Manifest

Matchify is a collaborative music playlist app where groups of users vote on song proposals using a Tinder-style swipe mechanic. Songs are automatically added to the shared playlist once they reach a configurable vote threshold.

---

## Architecture

```
Expo App (iOS / Android / Web)
  └─ GraphQL over HTTP + SSE (Server-Sent Events)
       └─ Rust Backend  (axum + async-graphql)
            ├─ MongoDB   (users, playlists, songs, votes)
            └─ Spotify Web API  (search, OAuth, playlist sync)
```

| Layer | Technology |
|---|---|
| Frontend | React Native (Expo 55, Expo Router, TypeScript) |
| GraphQL Client | urql (native SSE subscription support) |
| Backend | Rust 2024, axum, async-graphql |
| Database | MongoDB (transactions + aggregation pipelines) |
| Music catalog | Spotify Web API |
| Auth | Spotify OAuth 2.0 → JWT (issued by backend) |

### Responsibility split

- **Frontend** — UI, swipe interactions (react-native-reanimated), Spotify OAuth via `expo-auth-session`, GraphQL queries/mutations/subscriptions
- **Backend** — business logic, vote tallying, Spotify API proxy, JWT issuance and validation
- **MongoDB** — persistent storage; aggregation pipelines count votes per song; transactions atomically update vote count + song status

---

## Authentication Flow

1. App opens Spotify OAuth URL via `expo-auth-session`
2. Spotify redirects back with an authorization `code`
3. App calls `loginWithSpotify(code, redirectUri)` mutation
4. Backend exchanges code → Spotify access + refresh tokens, upserts user, returns a signed JWT
5. All subsequent requests send `Authorization: Bearer <token>`
6. Backend refreshes Spotify tokens transparently when expired

---

## Data Models

### `users`

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `spotify_id` | String | unique |
| `display_name` | String | |
| `email` | String | |
| `profile_image_url` | String | nullable |
| `access_token` | String | encrypted at rest |
| `refresh_token` | String | encrypted at rest |
| `token_expires_at` | DateTime | |
| `created_at` | DateTime | |

### `playlists`

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `name` | String | |
| `description` | String | nullable |
| `owner_id` | ObjectId | ref: users |
| `member_ids` | [ObjectId] | ref: users |
| `invite_code` | String | unique, random 8-char code |
| `vote_threshold` | Int | default: ceil(members / 2) |
| `spotify_playlist_id` | String | nullable; set when synced to Spotify |
| `created_at` | DateTime | |
| `updated_at` | DateTime | |

### `songs` (proposals + approved tracks)

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `playlist_id` | ObjectId | ref: playlists |
| `spotify_track_id` | String | |
| `title` | String | |
| `artist` | String | |
| `album` | String | |
| `album_art_url` | String | |
| `preview_url` | String | nullable |
| `duration_ms` | Int | |
| `proposed_by` | ObjectId | ref: users |
| `status` | Enum | `pending` \| `approved` \| `skipped` |
| `like_count` | Int | denormalized; incremented on each `LIKE` vote |
| `created_at` | DateTime | |

Indexes:
- `(playlist_id, status)` — for fetching approved tracks or pending proposals
- `(playlist_id, spotify_track_id)` unique — prevents duplicate proposals

### `votes`

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `song_id` | ObjectId | ref: songs |
| `playlist_id` | ObjectId | ref: playlists |
| `user_id` | ObjectId | ref: users |
| `vote` | Enum | `like` \| `skip` |
| `created_at` | DateTime | |

Indexes:
- `(song_id, user_id)` unique — prevents double voting

**Vote + approval transaction:** when a `LIKE` vote pushes `like_count >= vote_threshold`, the backend opens a MongoDB transaction that atomically increments `like_count` and sets `status = approved`. An aggregation pipeline on `votes` is used for audit recounts.

---

## Requirements

### 1. CRUD

| Operation | Entity | GraphQL operation |
|---|---|---|
| Create user | `users` | `loginWithSpotify` (upsert) |
| Read user | `users` | `me` |
| Create playlist | `playlists` | `createPlaylist` |
| Read playlists | `playlists` | `myPlaylists`, `playlist` |
| Update playlist | `playlists` | `updatePlaylist` |
| Delete membership | `playlists.member_ids` | `leavePlaylist` |
| Create song proposal | `songs` | `proposeTrack`, `addInitialTracks` |
| Read proposals | `songs` | `nextProposal`, `playlist.proposals` |
| Create vote | `votes` | `voteOnTrack` |
| Read votes | `votes` | (via `track.likeCount`, `track.myVote`) |

### 2. Transactions — concurrent vote + approval

**Problem:** multiple users can cast the deciding vote simultaneously. Without a transaction, two concurrent requests could both read `like_count = threshold - 1`, both increment it, and both attempt to set `status = approved`, resulting in duplicate approval events or inconsistent state.

**Solution:** `voteOnTrack` with a `LIKE` uses a MongoDB multi-document transaction:

```
BEGIN TRANSACTION
  1. INSERT vote document (fails fast if duplicate key — user already voted)
  2. INCREMENT songs.like_count by 1
  3. READ current like_count
  4. IF like_count >= playlist.vote_threshold
       UPDATE songs.status = "approved"   ← only one transaction wins
COMMIT
```

The unique index on `(song_id, user_id)` in `votes` acts as the concurrency guard — only the first insert succeeds; concurrent duplicates abort at step 1. The status transition happens inside the same transaction, so it is atomic and happens exactly once.

### 3. Reporting — aggregation across multiple collections

`playlistStats` is a dedicated reporting query that runs a MongoDB aggregation pipeline joining `songs`, `votes`, and `users` to produce a summary. It cannot be answered from a single collection.

**Pipeline sketch:**
```
songs (filter by playlist_id)
  └─ $lookup → votes          (join all votes per song)
  └─ $lookup → users          (resolve proposedBy)
  └─ $group  → per-song stats (likeCount, skipCount, voters)
  └─ $group  → playlist-level totals + per-member participation
  └─ $project → PlaylistStats shape
```

See `playlistStats` query and `PlaylistStats` type in the GraphQL schema below.

---

## GraphQL Schema

### Types

```graphql
type User {
  id: ID!
  spotifyId: String!
  displayName: String!
  profileImageUrl: String
  playlists: [Playlist!]!
}

type Playlist {
  id: ID!
  name: String!
  description: String
  owner: User!
  members: [User!]!
  inviteCode: String!
  voteThreshold: Int!
  tracks: [Track!]!       # approved tracks only
  proposals: [Track!]!    # pending proposals
  createdAt: DateTime!
}

type Track {
  id: ID!
  spotifyTrackId: String!
  title: String!
  artist: String!
  album: String!
  albumArtUrl: String!
  previewUrl: String
  durationMs: Int!
  status: TrackStatus!
  likeCount: Int!
  myVote: VoteType        # null if the caller has not voted yet
  proposedBy: User!
  createdAt: DateTime!
}

type SpotifyTrack {
  spotifyTrackId: String!
  title: String!
  artist: String!
  album: String!
  albumArtUrl: String!
  previewUrl: String
  durationMs: Int!
}

type AuthPayload {
  token: String!
  user: User!
}

type PlaylistStats {
  playlistId: ID!
  totalProposals: Int!
  approvedCount: Int!
  pendingCount: Int!
  skippedCount: Int!
  approvalRate: Float!          # approvedCount / totalProposals
  totalVotesCast: Int!
  memberParticipation: [MemberStat!]!
  topProposals: [Track!]!       # pending tracks ranked by likeCount
}

type MemberStat {
  user: User!
  votesCast: Int!
  tracksProposed: Int!
  participationRate: Float!     # votesCast / totalProposals
}

enum TrackStatus { PENDING  APPROVED  SKIPPED }
enum VoteType    { LIKE  SKIP }

input CreatePlaylistInput {
  name: String!
  description: String
  voteThreshold: Int
}

input UpdatePlaylistInput {
  name: String
  description: String
  voteThreshold: Int
}
```

### Queries

```graphql
type Query {
  me: User
  playlist(id: ID!): Playlist
  myPlaylists: [Playlist!]!
  nextProposal(playlistId: ID!): Track                    # next proposal the caller has not voted on
  searchTracks(query: String!, limit: Int): [SpotifyTrack!]!
  playlistStats(playlistId: ID!): PlaylistStats!          # aggregation report across songs + votes + users
}
```

### Mutations

```graphql
type Mutation {
  # Auth
  loginWithSpotify(code: String!, redirectUri: String!): AuthPayload!

  # Playlists
  createPlaylist(input: CreatePlaylistInput!): Playlist!
  joinPlaylist(inviteCode: String!): Playlist!
  leavePlaylist(playlistId: ID!): Boolean!
  updatePlaylist(id: ID!, input: UpdatePlaylistInput!): Playlist!

  # Tracks
  addInitialTracks(playlistId: ID!, spotifyTrackIds: [String!]!): [Track!]!
  proposeTrack(playlistId: ID!, spotifyTrackId: String!): Track!
  voteOnTrack(trackId: ID!, vote: VoteType!): Track!
}
```

### Subscriptions

Delivered via **Server-Sent Events** (SSE) over a persistent HTTP connection. Clients send mutations over regular HTTP POST; the server pushes events back via SSE. No WebSocket infrastructure required. `async-graphql` supports SSE subscriptions natively; `urql` consumes them via `@urql/subscriptions-sse`.

```graphql
type Subscription {
  trackApproved(playlistId: ID!): Track!  # fired when a track reaches the threshold
  newProposal(playlistId: ID!): Track!    # fired when a new proposal is added
}
```

---

## Feature Breakdown

### Priority 1 — MVP

| ID | Feature | Description |
|---|---|---|
| F1 | Spotify OAuth | Login via Spotify; backend stores encrypted tokens and issues JWT |
| F2 | Create playlist | Owner creates a playlist; receives a shareable invite code |
| F3 | Join playlist | Any user joins via invite code |
| F4 | Seed initial tracks | Owner searches Spotify and adds ~10 starting tracks (`addInitialTracks`) |
| F5 | Proposal queue | Members are shown one unvoted proposal at a time (`nextProposal`) |
| F6 | Vote (like / skip) | Swipe-style interaction; vote stored; double-vote prevented by unique index |
| F7 | Auto-approval | Backend transaction: when `like_count >= vote_threshold`, song status → `approved` |
| F8 | Playlist view | Approved tracks list + member roster |

### Priority 2 — Enhanced

| ID | Feature | Description |
|---|---|---|
| F9 | Propose a track | Members search Spotify and submit new proposals (`proposeTrack`) |
| F10 | Real-time updates | SSE subscriptions push `trackApproved` and `newProposal` events |
| F11 | Spotify playlist sync | Approved tracks are written to a real Spotify playlist via the API |
| F12 | Member management | Owner can remove members; any member can leave |

---

## Backend Crates

| Crate | Purpose |
|---|---|
| `axum` | HTTP server |
| `async-graphql` + `async-graphql-axum` | GraphQL execution and HTTP/SSE transport |
| `mongodb` | Official async MongoDB driver |
| `reqwest` | Spotify Web API HTTP calls |
| `jsonwebtoken` | JWT signing and validation |
| `serde` / `serde_json` | Serialization |
| `tokio` | Async runtime |
| `dotenvy` | Environment configuration |

## Frontend Additions Required

| Package | Purpose |
|---|---|
| `urql` + `@urql/subscriptions-sse` | GraphQL client with SSE subscription support |
| `expo-auth-session` | Spotify OAuth PKCE flow |
| `expo-web-browser` | Opens OAuth browser session |
| `expo-secure-store` | Secure JWT storage on device |
