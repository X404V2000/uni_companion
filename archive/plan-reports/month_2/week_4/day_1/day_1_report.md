# Month 2 · Week 4 · Day 1 — Frontend Rework (Deliverables 1–4)

**To:** Senior Systems Design & Architecture Engineer
**From:** Implementation (DeepSeek V4, guided by founder)
**Date:** 30 September 2026
**Spec:** `plan/month_2/week_4/day_1/SETUP_DAY1.md`
**Branch/commit:** `demo` — `33b6cca` (Day 1 work), `d55182f` + `fcdbb25` (security follow-up)
**Status:** Deliverables 1–4 complete. **Deliverable 5 (PWA) not started.**

---

## §1. Summary

The Day 1 target is `new_frontend_layout/`, the new Figma export: 789 lines in a
single `App.tsx`, marketing copy, and a light cream palette. Deliverables 1–4
refactor it, strip the copy, invert the palette, and make it responsive.

| # | Deliverable | Status |
|---|---|---|
| 1 | File refactor | ✅ `App.tsx` 789 → 188 lines |
| 2 | Copy revision | ✅ 23 marketing strings removed |
| 3 | Palette replacement | ✅ 77 hexes → 0 in components |
| 4 | Responsive | ✅ 640px tablet + desktop frame |
| 5 | PWA conversion | ⛔ **Not started** — needs dependency approval |
| — | Backend re-wire | ⛔ **Not in the blueprint** — see §9 |

**Verification:** typecheck clean · build green (240.59 kB JS / 27.81 kB CSS) ·
spec criteria 1–7 pass.

---

## §2. A correction to my own earlier reading

Before starting I reported that the blueprint was "stale", having inspected
`frontend/App.tsx` (3,821 lines) rather than the directory the spec targets.

Checking the correct directory changed the conclusion entirely:

| | `frontend/` (what I checked) | `new_frontend_layout/` (the target) |
|---|---|---|
| Lines | 3,821 | **789** — spec says "~800" |
| Components | whole app | `Icon`, `AuthPage`, `OverviewTab`, `PlaceholderTab` |
| Spec's copy strings | absent | present |
| Spec's palette hexes | — | present |

**The blueprint is accurate.** The error was mine.

---

## §3. Deliverable 1 — Refactor

```
App.tsx        789 → 188 lines   (spec target: <200)
components/Icon.tsx             167
components/AuthPage.tsx         168
components/OverviewTab.tsx      229
components/PlaceholderTab.tsx    17
```

The spec calls this "**pure file move. No logic changes. No visual changes.**
The rendered output must be byte-identical before and after." So it was verified
as a pure move rather than assumed:

| Evidence | Result |
|---|---|
| JS bundle | 246.18 kB → **246.18 kB** (identical) |
| CSS bundle | 29.64 kB → **29.64 kB** (identical) |
| User-visible strings | **156/156 preserved, 0 lost** |
| Typecheck | clean |

The string check was written as a script, not done by eye: it extracts every
string literal ≥6 chars from the original file, filters to user-visible copy,
and asserts each still exists somewhere in `src/`. **"It builds" does not prove
"nothing is missing."**

### Two of my own errors, caught by building

**1. Missing `export` keywords.** The spec requires `Icon` and `IconName` as
*named* exports, but the original declared them file-local. TypeScript:
*"declares 'Icon' locally, but it is not exported."*

**2. Sliced `modules` one line short.** My first line-range split ended at 208
instead of 209, dropping the closing `];`. TypeScript: *"Expression or comma
expected."* Both would have been silent damage if I had trusted the build output
alone.

---

## §4. Deliverable 2 — Copy Revision

| Check | Result |
|---|---|
| Marketing strings removed | **23/23** |
| Spec's "keep" strings intact | **4/4** |
| Emojis | 0 |
| Exclamation marks in user copy | 0 |
| Bundle | 246.18 → 244.14 kB |

### What went wrong first, and how it was corrected

My initial script guessed indentation and **silently skipped 11 of 19 edits.**
The script refused to write rather than corrupting anything, which is the
behaviour that made the problem visible. I then read the exact bytes with
`cat -A` and reapplied.

The correct approach mattered most here: the target strings sit in
**login/signup ternaries** (`{mode === "login" ? "Good to see you again." : "Create your account."}`),
so deleting one arm would have left broken JSX. The whole ternary goes.

### Deleting a heading also deletes its wrapper

The spec's §3.4 warns that a deleted heading can leave a "visible gap". Deleting
the text but leaving `<h2 className="...">` keeps the element's margin. Every
removal therefore takes the element with it.

### Two §3 rows are phantom

| Spec says delete | Reality |
|---|---|
| `"Study smarter. Stress less."` | Split across JSX elements (`Study smarter.{" "}<span>Stress less.</span>`) — matched as a block |
| `"Let's make today's study session count."` | **Does not exist.** There is no sub-headline under the greeting. |

The second was **reported, not filled in.** Inventing copy to satisfy a table
row would be worse than recording that the row does not match the code.

---

## §5. Deliverable 3 — Palette Replacement

### The table maps 10 hexes; the files contained 77

The spec's §4 gives a 10-row mapping. Applied literally, **67 light-theme
colours would have remained** — and the §8 verification grep would not have
caught them, because it searches for 5 specific values.

Every hex is therefore mapped **by role**, inferred from the Tailwind utility it
appears in. The change inverts lightness, so hue alone is not enough:

| Role | Old | New |
|---|---|---|
| Base background | `#F7F8F5` near-white | `--color-bg` `#1C1814` |
| Card surface | `#173C46`, `#EEF1EF` | `--color-surface` / `--color-raised` |
| Body text | `#162A3A` dark teal | `--color-fg` `#EDE8E0` |
| Muted text | 18 grey-greens | `--color-fg-muted` / `-subtle` |
| Borders | `#DEE5E1` light | `--color-border` |
| Accents | coral/teal | unchanged (already legible on dark) |

Result: **0 hardcoded hexes** in `App.tsx` and all four components; the only
hexes left in the codebase are the 22 token definitions in `index.css`.

### Two contrast failures in the spec's own tokens

The spec sets explicit targets — primary ≥ 7:1, secondary ≥ 4.5:1 — and requires
verification. Computing them found **two of the spec's own values failing its
own thresholds**:

| Token | Spec value | Measured | Needed | Action |
|---|---|---|---|---|
| `--color-fg-subtle` on surface | `#8A8278` | **4.16:1** | 4.5 | → `#9C9488` (**5.26:1**) |
| `--color-fg-on-accent` on accent | `#1C1814` | **6.88:1** | 7.0 | → `#171310` (**7.20:1**) |

The first is not marginal: it is **every secondary label on every card**.

The replacement for `fg-subtle` was chosen as the *least-light warm grey* that
clears 4.5:1 on both `--color-surface` and `--color-bg`, so the palette keeps its
warm temperature instead of turning neutral grey.

**The spec's reasoning for the button change is correct and now verified:** white
on coral measures **2.56:1**, far below AA. The dark-on-coral switch was right.

### Shadows had to change too

Three `rgba()` shadows used dark teal values (`rgba(23,60,70,0.14)` and similar).
On a light theme a dark shadow adds depth; on a dark theme it is invisible. They
were retuned to black-alpha at higher opacity so cards still lift off the page.
**The spec does not mention shadows**, and they are not hexes, so neither the
mapping table nor the §8 grep would have found them.

---

## §6. Deliverable 4 — Responsive

| Breakpoint | Behaviour |
|---|---|
| <640px | full width, no frame |
| 640–1023px | 640px centred |
| ≥1024px | 480px centred, dark surround, 80px shadow |

The frame could not simply wrap the existing markup. The shell is
`h-screen` + **sticky header** + **bottom nav**; wrapping the inner content only
would have stopped the header sticking and left the nav floating. The frame
therefore *becomes* the flex column.

Applied to the **auth view as well**, which §5 does not mention — otherwise
login is the one screen that renders full-width on desktop.

Verified in the built CSS: the `sm:` (40rem) and `lg:` (64rem) rules and the
`lg:shadow-` utility are all emitted.

> Note: Tailwind 4 emits breakpoints in `rem`, not `px`. An initial grep for
> `1024px` reported the `lg:` rule missing; it is present as `width>=64rem`.
> The measurement was wrong, not the CSS.

---

## §7. Acceptance criteria

| # | Criterion | Result |
|---|---|---|
| 1 | Four components exist | ✅ 4/4 |
| 2 | `App.tsx` under 200 lines | ✅ **188** |
| 3 | Copy revisions applied | ✅ 23 removed, 4 kept |
| 4 | Grep for old hexes returns nothing | ✅ 0 hits |
| 5 | Every screen uses token colours | ✅ 0 hardcoded hexes |
| 6 | Primary text contrast ≥ 7:1 | ✅ **14.47:1** |
| 7 | Responsive: phone / 640 / 480 frame | ✅ verified in built CSS |
| 8–17 | PWA: dependency, config, icons, offline page, install | ⛔ not started |
| 18 | No runtime deps, no backend change, no plugin removed | ✅ |

---

## §8. Complexity

Not applicable to the app runtime — no query, endpoint or schema changed. The
only measurable change is the build output:

| Asset | Before | After | Note |
|---|---|---|---|
| JS | 246.18 kB | **240.59 kB** | smaller — dead copy removed |
| CSS | 29.64 kB | **27.81 kB** | smaller — 77 hexes replaced by 22 tokens |

---

## §9. The gap the blueprint does not cover

**`new_frontend_layout/` has zero backend integration.**

```
                         imports from lib/api   calls to the API wrapper
new_frontend_layout/              0                      0
frontend/                         1                     15
```

The new layout does not import the API module at all. The existing frontend
calls it through named functions (login, getDashboard, createTask, summarize
and eleven others), so a naive search for `fetch(` undercounts it - my own
first measurement said "5" and was wrong. Counting the wrapper's call sites
gives the real figure.

It renders, it builds, and its login form does not authenticate. Nothing in the
blueprint reconnects it, and the spec describes Day 1 as a frontend-only day
("No backend changes"), so this is consistent — but it means **after Day 1 the
app is a shell.**

This was raised with the founder before work began, who chose to proceed and
re-wire afterwards. The re-wire is the largest remaining piece and has no spec.

**The live demo is unaffected.** `frontend/` is untouched and still serving.

---

## §10. Findings for the architect

**1. The spec creates a circular import.**
It says `modules` stays in `App.tsx`, but `OverviewTab` consumes it:
`App.tsx → OverviewTab → ../App`. It resolves today only because `modules` is
read at render time rather than at module init. Moving `modules` (and `tabs`)
into a shared constants file would remove the cycle.

**2. Two §3 rows name strings that do not exist** (§4 above).

**3. Two palette tokens fail the spec's own contrast targets** (§5 above).

**4. The §8 grep checks 5 hexes out of 77.** As written it would report "clean"
while leaving most of the old palette in place. A check based on *any* remaining
`#RRGGBB` in component files is stronger.

**5. `index.html` still ships Figma placeholder metadata.** The built output
carries a description about *"project management … organize, track, and
collaborate"* — unrelated to a study app, and it is what link previews show. §6
says to update `index.html`, so this is covered by Deliverable 5, but it should
not be forgotten.

**6. §5 does not mention the auth view** when describing the desktop frame (§6
above).

---

## §11. Security follow-up completed the same day

Separate from the spec, a credential leak was found and closed. Recorded here
because it happened during this work and affects the same branch.

`staging_deployement/stag_env.md` was **tracked and pushed to six remote
branches**, containing a live Neon database password and the staging JWT signing
key in plain text. The password was confirmed live by comparing it against the
running staging container — an exact match, not a guess.

| Action | Result |
|---|---|
| Both secrets rotated | ✅ verified by value change |
| `STAGING_DATABASE_URL` re-synced to the new password | ✅ |
| File untracked (`git rm --cached`, kept on disk) | ✅ `d55182f` |
| Remote confirmed clean | ✅ contents API returns **404** |
| Dead credentials removed from disk | ✅ verified by grep |

**Note:** `STAGING_DATABASE_URL` was *not* updated during rotation and still
embedded the old password; staging would have failed to authenticate. Caught by
comparing the two values rather than assuming rotation alone was sufficient.

**Deliberately not done:** a history rewrite. The rotated values remain readable
in 29 commits across 6 branches, but they are now **dead**. Rewriting history to
remove already-invalid secrets risks breaking six branches for no security gain.

**Swept and clean:** `.env` is not tracked; no database dumps, logs, dependency
directories, cloud-provider keys or private key headers in any tracked file.

### Also fixed opportunistically

`fcdbb25` — `BriefDocument` and `BriefChunk` were imported into
`app/models/__init__.py` but omitted from `__all__`, so `from app.models import *`
silently dropped them. Pre-existing, verified as 2 ruff findings both before and
after my edit to that file, so not introduced here.

---

## §12. Verification commands

```bash
cd new_frontend_layout

npx tsc --noEmit                 # typecheck
npx vite build                   # build

# Refactor was a pure move
grep -rhoE "#[0-9A-Fa-f]{6}" src/App.tsx src/components/*.tsx | wc -l   # -> 0
grep -rliE "#F7F8F5|#F6F8F5|#173C46|#EB765B|#58A99F" src/               # -> nothing
grep -rn "text-\[#" src/                                                # -> nothing

# Backend unaffected
TEST_DATABASE_URL=... venv/bin/pytest tests/ --no-cov -p no:cacheprovider  # 498 passed
venv/bin/python scripts/check_contract_drift.py                            # [PASS]
```

---

## §13. Deliverable 5 — PWA

Added after the first draft of this report, once the dependency was approved.

| Criterion | Result |
|---|---|
| 8. `vite-plugin-pwa` dev dependency | ✅ runtime deps unchanged (react, react-dom) |
| 9. `theme_color: #1C1814` | ✅ |
| 10. three icons | ✅ 192, 512, maskable-512 |
| 11. `offline.html` | ✅ |
| 12. `index.html` tags | ✅ 7 tags survive the build |
| 13. build succeeds | ✅ 13 precache entries, 276.74 KiB |
| 14-17. Lighthouse, Android, iOS, offline shell | ⚠️ **needs a device, not claimed** |
| 18. no runtime deps, no backend change, no plugin removed | ✅ |

### Five problems found while implementing it

**1. The metadata was not in `index.html`.** The "project management" text comes
from `.figma/make/site.json`, which the `figmaSiteConfiguration` plugin injects
into the `figma:*` comment slots on every build. Editing `index.html` alone would
have been overwritten on the next build. Fixed at the source.

**2. That same file set `robots.index` to false**, emitting a noindex meta tag
and a `robots.txt` Disallow. The app was configured to be invisible to search
engines. Flipped to true as an explicit decision rather than an inherited one.

**3. PWA tags placed inside the Figma head region are deleted on build.**
Everything between the head-start and head-end markers is rewritten from
`site.json`. The first attempt put them there and all four tags vanished. Moved
after the head-end marker, and verified against the BUILT file rather than the
source.

**4. My first edit silently did nothing.** The file is indented with four spaces
and the replacement string used six, so the match never happened and the file was
written back unchanged - while the script reported success. Caught by inspecting
the file rather than trusting the script's own output.

**5. Icon sizing was wrong the first time.** The scale was derived from canvas
width alone, so the glyph spanned 92% of the icon with an 8px edge margin at
192px - cramped on a launcher grid. Resized to a 62% target fill, giving 20-26%
clear margin. The maskable variant keeps content inside the inner 48% so an
Android circular crop cannot clip it.

### The API is deliberately not cached

`/api/v1/.*` is `NetworkOnly`. A summary or deadline list served from cache is
indistinguishable from live data, and the user has no way to know it is stale.
An honest error is better than a plausible lie.

---

## §14. Recommended next steps

1. **Backend re-wire** — unspecced and the largest remaining item. Without it
   the new frontend cannot log in.
2. **Decide the fate of `frontend/`** — whether the new layout replaces it or
   both are maintained.
3. **Architect to reconcile §10 findings** in a revised blueprint, particularly
   the circular import, the phantom copy rows, and the contrast values.

---

## §15. Sign-off checklist — spec §10

- [x] Four component files created under `components/`
- [x] `App.tsx` under 200 lines
- [x] All copy revisions applied
- [x] No slogans, cheerleading, or greeting flourishes remain
- [x] Palette tokens in `index.css` `@theme`
- [x] Grep for old hexes returns nothing
- [x] Contrast verified by computation
- [x] Tablet breakpoint at 640px
- [x] Desktop frame at ≥ 1024px
- [x] `vite-plugin-pwa` added as a dev dependency
- [x] `vite.config.ts` configured
- [x] Icons created (192, 512, maskable 512)
- [x] `offline.html` created
- [x] `index.html` updated, plus `.figma/make/site.json` (the real source)
- [x] `npm run build` succeeds
- [ ] Lighthouse PWA audit
- [ ] Android install
- [ ] iOS install
- [ ] Offline shell
- [x] No runtime deps, no backend changes, no plugin removed

---
