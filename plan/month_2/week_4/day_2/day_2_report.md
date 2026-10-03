# Day 2 — Mobile V1 Faithful-Pass Audit & Hardening

**Date:** 3 October 2026
**Branch:** `mobile/day-2-hardening`
**Baseline:** `fc6096e` → **`c0b590c`**
**Blueprint:** `conversation/system_design_and_architectural_engineer_3.md` §8

---

## §1. Summary

Three mechanical fixes delivered, one of which corrected a defect the architectural
engineer found in my own day-1 work. The faithful pass then surfaced **a real,
unfixed gap that matters more than either**: the app shows cached data as live when
the network is gone.

| Task | State |
|---|---|
| Correct the false root-cause comment | ✅ done, committed alone |
| `queries.ts` seam guard | ✅ done, **shown failing before passing** |
| Render instance-hour constraint documented | ✅ done |
| Faithful pass — 5 screens, 3 states | ⚠️ **done via web build, not a device** |
| **Silent stale data on network loss** | 🔴 **found, not fixed — needs a decision** |

```
tsc        clean
tests      47 passing  (was 44)
gate       ALL TABS RENDER CORRECTLY
```

---

## §2. The three mechanical fixes

### 2.1 The comment described a cause that is known to be false

`app/_layout.tsx:11–27` said the tab freeze was caused by *"a `Tabs` navigator
mounted inside a conditional `Stack.Protected` group"*. **It was not.** The cause
was the missing `enableScreens()` call.

This is the defect I had written a paragraph about the previous day:

> *"a confident comment over a broken screen… it tells the next engineer not to look"*

Mine was worse in one way: a confident comment beside a **fixed** screen describing
a **wrong** cause. The next engineer would have re-learned the wrong lesson and could
have reintroduced the regression *as a fix*.

The engineer's phrasing is exact and I have adopted it:

> A hypothesis that changes the action toward "do nothing" or "change the
> measurement" should be held to a higher evidential bar than one that proposes a
> fix, because it is the one that can ship a bug.

Committed alone so the diff is unmistakable.

### 2.2 The seam was already broken — and the guard now holds it

The engineer asked for a guard and wrote the seam *"is still true today only by
discipline"*.

**It was not true today.** `app/(tabs)/settings.tsx` already imported `getMe` from
`api.ts` and called it through an inline `useQuery`. The exact erosion the guard
exists to prevent was already present, with nothing noticing.

Fixed properly rather than by relocating the import: added `useProfile()` to
`queries.ts`, typed `UseQueryResult<AccountProfile>`, and switched the screen to it.

`seam.test.ts` enumerates every screen file and asserts none imports `api.ts`.
**Shown to fail before being shown to pass**, per the standing rule:

```
with a deliberate api.ts import in planner.tsx  →  1 failed, 2 passed
    and it named "app/(tabs)/planner.tsx"
with the violation reverted                     →  3 passed
```

It also asserts it found the files it intends to check, so a future refactor that
moves the screens fails loudly instead of passing vacuously.

**Its honest limitation, stated so it is not mistaken for more:** it catches direct
imports only. A screen reaching `api.ts` through a re-export would not be caught.

### 2.3 The Render instance-hour budget is now a documented constraint

The keep-warm ping holds the backend awake ~24/7: **~720 of Render's 750 free
instance-hours**, leaving ~30 hours. Consequences recorded in
`docs/PROJECT_HISTORY.md`:

- **A second Render service exceeds the free tier.** Staging cannot share it with
  production.
- Future worker/queue/cron services must clear this budget **before** design.
- **The ping is an optimisation; `WakingUp.tsx` is the guarantee.** Stated
  explicitly so nobody deletes the component on the assumption the ping replaces it.

---

## §3. The faithful pass

### 3.1 What was covered

Run against the live Render backend and Neon database, at `390×844`.

| Screen | Rendered state — **real data confirmed** |
|---|---|
| Home | 5 modules, 11 open tasks, real deadline labels |
| Planner | 11 open deadlines, real overdue item ("Overdue lab report") |
| AI Summaries | module picker populated with real codes (BIO110, CHE101…) |
| Find Materials | "Curated resources for your modules", real module codes |
| Settings | "Demo Student", `demo@varsitycompanion.co.za`, University of Pretoria |

**Console errors across the whole pass: none.**

### 3.2 ⚠️ What this pass does NOT prove

I must be explicit, because it is the same class of overclaim I made twice this week:

- **It ran against the web build, not a device.** `react-native-web` and the native
  renderer differ — that is the whole reason `enableScreens()` mattered.
- **Native-only behaviour is untested:** keyboard handling in the Planner modal,
  rotation, swipe-back gestures, and native crash behaviour.
- The blueprint's §7 prompts (background/foreground after sign-out, keyboard over the
  modal) **have not been run** and cannot be run from here.

**The blueprint lists "all five screens observed on a device" as an acceptance
criterion. That criterion is NOT met.** It needs the founder's phone, and I am not
marking it done.

---

## §4. 🔴 Finding: cached data is presented as live

**This is the significant result of the day, and it is not fixed.**

```
ONLINE   Planner says: 11 open deadlines
OFFLINE  Planner says: 11 open deadlines     ← identical, no indication
Offline indicator on screen: NONE
```

With the network disconnected mid-session, the Planner continued to show
**11 open deadlines** with **nothing** telling the student the data was cached. The
same behaviour appeared on Find Materials and Settings.

### Why this matters against the stated product promise

The founder's constraint is *"I don't want students facing issues accessing the app
during exams or assignment due dates."*

**This is precisely that failure.** A student on a bus with no signal opens the app
to check whether a deadline is still outstanding, and receives a confident answer
that may be hours or days stale. They cannot tell.

**The worse case is writes.** If a student adds a deadline while offline, it appears
to save. It does not. They believe they have recorded something they have not — and
they will discover otherwise at the worst possible moment.

### Why the existing handling does not cover it

`WakingUp.tsx` (built yesterday) handles a **cold server on a fresh load** — no
cached data, request fails, retries begin. That is the correct state.

It does **not** cover **network loss with data already cached**. React Query serves
the cache, `isError` is false because the query has data, and the screen renders
normally. **There is no signal to the user at all.**

### Options

| Option | Effect | Cost |
|---|---|---|
| **A. Stale indicator** | Show "Last updated 14:32 · offline" when a refetch fails with cached data present. Student knows what they are looking at. | Small — read `isStale`/`isError` alongside `data`, one shared component |
| **B. Block writes offline** | Disable "Add deadline" when unreachable, with an explanation. Prevents the false-save. | Small |
| **C. Both** | A and B together. Honest reads, honest writes. | Small |
| **D. Full offline queue** | Writes queue locally and sync in the background. | **Large — this is Mobile V2**, `design_note_offline_sync.md` |

**My recommendation: C.** It is small, it directly serves the exam-period promise,
and it does not pre-empt the V2 design. D is the right destination but is a week of
work, not a day.

**I have not implemented any of these.** It changes user-visible behaviour on every
screen and the architectural engineer should specify it — and the founder may have a
view, since it is a product decision about what the app says when it does not know
something.

---

## §5. Acceptance criteria — honest status

| # | Criterion | Status |
|---|---|---|
| 1 | `tsc` clean; `npm test` green incl. the guard | ✅ 47 passing |
| 2 | `npm run test:screens` green | ✅ ALL TABS RENDER CORRECTLY |
| 3 | Guard **fails** on a violation (shown) | ✅ shown, and it named the file |
| 4 | `_layout.tsx` references no false cause | ✅ corrected |
| 5 | Five screens observed **on a device** | ❌ **web build only — not met** |
| 6 | `PROJECT_HISTORY.md` states the Render budget | ✅ done |

**Criterion 5 is not met and I am not claiming it.** It needs the founder's phone.

---

## §6. Device runbook for the founder — the one thing I cannot do

The blueprint's criterion 5 requires this. **`EXPO_PUBLIC_API_BASE` must be set**, or
Expo Go targets `127.0.0.1:8000` — on a phone, that is the phone, and every request
fails for a reason unrelated to the app.

```bash
cd ~/Desktop/projects/varsity_companion/mobile
git status                                    # expect: clean
EXPO_PUBLIC_API_BASE=https://uni-companion.onrender.com npx expo start
```

Scan the QR with Expo Go on the same Wi-Fi. Then check, and report only what you
observe:

1. **All five tabs** — does the screen content change, not just the tab highlight?
2. **Planner** — add a deadline. Does the count go up?
3. **Summaries** — paste a short note. Does the consent sheet appear on first use,
   and does declining still let the summary run?
4. **Airplane mode on, then open Planner** — what does it show? *(The §4 finding
   predicts: the last-known list, with no indication it is stale. Confirm or refute.)*
5. **Airplane mode off, sign out, reopen** — does it return to sign-in without a
   flash of Home?
6. **Rotate to landscape, then open the Planner add-form** — is the modal usable?

---

## §7. What I got wrong, again

The engineer's §2 catch is the second time in two days that I left a confident,
false statement in the tree. The first was the comment in `_layout.tsx` claiming the
guard fix worked when it did not; this is the same comment, still claiming a cause
that was wrong.

**The pattern:** I write the explanation at the moment I believe I have understood,
and I never return to it once the real cause appears. The comment then becomes an
obstacle precisely because it sounds authoritative.

**The rule I am adopting:** when a root cause is superseded, **the comment
describing the old cause is part of the fix and must be corrected in the same
commit.** Not later, not in a docs pass.

I also note that I predicted the seam was holding, in my own §7 yesterday, on the
strength of a mental model rather than a grep. The engineer asked for a guard on the
assumption it was still true; **one `grep` would have shown us both otherwise.**
"Check, don't recall" applies to my own claims about my own code.

---

## §8. Sign-off

- [x] Comment corrected, false cause removed
- [x] Seam guard added **and shown to fail**
- [x] Render constraint documented
- [ ] Five screens observed on device — **blocked, needs the founder's phone**
- [x] `tsc` clean, `npm test` green, `test:screens` green
- [x] Report written, including the defect that was found and not fixed

---

## §9. Next

Per the blueprint's §10, in recommended order:

1. **Decide §4** (stale-data handling) — it is the largest remaining risk to the
   stated product promise.
2. **Token refresh** — the engineer calls it a **hard gate before FNB**, and advises
   building it with a day of margin. It touches auth, and auth regressions lock
   people out.
3. **The device pass** — criterion 5, needs the founder.
4. **Offline sync groundwork** (`db.ts`) — Mobile V2.
