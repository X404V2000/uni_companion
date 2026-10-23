# Where things stand — end of Friday 23 October 2026

Pick this up tomorrow. Everything below is committed, pushed and deployed unless
it says otherwise.

---

## Done and live

| Item | State |
|---|---|
| **F1 Bursaries** — backend + screen | live; 12 real bursaries in production |
| **F2 Study plan** — endpoint + Home card | live; verified with real data |
| **APK** | built: 89.2 MB, `za.co.varsitycompanion` |
| Header cleanup | build stamp and the fake "Synced" pill removed |
| CI | green on the last three commits |

**APK download:**
`https://expo.dev/artifacts/eas/SsFARXt7i2IYGMioZzqiLE89eO4Crvd6S4sXJwi96y8.apk`

---

## ⚠️ Tell the presenter this

**The APK does not have Bursaries or the Study Plan.** It was built from the
mobile app, which is a separate frontend. For the video:

- **Web link** → show Bursaries and the study plan
- **APK** → modules, deadlines, materials, settings, first-run guide

Do not open the APK expecting bursaries.

---

## Left to do

### 1. `TASK-0014` — bursary deadlines in the Planner (optional, ~3 h)
Closing dates appear in the Planner beside academic deadlines, badged `BURSARY`.
The API already returns everything needed (`/bursaries/matches` gives
`closes_on`, `days_left`, `name`), so this is UI work only.

**Cut it if time is short.** Both headline features stand without it.

### 2. Sunday regression (do not skip)
Re-run the full walkthrough, because features added after a fix can undo it:

1. Signup → first-run guide → add module → module card opens Materials
2. Materials fetch returns results
3. Add a deadline → appears on Home **and** in the study plan card
4. Bursaries tab → 12 cards, apply links open
5. Planner renders, Settings opens, delete-account confirms
6. Fonts still render with Google Fonts blocked

### 3. Install the APK on a real phone
The one thing that cannot be checked from the terminal. Confirm: it opens (not a
crash), a signup reaches the backend, and one screen renders. Cold start on the
free tier is 5–15 s — wait before concluding it is broken.

---

## Known gaps, stated honestly

| Gap | Impact |
|---|---|
| POPIA purge has no scheduler (`TASK-0010`) | deleted accounts are never physically erased until someone calls the admin endpoint |
| Mobile lacks Bursaries + Study plan | the APK is behind the web app |
| No push notifications | not built |
| Studio seed is small (12 bursaries) | coverage is limited but every entry is verified |

---

## If you want to rebuild the APK

```bash
cd mobile
npx eas-cli build --platform android --profile apk
```

Use `--profile apk`. The `production` profile emits an AAB, which cannot be
installed on a phone directly.

---

## The story for the judges, one sentence

> **Varsity Companion puts every deadline in a student's life — assignments and
> funding applications — in one place, and tells them what to do first, even when
> the internet is bad.**

Eleven of the twelve bursaries close within eight days. That is the product
working on the day it is presented, not a mock-up.
