# Spotify Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Spotify OAuth login using expo-auth-session, persisting tokens to expo-secure-store via a Zustand store, with the root layout guarding navigation based on auth status.

**Architecture:** A Zustand `useAuthStore` persists session data to the device keychain. A `useSpotifyLogin` hook wraps `expo-auth-session`'s `useAuthRequest` (a React hook, so it cannot live inside the store) and calls `setSession()` on success. The root `_layout.tsx` uses `useSegments` + `useEffect` to redirect based on auth status, and shows a splash screen while SecureStore hydrates.

**Tech Stack:** `expo-auth-session`, `expo-secure-store`, `expo-web-browser`, `zustand` (with persist middleware), Expo Router

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/store/auth-store.ts` | Create | Auth state, SecureStore persistence, `setSession`, `logout` |
| `src/hooks/use-spotify-login.ts` | Create | OAuth flow, token exchange, profile fetch |
| `src/components/splash-screen.tsx` | Create | Loading UI while SecureStore hydrates |
| `src/app/_layout.tsx` | Modify | Auth guard with `useSegments` + `useEffect` |
| `src/app/index.tsx` | Modify | Redirect to `/(tabs)/vote` (authenticated home for now) |
| `src/components/welcome/spotify-button.tsx` | Modify | Wire up `useSpotifyLogin`, show loading state |
| `src/__tests__/store/auth-store.test.ts` | Create | Unit tests for store actions |

All paths are relative to `matchify-app/`.

---

## Task 1: Install Zustand and set up Jest

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Zustand**

Run from `matchify-app/`:
```bash
npm install zustand
```
Expected: `zustand` appears in `dependencies` in `package.json`.

- [ ] **Step 2: Install Jest dependencies**

```bash
npm install --save-dev jest-expo @testing-library/react-native @types/jest
```

- [ ] **Step 3: Add Jest config to package.json**

Add a `"jest"` key inside `package.json` (alongside `"scripts"`):
```json
"jest": {
  "preset": "jest-expo"
}
```

Also add a test script to `"scripts"`:
```json
"test": "jest"
```

- [ ] **Step 4: Verify Jest runs**

```bash
npm test -- --passWithNoTests
```
Expected: `Test Suites: 0 passed` (no tests yet, exits 0).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add zustand and jest-expo testing setup"
```

---

## Task 2: Auth Store (TDD)

**Files:**
- Create: `src/__tests__/store/auth-store.test.ts`
- Create: `src/store/auth-store.ts`

- [ ] **Step 1: Create the test file with a failing test**

Create `matchify-app/src/__tests__/store/auth-store.test.ts`:

```ts
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}))

import { act } from '@testing-library/react-native'
import { useAuthStore } from '../../store/auth-store'

const mockUser = {
  id: 'user123',
  displayName: 'Test User',
  imageUrl: null as null,
}

beforeEach(() => {
  useAuthStore.setState({
    status: 'unauthenticated',
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    user: null,
  })
})

describe('useAuthStore', () => {
  it('setSession sets authenticated status and stores all session fields', () => {
    const expiresAt = Date.now() + 3600000
    act(() => {
      useAuthStore.getState().setSession('tok_access', 'tok_refresh', expiresAt, mockUser)
    })
    const s = useAuthStore.getState()
    expect(s.status).toBe('authenticated')
    expect(s.accessToken).toBe('tok_access')
    expect(s.refreshToken).toBe('tok_refresh')
    expect(s.expiresAt).toBe(expiresAt)
    expect(s.user).toEqual(mockUser)
  })

  it('logout clears all session fields and sets unauthenticated status', () => {
    act(() => {
      useAuthStore.getState().setSession('tok_access', 'tok_refresh', Date.now() + 3600000, mockUser)
    })
    act(() => {
      useAuthStore.getState().logout()
    })
    const s = useAuthStore.getState()
    expect(s.status).toBe('unauthenticated')
    expect(s.accessToken).toBeNull()
    expect(s.refreshToken).toBeNull()
    expect(s.expiresAt).toBeNull()
    expect(s.user).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- src/__tests__/store/auth-store.test.ts
```
Expected: FAIL — `Cannot find module '../../store/auth-store'`

- [ ] **Step 3: Create the auth store**

Create `matchify-app/src/store/auth-store.ts`:

```ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as SecureStore from 'expo-secure-store'

const secureStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) => SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
}

export interface SpotifyUser {
  id: string
  displayName: string
  imageUrl: string | null
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthState {
  status: AuthStatus
  accessToken: string | null
  refreshToken: string | null
  expiresAt: number | null
  user: SpotifyUser | null
}

interface AuthActions {
  setSession: (
    accessToken: string,
    refreshToken: string,
    expiresAt: number,
    user: SpotifyUser
  ) => void
  logout: () => void
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      status: 'loading',
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      user: null,
      setSession: (accessToken, refreshToken, expiresAt, user) =>
        set({ status: 'authenticated', accessToken, refreshToken, expiresAt, user }),
      logout: () =>
        set({
          status: 'unauthenticated',
          accessToken: null,
          refreshToken: null,
          expiresAt: null,
          user: null,
        }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => secureStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.status = state.accessToken ? 'authenticated' : 'unauthenticated'
        }
      },
    }
  )
)
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm test -- src/__tests__/store/auth-store.test.ts
```
Expected: `Tests: 2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/store/auth-store.ts src/__tests__/store/auth-store.test.ts
git commit -m "feat: add auth store with persist middleware"
```

---

## Task 3: useSpotifyLogin Hook

**Files:**
- Create: `src/hooks/use-spotify-login.ts`

`expo-auth-session`, external fetch calls, and the OAuth flow are all too I/O-heavy to unit-test meaningfully. This task has no TDD step.

- [ ] **Step 1: Create the hook**

Create `matchify-app/src/hooks/use-spotify-login.ts`:

```ts
import { useState, useEffect } from 'react'
import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import { useAuthStore } from '@/store/auth-store'
import type { SpotifyUser } from '@/store/auth-store'

WebBrowser.maybeCompleteAuthSession()

const CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID!

const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
}

export function useSpotifyLogin() {
  const setSession = useAuthStore((s) => s.setSession)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'matchify' })

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID,
      scopes: ['user-read-private', 'user-read-email'],
      usePKCE: true,
      redirectUri,
    },
    DISCOVERY
  )

  useEffect(() => {
    if (!response) return
    if (response.type === 'success') {
      exchangeCodeForSession(response.params.code)
    } else if (response.type === 'error') {
      setError(response.error?.message ?? 'Authentication failed')
      setIsLoading(false)
    } else {
      // cancelled or dismissed
      setIsLoading(false)
    }
  }, [response])

  async function exchangeCodeForSession(code: string) {
    try {
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: CLIENT_ID,
          code_verifier: request!.codeVerifier!,
        }).toString(),
      })
      if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`)
      const tokens = await tokenRes.json()

      const profileRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (!profileRes.ok) throw new Error(`Profile fetch failed: ${profileRes.status}`)
      const profile = await profileRes.json()

      const user: SpotifyUser = {
        id: profile.id,
        displayName: profile.display_name ?? profile.id,
        imageUrl: profile.images?.[0]?.url ?? null,
      }

      setSession(
        tokens.access_token,
        tokens.refresh_token,
        Date.now() + tokens.expires_in * 1000,
        user
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  const login = () => {
    setIsLoading(true)
    setError(null)
    promptAsync()
  }

  return { login, isLoading, error, ready: !!request }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-spotify-login.ts
git commit -m "feat: add useSpotifyLogin hook for Spotify OAuth flow"
```

---

## Task 4: Splash Screen Component

**Files:**
- Create: `src/components/splash-screen.tsx`

- [ ] **Step 1: Create the component**

Create `matchify-app/src/components/splash-screen.tsx`:

```tsx
import { StyleSheet, View } from 'react-native'
import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'

export function SplashScreen() {
  return (
    <View style={styles.container}>
      <ThemedText style={styles.logoMark} themeColor="brand">
        ✦
      </ThemedText>
      <ThemedText type="smallBold" style={styles.wordmark}>
        matchify
      </ThemedText>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoMark: { fontSize: 32, lineHeight: 38 },
  wordmark: { fontSize: 20, letterSpacing: 0.5, color: Colors.text },
})
```

- [ ] **Step 2: Commit**

```bash
git add src/components/splash-screen.tsx
git commit -m "feat: add splash screen component for auth loading state"
```

---

## Task 5: Root Layout Auth Guard

**Files:**
- Modify: `src/app/_layout.tsx`

- [ ] **Step 1: Replace the layout with the auth guard**

Replace the full contents of `matchify-app/src/app/_layout.tsx`:

```tsx
import { DarkTheme, ThemeProvider } from '@react-navigation/native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { SplashScreen } from '@/components/splash-screen'

export default function RootLayout() {
  const status = useAuthStore((s) => s.status)
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    if (status === 'loading') return

    const onWelcome = segments[0] === 'welcome'

    if (status === 'unauthenticated' && !onWelcome) {
      router.replace('/welcome')
    } else if (status === 'authenticated' && onWelcome) {
      router.replace('/')
    }
  }, [status, segments])

  if (status === 'loading') {
    return <SplashScreen />
  }

  return (
    <ThemeProvider value={DarkTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </ThemeProvider>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "feat: add auth guard to root layout using useSegments"
```

---

## Task 6: Update index.tsx

**Files:**
- Modify: `src/app/index.tsx`

The auth guard in `_layout.tsx` ensures only authenticated users reach this route. `index.tsx` redirects to the tabs — the layout guard handles redirecting unauthenticated users before they get here.

- [ ] **Step 1: Replace index.tsx**

Replace the full contents of `matchify-app/src/app/index.tsx`:

```tsx
import { Redirect } from 'expo-router'

export default function Index() {
  return <Redirect href="/(tabs)/vote" />
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/index.tsx
git commit -m "feat: update index to redirect to tabs (auth guard in layout)"
```

---

## Task 7: Wire Up SpotifyButton

**Files:**
- Modify: `src/components/welcome/spotify-button.tsx`

- [ ] **Step 1: Replace the button with the wired-up version**

Replace the full contents of `matchify-app/src/components/welcome/spotify-button.tsx`:

```tsx
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { GlassSurface } from '@/components/glass-surface'
import { ThemedText } from '@/components/themed-text'
import { Radius, Spacing } from '@/constants/theme'
import { useSpotifyLogin } from '@/hooks/use-spotify-login'

const SPOTIFY_GREEN = '#1DB954'

export function SpotifyButton() {
  const scale = useSharedValue(1)
  const { login, isLoading, ready } = useSpotifyLogin()

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const handlePressIn = () => {
    scale.value = withTiming(0.97, { duration: 80 })
  }

  const handlePressOut = () => {
    scale.value = withTiming(1, { duration: 200 })
  }

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={login}
        disabled={isLoading || !ready}
      >
        <GlassSurface
          glassEffectStyle="regular"
          colorScheme="dark"
          tintColor="rgba(29,185,84,0.20)"
          style={styles.surface}
          forceFallback
          className="overflow-hidden"
        >
          <View style={styles.inner}>
            {isLoading ? (
              <ActivityIndicator color={SPOTIFY_GREEN} size="small" />
            ) : (
              <>
                <ThemedText style={styles.icon}>♫</ThemedText>
                <ThemedText type="smallBold">Continue with Spotify</ThemedText>
              </>
            )}
          </View>
        </GlassSurface>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: 'rgba(29,185,84,0.65)',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  icon: { fontSize: 20, color: SPOTIFY_GREEN },
})
```

- [ ] **Step 2: Commit**

```bash
git add src/components/welcome/spotify-button.tsx
git commit -m "feat: wire SpotifyButton to useSpotifyLogin hook with loading state"
```

---

## Task 8: Spotify Developer Setup & Environment

**Files:**
- Create: `matchify-app/.env.local` (gitignored — do not commit)

- [ ] **Step 1: Confirm .env.local is gitignored**

Check `matchify-app/.gitignore` — it already contains `.env*.local`, so `.env.local` is covered. No change needed.

- [ ] **Step 2: Create the env file**

Create `matchify-app/.env.local` (do not commit this file):

```
EXPO_PUBLIC_SPOTIFY_CLIENT_ID=your_client_id_here
```

Replace `your_client_id_here` with the Client ID from your Spotify Developer Dashboard app.

- [ ] **Step 3: Set up the Spotify app (if not done)**

1. Go to https://developer.spotify.com/dashboard and create a new app (or open your existing one)
2. Under **Settings → Redirect URIs**, add:
   - `matchify://redirect` (for development builds with custom scheme)
3. Save the changes
4. Copy the **Client ID** and paste it into `.env.local`

> **Note:** Your Spotify app starts in Development Mode, which limits access to 25 users. Add any testers manually under "User Management" in the dashboard.

- [ ] **Step 4: Verify the redirect URI matches**

The hook uses `AuthSession.makeRedirectUri({ scheme: 'matchify' })`. With `"scheme": "matchify"` already set in `app.json`, this produces `matchify://redirect`. Confirm this matches what you registered in the Spotify dashboard.

- [ ] **Step 5: Rebuild the dev client and test the full flow**

```bash
# From matchify-app/
expo run:ios   # or expo run:android
```

1. App should show the splash screen briefly on launch
2. Unauthenticated → redirected to welcome screen
3. Tap "Continue with Spotify" → Spotify OAuth browser opens
4. Authenticate → returns to app → redirected to `/(tabs)/vote`
5. Kill and reopen the app → should go straight to `/(tabs)/vote` (token persisted)
6. (Optional) Call `useAuthStore.getState().logout()` via a dev button → should redirect back to welcome

---

## Completion Checklist

- [ ] `npm test` passes (2 tests green)
- [ ] App launches and shows splash briefly
- [ ] Unauthenticated users land on welcome screen
- [ ] Spotify OAuth opens in system browser
- [ ] After login, user lands on `/(tabs)/vote`
- [ ] Killing and relaunching the app skips welcome (token persisted)
- [ ] Calling `logout()` redirects back to welcome
