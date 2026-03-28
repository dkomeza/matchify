# Matchify — Style Guide

## Design Philosophy

**Dark. Minimal. Liquid Glass.**

Matchify's visual language is inspired by Apple's Liquid Glass material system (iOS 26 / visionOS). Surfaces are translucent and blurred, revealing depth through layering rather than opaque separation. The aesthetic prioritises restraint: no decorative borders, no heavy drop shadows — just material, light, and motion.

Three principles guide every decision:

1. **Depth through transparency** — elevation is communicated by glass opacity and blur intensity, not solid colour changes.
2. **Semantic colour** — colour is reserved for meaning (like, skip, brand) and avoided as decoration.
3. **Motion serves state** — animations communicate transitions and feedback; they never play for their own sake.

---

## Colour

### Base

| Token | Value | Usage |
|---|---|---|
| `background` | `#08080C` | App background — near-black with a barely-perceptible cool tint |
| `backgroundElevated` | `#111116` | Slightly lifted surfaces (bottom sheets, modals) |

### Glass Materials

Glass surfaces are always paired with a blur effect (see [Blur](#blur)). The fill values below are the `backgroundColor` of the view sitting on top of the `BlurView`.

| Token | Fill | Blur | Usage |
|---|---|---|---|
| `glass` | `rgba(255,255,255,0.07)` | 24px | Default glass card |
| `glassRaised` | `rgba(255,255,255,0.11)` | 32px | Elevated / focused glass |
| `glassActive` | `rgba(255,255,255,0.16)` | 20px | Pressed / active state |
| `glassBorder` | `rgba(255,255,255,0.12)` | — | 1px edge border on glass surfaces |
| `glassHighlight` | `rgba(255,255,255,0.20)` | — | 0.5px top-edge specular highlight |

### Text

| Token | Value | Usage |
|---|---|---|
| `text` | `#FFFFFF` | Primary text |
| `textSecondary` | `rgba(255,255,255,0.55)` | Supporting text, meta |
| `textTertiary` | `rgba(255,255,255,0.30)` | Placeholder, disabled |

### Semantic & Brand

| Token | Value | Usage |
|---|---|---|
| `brand` | `#BF5AF2` | Matchify brand (Apple system purple) |
| `brandGlow` | `rgba(191,90,242,0.35)` | Soft ambient glow behind brand elements |
| `like` | `#30D158` | "Like" vote action (Apple green) |
| `likeGlow` | `rgba(48,209,88,0.30)` | Glow on like button / card bleed |
| `skip` | `#FF453A` | "Skip" vote action (Apple red) |
| `skipGlow` | `rgba(255,69,58,0.30)` | Glow on skip button / card bleed |
| `accent` | `#0A84FF` | Links, progress indicators, info states |

### Usage Rules

- **Never** use semantic colours (like, skip, brand) for decorative purposes.
- **Never** place coloured text on a coloured background without sufficient contrast (WCAG AA minimum).
- Use `textSecondary` for anything below the primary hierarchy — artist names, timestamps, counts.
- The background should be visible behind every glass surface; never fill a glass card with an opaque colour.

---

## Typography

The font stack uses system defaults — SF Pro on iOS, Roboto on Android, and custom CSS variables on Web (defined in `global.css`).

| Name | Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| `display` | 56px | 700 | 60px | Hero text on vote cards (track title) |
| `title` | 48px | 600 | 52px | Screen-level headings |
| `subtitle` | 32px | 600 | 44px | Section headings |
| `default` | 16px | 500 | 24px | Body copy |
| `small` | 14px | 500 | 20px | Captions, metadata |
| `smallBold` | 14px | 700 | 20px | Emphasis within captions |
| `micro` | 11px | 500 | 14px | Chip labels, badge text |

### Rules

- Track titles on vote cards use `display` weight — this is the hero moment.
- Artist names and album titles use `textSecondary` + `subtitle`.
- Never use more than two type sizes in a single component.
- Avoid manual `fontWeight` overrides — use the defined type scale variants.

---

## Spacing

Base scale (from `theme.ts`):

| Token | Value |
|---|---|
| `Spacing.half` | 2px |
| `Spacing.one` | 4px |
| `Spacing.two` | 8px |
| `Spacing.three` | 16px |
| `Spacing.four` | 24px |
| `Spacing.five` | 32px |
| `Spacing.six` | 64px |

Semantic aliases:

| Alias | Value | Usage |
|---|---|---|
| `ScreenPadding` | 24px | Horizontal edge margin on every screen |
| `CardPadding` | 24px | Internal padding inside glass cards |
| `SectionGap` | 32px | Vertical gap between major screen sections |

---

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `RadiusXS` | 8px | Chips, small tags, micro badges |
| `RadiusSM` | 12px | Buttons, text inputs |
| `RadiusMD` | 20px | Glass cards, standard surfaces |
| `RadiusLG` | 28px | Bottom sheets, large modals |
| `RadiusXL` | 40px | Vote card (full-bleed hero card) |
| `RadiusFull` | 9999px | Avatars, circular action buttons, pill tabs |

---

## Blur

Blur is the foundation of Liquid Glass. Every glass surface must be paired with a `BlurView` (native) or `backdrop-filter` (web).

| Intensity | Blur value | Usage |
|---|---|---|
| Subtle | 16px | Light overlays, tooltips |
| Regular | 24px | Default glass cards |
| Heavy | 32px | Raised surfaces, vote card overlay, tab bar |
| Ultra | 48px | Full-screen overlays, modals |

### Implementation

```tsx
// Native (iOS & Android) — expo-blur
import { BlurView } from 'expo-blur';

<BlurView intensity={80} tint="dark" style={styles.glass}>
  <View style={styles.glassFill}>
    {children}
  </View>
</BlurView>

// glassFill backgroundColor = Colors.glass ('rgba(255,255,255,0.07)')
```

```tsx
// Web — via StyleSheet (backdrop-filter)
// Use a GlassView utility component that swaps BlurView for a div with
// backdropFilter on web (react-native-web passes unknown style props through).
```

A shared `GlassView` component (`src/components/ui/glass-view.tsx`) wraps this platform split and accepts an `intensity` prop.

---

## Component Patterns

### Glass Card

```
┌─────────────────────────────────────┐  ← glassHighlight (0.5px top)
│                                     │
│   Content                           │  ← glass fill + BlurView
│                                     │
└─────────────────────────────────────┘  ← glassBorder (1px)

borderRadius: RadiusMD (20)
shadow: 0 8px 32px rgba(0,0,0,0.5)
padding: CardPadding (24)
```

### Vote Card

```
┌────────────────────────────────────────┐
│                                        │
│          Album Art (full-bleed)        │
│                                        │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  Track Title      display/700    │  │  ← glassRaised + BlurView (32px)
│  │  Artist Name      textSecondary  │  │
│  │  Album · Duration textTertiary   │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘

borderRadius: RadiusXL (40)
Swipe right → like bleed (likeGlow tint over card)
Swipe left  → skip bleed (skipGlow tint over card)
Bleed activates at 30% of swipe threshold
```

### Action Buttons (Like / Skip)

```
Size: 64×64px circle (RadiusFull)
Fill: glass (rgba(255,255,255,0.07)) + BlurView (24px)
Ring: 1.5px solid, like → #30D158 / skip → #FF453A
Icon: 28px SF Symbol / equivalent
Glow: likeGlow / skipGlow as boxShadow or shadow layer

Pressed state:
  fill → glassActive
  scale → 0.95 (spring animation)
```

### Tab Bar

```
Floating pill, horizontally centred, 16px above safe area bottom
Fill: glass + BlurView (32px)
Border: glassBorder
Brand label on the left, nav triggers on the right
borderRadius: RadiusFull
```

### Text Input

```
Fill: glass (rgba(255,255,255,0.07))
Border: glassBorder (1px)
Focus border: accent (#0A84FF), 1.5px
borderRadius: RadiusSM (12)
height: 48px
placeholder: textTertiary
```

---

## Motion & Animation

### Principles

- Every animation must communicate a state change — no idle or decorative motion.
- Prefer **spring** for gestures; **timing** for state transitions.
- Keep durations short — users are interacting, not watching.

### Curves

| Type | Config | Usage |
|---|---|---|
| Spring (gesture) | `mass: 1, damping: 18, stiffness: 200` | Swipe cards, button press/release |
| Ease-out (transition) | `duration: 250ms` | Screen transitions, fade-in |
| Ease-in-out (layout) | `duration: 300ms` | Bottom sheet open/close |

### Vote Card Swipe

1. Card translates and rotates proportionally to drag distance.
2. At 30% threshold: like/skip glow colour bleeds in over album art (opacity `0` → `0.6`).
3. At 100% threshold: card flies off screen with spring velocity, next card scales in.
4. On release below threshold: spring-returns to centre.

### Button Press

Scale `1.0` → `0.95` on press (spring), `0.95` → `1.0` on release (spring).

---

## Platform Notes

| Concern | iOS | Android | Web |
|---|---|---|---|
| Blur | `expo-blur` BlurView | `expo-blur` BlurView (limited fidelity) | CSS `backdrop-filter` |
| Font | SF Pro (system-ui) | Roboto (normal) | CSS variable `--font-display` |
| Tab bar | `NativeTabs` (native feel) | `NativeTabs` | Floating pill (`app-tabs.web.tsx`) |
| Safe areas | `react-native-safe-area-context` | same | not needed |

Android blur fidelity is lower than iOS — test glass cards on a physical Android device and increase the glass fill opacity to `0.13` on Android if contrast is insufficient (`Platform.OS === 'android'`).

---

## What to Avoid

- Opaque coloured surfaces (defeats the glass system)
- Multiple accent colours in one view
- Text smaller than 11px (`micro`) in interactive elements
- Animations longer than 400ms
- Gradient fills for anything other than album art backgrounds
- `fontSize` / `fontWeight` set inline — always use `ThemedText` with a defined `type`
