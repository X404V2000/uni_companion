# Week 4, Day 1 — Restructured Blueprint

**To:** Implementation (DeepSeek V4, guided by founder)
**From:** Senior Systems Design & Architecture Engineer
**Date:** 29 September 2026
**Status:** Specification Active — restructured for execution clarity
**Branch:** `week4-day1-frontend-rework` off `develop`
**Duration:** 7–8 hours
**No backend changes. One dev dependency permitted: `vite-plugin-pwa`.**

---

## §1. Context

### Where we are

The frontend is a Figma-generated React 19 + Vite 8 + Tailwind CSS 4 app. It's functional, integrated with the backend, and demoed. It works. But it has three problems that compound:

1. **Everything is in one file.** `App.tsx` is ~800 lines. Every new screen makes it harder to change.
2. **The copy is AI-uplifting.** Slogans, greetings, motivational headers. It reads like a chatbot, not a tool.
3. **The palette is cream-on-cream.** No weight, no contrast, no clarity.

Day 1 fixes all three, then converts the app to a PWA.

### Why these are bundled

They touch the same files. Doing them separately means four passes over the same component tree. Doing them together is one pass, one verification, one commit.

### The order is non-negotiable

**Refactor → Copy → Palette → Responsive → PWA.**

Each step is verified before the next begins. If Step 2 breaks Step 1, we find out immediately, not four hours later.

### What "verified" means at each step

After each deliverable, the engineer runs the app in dev mode and clicks through every screen. If anything looks or behaves differently than before the step started, the step is incomplete. Fix it before moving on.

---

## §2. Deliverable 1 — File Refactor

### What it does

Split the single 800-line `App.tsx` into five files. **Pure file move.** No logic changes. No visual changes. The rendered output must be byte-identical before and after.

### New structure

```
frontend/src/
├── main.tsx                     (unchanged — mounts App)
├── index.css                    (unchanged in this step — palette comes later)
├── App.tsx                      (app shell: header, bottom nav, tab routing)
├── components/
│   ├── Icon.tsx                 (the icon system — all icon paths)
│   ├── AuthPage.tsx             (login/signup view)
│   ├── OverviewTab.tsx          (dashboard content)
│   └── PlaceholderTab.tsx       (for AI / Find / Saved / Planner tabs)
└── lib/                         (empty for now)
```

### What moves where

| From `App.tsx` | To | Export style |
|---|---|---|
| `IconName` type | `components/Icon.tsx` | named export |
| `Icon` component + icon paths | `components/Icon.tsx` | named export |
| `AuthPage` function | `components/AuthPage.tsx` | default export |
| `OverviewTab` function | `components/OverviewTab.tsx` | default export |
| `PlaceholderTab` function | `components/PlaceholderTab.tsx` | default export |
| `tabs` constant | **stays in `App.tsx`** | — |
| `modules` constant | **stays in `App.tsx`** | — |

### Import updates in `App.tsx`

```tsx
import { Icon, type IconName } from "./components/Icon";
import AuthPage from "./components/AuthPage";
import OverviewTab from "./components/OverviewTab";
import PlaceholderTab from "./components/PlaceholderTab";
```

### Verification (before Deliverable 2)

```bash
npm run dev
# Open the app. Click through every screen.
# Behaviour must be IDENTICAL to before the refactor.
```

If anything looks or behaves differently, the refactor is wrong. Fix it before continuing.

---

## §3. Deliverable 2 — Copy Revision

### What it does

Remove all "AI-uplifting" language. The current copy has slogans, greetings, and cheerleading. It reads like a startup pitch, not a tool. This step replaces it with copy that names things or prompts action.

### The rules

1. No slogans or taglines.
2. No second-person cheerleading ("you got this").
3. No first-person plural ("Let's make today...").
4. No greeting flourishes ("Sharp, Thando").
5. No exclamation marks anywhere.
6. No emojis.
7. Section labels are short nouns.
8. Buttons are verbs.
9. Empty states are one line, no pep.
10. Error messages are facts.

### Exact string replacements

Every change below is a **direct swap**. The engineer does not improvise.

| File | Current string | New string |
|---|---|---|
| `AuthPage.tsx` | "Study smarter. Stress less." | *(delete entire hero headline block)* |
| `AuthPage.tsx` | "Course-aware summaries and trusted study materials, built for South African student life." | *(delete)* |
| `AuthPage.tsx` | "Your academic operating system" | *(delete)* |
| `AuthPage.tsx` | "Good to see you again." | *(delete)* |
| `AuthPage.tsx` | "Sign in to continue to your study space." | *(delete)* |
| `AuthPage.tsx` | "Create your account." | *(delete)* |
| `AuthPage.tsx` | "Set up your free account. It only takes a minute." | *(delete)* |
| `AuthPage.tsx` | "Secure student access" (divider) | keep |
| `AuthPage.tsx` | "Your study data stays private and protected." | keep |
| `OverviewTab.tsx` | "Course-aware AI" (pill) | "AI summary" |
| `OverviewTab.tsx` | "Turn notes into clear study points." | *(delete)* |
| `OverviewTab.tsx` | "Upload a lecture or reading and get a structured summary." | *(delete)* |
| `OverviewTab.tsx` | "Drop a file or browse" | keep |
| `OverviewTab.tsx` | "PDF, DOCX or TXT · Max 20 MB" | keep |
| `OverviewTab.tsx` | "Next up" (section label) | "Deadlines" |
| `OverviewTab.tsx` | "Your deadlines" (h3) | *(delete)* |
| `OverviewTab.tsx` | "Personalised for you" (section label) | "Modules" |
| `OverviewTab.tsx` | "Your modules" (h2) | *(delete)* |
| `OverviewTab.tsx` | "Pick up where you left off" (section label) | "Recent" |
| `OverviewTab.tsx` | "Recent activity" (h2) | *(delete)* |
| `OverviewTab.tsx` | "Discover better sources" | "Materials" |
| `OverviewTab.tsx` | "Find materials made for your modules." | *(delete)* |
| `OverviewTab.tsx` | "Ranked videos, open journals, and trusted resources in one place." | *(delete)* |
| `PlaceholderTab.tsx` | "This section is coming soon. Your work will appear here." | "Nothing here yet." |
| `PlaceholderTab.tsx` | "Get started" (button) | *(delete the button entirely)* |
| `App.tsx` | "Sharp, Thando." (h1) | *(delete)* |
| `App.tsx` | "Let's make today's study session count." | *(delete)* |
| `App.tsx` | "Wednesday, 11 Sep" | keep |
| `App.tsx` | "Your library is synced for offline use" (toast) | "Synced" |
| `App.tsx` | "You're all caught up" (toast) | *(delete — no notifications is the default; don't announce it)* |

### Handling deleted headings

When a heading is deleted, its containing `<div>` or spacing must be adjusted so the layout doesn't have an empty gap.

**Pattern for sections that lose their h2:**

Before:
```tsx
<div className="mb-3 flex items-center justify-between">
  <div>
    <p className="label">Personalised for you</p>
    <h2 className="h2">Your modules</h2>
  </div>
  <button>Manage</button>
</div>
```

After:
```tsx
<div className="mb-3 flex items-center justify-between">
  <p className="label">Modules</p>
  <button>Manage</button>
</div>
```

### Verification (before Deliverable 3)

Read every screen out loud. If a string sounds like it belongs in a startup pitch or a motivational poster, it's wrong. If it sounds like something a colleague would say while pointing at the screen, it's right.

---

## §4. Deliverable 3 — Palette Replacement

### What it does

Replace the cream/coral palette with a **warm dark palette** — not pitch-black, not pure white text. This is the largest sub-task (~2 hours) because there are dozens of hex values scattered across 4 files.

### The tokens

Add to `index.css` inside the `@theme` block:

```css
@theme {
  /* Surfaces — warm dark, not pitch-black */
  --color-bg: #1C1814;
  --color-surface: #262220;
  --color-raised: #2E2A26;
  --color-sunk: #16130F;

  /* Borders */
  --color-border: #3A342E;
  --color-border-strong: #4A423A;

  /* Text — never pure white */
  --color-fg: #EDE8E0;
  --color-fg-muted: #B8B0A6;
  --color-fg-subtle: #8A8278;
  --color-fg-on-accent: #1C1814;

  /* Accents */
  --color-accent: #FF7A5C;
  --color-accent-hover: #FF5F3D;
  --color-teal: #6BC5B8;
  --color-success: #6BBF85;
  --color-warning: #E8A852;
  --color-danger: #E85C6A;

  /* Module accents */
  --color-module-a: #FF7A5C;
  --color-module-a-pale: #2E1E1A;
  --color-module-b: #6BC5B8;
  --color-module-b-pale: #1A2826;
  --color-module-c: #E8A852;
  --color-module-c-pale: #2A2418;
}
```

Tailwind generates utilities from these: `bg-bg`, `bg-surface`, `text-fg`, `text-fg-muted`, `border-border`, `bg-accent`, etc.

### Component class replacements

Every hardcoded hex becomes a token. The pattern:

| Current | Replace with |
|---|---|
| `bg-[#F7F8F5]` | `bg-bg` |
| `bg-[#173C46]` | `bg-surface` |
| `bg-white` (on cards) | `bg-surface` |
| `text-[#162A3A]` | `text-fg` |
| `text-[#74827F]` | `text-fg-muted` |
| `text-[#8C9795]` | `text-fg-subtle` |
| `border-[#DEE5E1]` | `border-border` |
| `bg-[#EB765B]` | `bg-accent` |
| `text-white` (on accent button) | `text-fg-on-accent` |
| `bg-[#58A99F]` | `bg-teal` |
| `bg-[#F7F8F5]/95` (header) | `bg-surface/95` |
| `bg-white/95` (bottom nav) | `bg-surface/95` |

### Button color

The primary button changes from white text on coral to **dark text on coral**:

```
Background: bg-accent
Text:       text-fg-on-accent      ← the warm near-black #1C1814
Hover:      bg-accent-hover
```

**Why:** white text on coral `#FF7A5C` hits ~3.2:1 contrast — below the WCAG AA 4.5:1 minimum. Dark text on coral hits ~7:1 — AAA. The dark text also reads as more confident.

### Verification (before Deliverable 4)

1. Grep for leftover hexes:
   ```bash
   grep -rn "#F7F8F5\|#F6F8F5\|#173C46\|#EB765B\|#58A99F" frontend/src/
   ```
   Any hit means an instance was missed.
2. Open every screen — no unstyled elements, no cream remnants.
3. Check contrast in DevTools:
   - Primary text on body ≥ 7:1
   - Secondary text on body ≥ 4.5:1
4. Toggle OS light/dark mode — the app should look identical in both (no light variant yet).

---

## §5. Deliverable 4 — Responsive

### What it does

Two small edits: add a 640px tablet breakpoint, and wrap the app in a desktop frame.

### Tablet breakpoint

In every container that currently uses `max-w-[480px]`, change to:

```
max-w-[480px] sm:max-w-[640px]
```

Locations:
- `App.tsx`: header inner container, main content container, bottom nav container.
- `OverviewTab.tsx`: the content wrapper.

### Desktop frame

In `App.tsx`, wrap the authenticated return in a centering frame:

```tsx
return (
  <div className="min-h-screen bg-[#0F0D0B] flex justify-center">
    <div className="w-full max-w-[480px] sm:max-w-[640px] lg:max-w-[480px] 
                    bg-bg min-h-screen relative
                    lg:shadow-[0_0_80px_rgba(0,0,0,0.5)]">
      {/* existing app shell */}
    </div>
  </div>
);
```

Apply the same wrapper to the `AuthPage` render path.

**Effect:**
- Phone (<640px): full width, no frame.
- Tablet (640–1023px): 640px centered.
- Desktop (≥1024px): 480px centered with a subtle dark outer background.

### Verification (before Deliverable 5)

Resize the browser to:
- **375px** — full width, no frame.
- **800px** — content centered, 640px wide, single column.
- **1280px** — content centered, 480px wide, phone frame visible.

No horizontal scroll at any width.

---

## §6. Deliverable 5 — PWA Conversion

### What it does

Make the app installable on a phone and offline-capable for its shell.

### Add the dev dependency

```bash
cd frontend
npm install -D vite-plugin-pwa
```

This is the only dependency added all day.

### Configure `vite.config.ts`

Add `VitePWA(...)` as the **first** entry in the plugins array. Do not remove or reorder the existing Figma plugins.

```typescript
import { VitePWA } from 'vite-plugin-pwa'

// In the plugins array:
plugins: [
  VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['icons/*.png', 'offline.html'],
    manifest: {
      name: 'Varsity Companion',
      short_name: 'Varsity',
      description: 'Course-aware AI study companion for South African university students.',
      theme_color: '#1C1814',
      background_color: '#1C1814',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      scope: '/',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        {
          src: '/icons/icon-maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
      navigateFallback: '/offline.html',
      runtimeCaching: [
        {
          urlPattern: /\/api\/v1\/.*/i,
          handler: 'NetworkOnly',
        },
      ],
    },
  }),
  // ... existing Figma plugins, unchanged ...
],
```

Note: `theme_color` and `background_color` are `#1C1814` to match the new palette.

### Icons

Create in `frontend/public/icons/`:

| File | Size | Content |
|---|---|---|
| `icon-192.png` | 192×192 | Solid `#1C1814` square with "VC" in coral `#FF7A5C`, or the logo mark |
| `icon-512.png` | 512×512 | Same design, larger |
| `icon-maskable-512.png` | 512×512 | Same design, content padded to inner 80% |

### Offline page

Create `frontend/public/offline.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Offline — Varsity Companion</title>
  <style>
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #1C1814;
      color: #EDE8E0;
      display: grid;
      place-items: center;
      min-height: 100vh;
      text-align: center;
      padding: 24px;
    }
    h1 { font-size: 20px; margin: 0 0 8px; font-weight: 600; }
    p  { color: #B8B0A6; font-size: 14px; max-width: 360px; margin: 0; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>You're offline</h1>
    <p>Varsity Companion is showing cached content. Reconnect to sync new summaries and materials.</p>
  </main>
</body>
</html>
```

### Update `index.html`

Add to `<head>`:

```html
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#1C1814">

<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Varsity">
<link rel="apple-touch-icon" href="/icons/icon-192.png">

<meta name="mobile-web-app-capable" content="yes">
```

### Verify locally

```bash
npm run build
npm run preview
```

In Chrome:
- **Application → Manifest:** "Installable" badge appears, icons load.
- **Application → Service Workers:** an activated worker.
- **Network → Offline → reload:** shell loads or offline.html shows.
- **Lighthouse → PWA:** audit passes.

### Deploy

Upload `dist/` to Cloudflare Pages.

Verify on real devices:
- Android Chrome: "Add to Home Screen" appears, app launches full-screen.
- iOS Safari: Share → "Add to Home Screen," app launches full-screen.

---

## §7. Acceptance Criteria

1. `components/Icon.tsx`, `AuthPage.tsx`, `OverviewTab.tsx`, `PlaceholderTab.tsx` exist.
2. `App.tsx` is under 200 lines.
3. All copy revisions from §3 applied — no slogans, cheerleading, or greeting flourishes remain.
4. Grep for old hexes returns nothing: `#F7F8F5`, `#F6F8F5`, `#173C46`, `#EB765B`, `#58A99F`.
5. Every screen uses token-based colors.
6. Primary text on body contrast ≥ 7:1.
7. Layout responsive: full-width phone, 640px tablet, 480px desktop frame.
8. `vite-plugin-pwa` added as dev dependency.
9. `vite.config.ts` configured with `theme_color: '#1C1814'`.
10. Three icons exist at `/icons/`.
11. `offline.html` exists.
12. `index.html` updated with manifest link, `theme-color`, iOS meta tags.
13. `npm run build` succeeds.
14. Lighthouse PWA audit passes.
15. Android install works.
16. iOS install works.
17. Offline shell loads.
18. No runtime dependencies added, no backend changes, no existing Vite plugin removed.

---

## §8. Verification Steps — In Order

Run these in sequence. Do not skip ahead.

```bash
# Pre-flight
cd frontend
git status
git branch --show-current
npm run build && npm run preview
# → confirm the app renders before any changes

# Deliverable 1 — refactor
# extract components
npm run dev
# → click through every screen; behaviour must be identical

# Deliverable 2 — copy
# apply string replacements from §3
# → read every screen out loud; delete anything that sounds like marketing

# Deliverable 3 — palette
# add tokens to index.css @theme
# swap hex for token classes across all components
grep -rn "#F7F8F5\|#F6F8F5\|#173C46\|#EB765B\|#58A99F" frontend/src/
# → must return no results
# → verify contrast in DevTools

# Deliverable 4 — responsive
# add sm:max-w-[640px] and desktop frame
# → resize browser to 375 / 800 / 1280 px

# Deliverable 5 — PWA
npm install -D vite-plugin-pwa
# edit vite.config.ts
# create icons + offline.html
# update index.html
npm run build && npm run preview
# → Chrome DevTools → Application → Manifest + Service Workers
# → Lighthouse → PWA audit
# → Network → Offline → reload

# Deploy
# upload dist/ to Cloudflare Pages
# real device test: Android + iOS
```

---

## §9. Defect-Discovery Prompts

> Run it, don't just read it.

- **After refactor, some screens render blank** → missing import in `App.tsx`. Check the four component imports.
- **Copy replacement left an empty visual gap** → when a heading was deleted, its container padding was not adjusted. Check the parent element.
- **Palette replacement left a cream hex somewhere** → the grep in §8 returns a hit. Find the file and line, replace it with the appropriate token.
- **Contrast still weak in one place** → grep for `text-[#` — any hit means a hardcoded text color survived.
- **"Add to Home Screen" doesn't appear on Android** → check manifest `display: standalone`, icon sizes ≥ 192px, and HTTPS.
- **Service worker registers but doesn't cache** → check `globPatterns`. Fonts are loaded from Google Fonts (not bundled), so `woff2` in the pattern is harmless if unused.
- **Offline page doesn't appear** → `navigateFallback` must be `/offline.html`; the file must be in `dist/` after build.
- **Desktop frame appears on mobile** → the outer wrapper uses `lg:` prefix, not `sm:`. Check the class.
- **Bottom nav covers content on tall phones** → `safe-bottom` class missing, or main content has no bottom padding.
- **Theme color in status bar is wrong** → manifest `theme_color` and meta `theme-color` must both be `#1C1814`.

---

## §10. Sign-Off Checklist

- [ ] Four component files created under `components/`
- [ ] `App.tsx` under 200 lines
- [ ] All copy revisions applied
- [ ] No slogans, cheerleading, or greeting flourishes remain
- [ ] Palette tokens in `index.css` `@theme`
- [ ] Grep for old hexes returns nothing
- [ ] Contrast verified in DevTools
- [ ] Tablet breakpoint at 640px
- [ ] Desktop frame at ≥ 1024px
- [ ] `vite-plugin-pwa` added
- [ ] `vite.config.ts` configured with new theme color
- [ ] Icons created (192, 512, maskable 512)
- [ ] `offline.html` created
- [ ] `index.html` updated
- [ ] `npm run build` succeeds
- [ ] Lighthouse PWA audit passes
- [ ] Android install works
- [ ] iOS install works
- [ ] Offline shell loads
- [ ] No runtime dependencies, no backend changes, no plugin removed
- [ ] Branch: `week4-day1-frontend-rework` off `develop`

---
## §11. Definition of Done

Day 1 is complete when:

1. All 18 acceptance criteria are met.
2. The engineer submits a report with:
   - What changed, per deliverable
   - Defects caught by running, not reading
   - Screenshots at 375px, 800px, 1280px
   - Screenshots installed on Android and iOS
   - Lighthouse PWA audit result
   - Any deviations from the blueprint and why

---
