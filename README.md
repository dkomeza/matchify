# Matchify

Matchify is a collaborative playlist app where groups build Spotify playlists together. Users sign in with Spotify, create or join playlists, propose tracks, and vote on suggestions with a swipe-like flow. When a track reaches the playlist voting threshold, it is approved and can be synced into the owner's Spotify playlist.

## Features

- Spotify OAuth login with encrypted token storage.
- Collaborative playlists with invite codes and member management.
- Track proposals, voting, approval thresholds, and duplicate prevention.
- Realtime GraphQL subscriptions for new proposals and approved tracks.
- Spotify track search and playlist synchronization.
- Last.fm based recommendations with caching and user feedback.
- Home and playlist statistics computed with MongoDB aggregation pipelines.

## Tech Stack

### Backend

- Rust 2024
- Axum
- async-graphql
- Tokio
- MongoDB Rust Driver
- JWT authentication
- AES-256-GCM token encryption
- Reqwest for Spotify and Last.fm API calls

### Mobile / Web App

- Expo
- React Native
- Expo Router
- TypeScript
- urql
- graphql-sse
- Zustand
- NativeWind

### Database

- MongoDB Cloud / MongoDB Atlas
- Document collections for users, playlists, songs, votes, recommendation cache, and recommendation interactions
- Unique indexes for Spotify users, invite codes, playlist tracks, votes, and recommendation interactions

## Repository Structure

```text
.
├── matchify-backend   # Rust GraphQL API
├── matchify-app       # Expo React Native app
├── RAPORT.md          # Technical report in Polish
└── README.md
```

## Backend Overview

The backend exposes a GraphQL API through Axum:

- `POST /graphql` for queries and mutations.
- `POST /graphql/ws` for GraphQL SSE subscriptions.

Most business logic lives in `matchify-backend/src/service`:

- `playlist.rs` handles playlist creation, joining, updates, leaving, and deletion.
- `song.rs` handles proposals, voting, approval, transactions, and Spotify sync.
- `recommendation.rs` handles Last.fm recommendations, cache, scoring, and user feedback.
- `stats.rs` builds reporting data through MongoDB aggregation pipelines.
- `spotify.rs` handles OAuth, token refresh, search, playlist creation, and track insertion.

## Requirements

- Rust and Cargo
- Node.js or Bun/npm
- MongoDB Atlas cluster
- Spotify Developer app
- Last.fm API key

## Backend Setup

Create `matchify-backend/.env`:

```env
PORT=8082
MONGO_URI=mongodb+srv://<user>:<password>@<cluster-url>/?retryWrites=true&w=majority
ENCRYPTION_KEY=12345678901234567890123456789012
JWT_SECRET=change-me-to-at-least-32-characters
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
LASTFM_API_KEY=your_lastfm_api_key
```

Notes:

- `ENCRYPTION_KEY` must be exactly 32 bytes.
- `JWT_SECRET` must be at least 32 characters.
- The backend selects the `matchify` database in code.
- MongoDB Atlas Network Access must allow the machine running the backend.

Run the backend:

```bash
cd matchify-backend
cargo run
```

Run tests:

```bash
cd matchify-backend
cargo test
```

Some integration tests are marked as ignored because they require a reachable MongoDB instance:

```bash
cd matchify-backend
cargo test -- --ignored
```

## App Setup

Create `matchify-app/.env.local`:

```env
EXPO_PUBLIC_API_URL=http://localhost:8082
EXPO_PUBLIC_SPOTIFY_CLIENT_ID=your_spotify_client_id
```

Install dependencies and start Expo:

```bash
cd matchify-app
npm install
npm run start
```

Run the web target:

```bash
cd matchify-app
npm run web
```

Generate GraphQL types:

```bash
cd matchify-app
npm run codegen
```

## Documentation

For a deeper technical description of the backend architecture, data model, MongoDB operations, and implementation decisions, see [RAPORT.md](./RAPORT.md).
