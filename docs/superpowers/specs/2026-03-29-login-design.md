# Login Design — Matchify App

**Date:** 2026-03-29
**Scope:** App-side Spotify OAuth login flow (backend integration deferred)

---

## Overview

Users authenticate via Spotify OAuth using `expo-auth-session` with PKCE. Auth state is managed in a Zustand store, persisted to the device keychain via `expo-secure-store`. The root layout guards navigation based on auth status, redirecting unauthenticated users to the welcome screen and authenticated users to the home screen.

---

## Data & Store

### `SpotifyUser`

```ts
interface SpotifyUser {
  id: string
  displayName: string
  imageUrl: string | null
}
```

### `useAuthStore` (Zustand + persist)

```ts
type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthStore {
  status: AuthStatus
  accessToken: string | null
  refreshToken: string | null
  expiresAt: number | null   // Unix ms
  user: SpotifyUser | null
  login: () => Promise<void>
  logout: () => void
}
```

The store uses Zustand's `persist` middleware with a custom storage adapter wrapping `expo-secure-store`. On app start, `status` is `'loading'` while persisted state hydrates from the keychain, then transitions to `'authenticated'` or `'unauthenticated'`.

`login()` runs the full OAuth flow (see below) and sets `status: 'authenticated'` on success.
`logout()` clears all fields and sets `status: 'unauthenticated'`.

**Token refresh:** Out of scope. Expired tokens trigger a logout. A `refreshTokens()` action will be added when the backend is ready.

---

## Navigation & Auth Guard

### Root `_layout.tsx`

Subscribes to `useAuthStore`. Uses `useSegments` + `useEffect` to redirect on status change:

| Status | Current route | Action |
|---|---|---|
| `'loading'` | any | Render splash screen |
| `'unauthenticated'` | not `/welcome` | `router.replace('/welcome')` |
| `'authenticated'` | `/welcome` | `router.replace('/')` |
| any | correct route | No-op |

### `index.tsx`

Becomes the authenticated home screen. For now it renders the main tabs layout. The layout guard handles all redirects — `index.tsx` does not redirect itself.

### `SpotifyButton`

Calls `useAuthStore(s => s.login)` on press. Shows a loading state while the OAuth flow is in progress.

---

## OAuth Flow

Because `expo-auth-session`'s `useAuthRequest` is a React hook, it cannot be called inside a Zustand action. The flow is split between a thin `useSpotifyLogin` hook and the store:

**`useSpotifyLogin` hook** (lives in `src/hooks/use-spotify-login.ts`):
1. Calls `useAuthRequest` pointing to `https://accounts.spotify.com/authorize` with `usePKCE: true`
2. Requested scopes: `user-read-private user-read-email` (minimum for profile; expanded when backend requires more)
3. Exposes a `login()` function that calls `promptAsync()` and an `isLoading` boolean
4. On auth code received, exchanges it for tokens via `POST https://accounts.spotify.com/api/token`
5. Fetches basic profile from `GET https://api.spotify.com/v1/me`
6. Calls `authStore.setSession(accessToken, refreshToken, expiresAt, user)` to persist and set `status: 'authenticated'`

**`useAuthStore`** gains a `setSession()` action (replaces `login()`):
```ts
setSession: (accessToken: string, refreshToken: string, expiresAt: number, user: SpotifyUser) => void
```

`logout()` remains on the store.

On any failure (user cancels, network error, token exchange fails), `isLoading` resets and the error is surfaced to the button via a returned `error` value.

---

## Splash / Loading Screen

A full-screen component shown while `status === 'loading'`. Displays the Matchify logo mark and wordmark centered on the standard app background. No spinner needed — hydration is near-instant in practice, but the screen prevents a flash of wrong content.

---

## Spotify Developer Setup

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and create a new app
2. Under **Redirect URIs**, add the URI produced by `AuthSession.makeRedirectUri()` for your scheme. For a development build this is typically `exp+matchify://redirect`. Add both dev and production URIs.
3. Copy the **Client ID** from the dashboard
4. Create `.env.local` in the repo root (gitignored) and add:
   ```
   EXPO_PUBLIC_SPOTIFY_CLIENT_ID=your_client_id_here
   ```
5. Ensure `app.json` / `app.config.js` has `"scheme": "matchify"` set — this is what `makeRedirectUri()` uses

**Note:** Spotify apps start in **Development Mode**, which limits access to 25 users. Additional users must be added manually under "User Management" in the dashboard until the app is submitted for quota extension.

---

## Files to Create / Modify

| File | Change |
|---|---|
| `src/store/auth-store.ts` | New — Zustand auth store with persist (`setSession`, `logout`) |
| `src/hooks/use-spotify-login.ts` | New — wraps `useAuthRequest`, token exchange, profile fetch |
| `src/app/_layout.tsx` | Modify — add auth guard with `useSegments` |
| `src/app/index.tsx` | Modify — becomes home screen (render tabs), remove current redirect |
| `src/components/welcome/spotify-button.tsx` | Modify — wire up `login()`, add loading state |
| `src/components/splash-screen.tsx` | New — loading splash component |
| `.env.local` | New — `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` (gitignored) |

---

## Out of Scope

- Token refresh (deferred to backend integration)
- Backend session / JWT exchange
- Additional OAuth scopes beyond profile
- Error toast / UI beyond button loading state
