**To:** Senior Engineer
**From:** Senior Systems Design & Architecture Engineer
**Date:** 25 September 2026
**Status:** Specification Active
**Time budget:** 6–8 hours
**Branch:** No branch. This is a hackathon sprint, not a tracked day.

---

## §0. Scope

Get the Figma-generated React app talking to the Varsity Companion backend, end-to-end. The demo loop must be:

1. **Login screen** — user enters email + password, frontend authenticates against the backend.
2. **Dashboard** — real data from `/api/v1/academic/dashboard` replaces the hardcoded modules, deadlines, and activity.
3. **AI summary** — the "Paste text" panel calls `/api/v1/ai/summarize` and shows the real result.

Three screens. Real data. Working auth. That is the entire scope.

**Explicitly out of scope (do not do tonight):**
- Signup flow wiring (use the fixture user for login)
- File upload for summaries (paste text only)
- Materials search wiring
- Offline sync UI
- Notification bell
- Settings
- Any new component, any redesign, any color change

---

## §1. Technical Objectives

1. **Locate the Figma project** on disk and confirm it runs locally.
2. **Fix backend CORS** to accept the Figma dev server origin.
3. **Wire `AuthPage`** to `POST /api/v1/auth/login` with `x-auth-mode: api`.
4. **Add a `VC.api()` helper** for authenticated requests (bearer token from `localStorage`).
5. **Wire the dashboard** to `GET /api/v1/academic/dashboard` — replace hardcoded modules, deadlines, quota, greeting.
6. **Wire the summary panel** to `POST /api/v1/ai/summarize` — replace the `notify()` stub.
7. **End-to-end smoke test** of the three screens.

---

## §2. Architectural Strategy

```
┌───────────────────────────────────────────────────────────────────────┐
│  WHAT CHANGES TONIGHT                                                 │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Backend (.env)                                                       │
│    + cors_origins gets http://localhost:8443                          │
│    → allows the Figma dev server to reach the API                     │
│                                                                       │
│  Frontend (Figma project)                                             │
│    App.tsx                                                            │
│      + VC.api() helper (fetch wrapper, bearer token, 401 handling)   │
│      + AuthPage.submit → real POST, store token, on 200 call success  │
│      + Dashboard → useEffect fetches /dashboard, replaces hardcoded   │
│      + SummaryPanel → real POST to /ai/summarize                      │
│                                                                       │
│  No new files, no new packages, no new components.                    │
│  Only edits to App.tsx and (maybe) a small api.ts helper.             │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│  THE AUTH FLOW                                                        │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  User types email + password                                          │
│      │                                                                │
│      ▼                                                                │
│  POST /api/v1/auth/login                                              │
│    Header: x-auth-mode: api                                           │
│    Body:   {"email": "...", "password": "..."}                        │
│      │                                                                │
│      ▼                                                                │
│  Response 200: {"access_token": "..."}                                │
│      │                                                                │
│      ▼                                                                │
│  localStorage.setItem("vc.token", access_token)                       │
│      │                                                                │
│      ▼                                                                │
│  onSuccess() → dashboard renders                                      │
│      │                                                                │
│      ▼                                                                │
│  Dashboard useEffect → GET /academic/dashboard                        │
│    Header: Authorization: Bearer <token>                              │
│      │                                                                │
│      ▼                                                                │
│  Real data replaces hardcoded cards                                   │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

**Design principle:** *Minimal changes to a working app.* Every edit to `App.tsx` is surgical. No refactoring. No renaming. No component extraction. Add the fetch layer, replace the hardcoded data sources, done.

---

## §3. File Implementation Map

| File Path | Action | Purpose |
|---|---|---|
| `~/Desktop/projects/university_helper/.env` | **UPDATED** | Add Figma dev origin to `cors_origins` |
| `<figma-project>/src/lib/api.ts` | **NEW** | `VC.api()` fetch wrapper (or inline in `App.tsx`) |
| `<figma-project>/src/App.tsx` | **UPDATED** | Auth wiring, dashboard fetch, summary fetch |
| `<figma-project>/src/types.ts` | **NEW (optional)** | TypeScript types for API responses |

**No new packages. No build config changes. No new components.**

The `<figma-project>` path is unknown until you run the `find` command from my previous message. That's Step 1 of the walkthrough below.

---

## §4. Step-by-Step Developer Guide

*(Full line-by-line instructions are in the walkthrough I'll produce once Step 1 identifies the project path. Below is the shape.)*

### Step 1 — Locate the Figma project
```bash
find ~/Desktop/projects -name "package.json" -not -path "*/node_modules/*" 2>/dev/null
```
Expected: one or two paths. The one containing `src/App.tsx` is the target.

### Step 2 — Install Node.js and pnpm (if missing)
```bash
which node && node --version
which pnpm && pnpm --version
```
If either is missing, install per your distro. DeepSeek can generate the commands, but the target is: Node 20+ and pnpm 8+.

### Step 3 — Install the Figma project's dependencies
```bash
cd <figma-project>
pnpm install
```
Wait for it to finish. Expect a `node_modules/` folder to appear.

### Step 4 — Start the dev server
```bash
pnpm dev
```
Expected output: a URL like `http://localhost:8443`. Open it in a browser. You should see the Figma login screen.

### Step 5 — Fix CORS on the backend
Edit `~/Desktop/projects/university_helper/.env`. Find `cors_origins` and append `http://localhost:8443`.

Restart the backend: Ctrl+C in Terminal 1, then re-run `uvicorn app.main:app --reload`.

### Step 6 — Add the `VC.api()` helper
New file: `<figma-project>/src/lib/api.ts`. Contains:
- Base URL constant (`http://127.0.0.1:8000`).
- `getToken`, `setToken`, `clearToken`.
- `api(path, opts)` — attaches `Authorization: Bearer`, handles 401 by clearing token, returns parsed JSON.

### Step 7 — Wire `AuthPage.submit`
In `App.tsx`, replace the `submit` function inside `AuthPage`:
- POST to `/api/v1/auth/login` with `x-auth-mode: api`.
- On 200: `setToken(response.access_token)`, then `onSuccess()`.
- On 401: show an inline error message.
- On other errors: show "Could not sign in. Try again."

### Step 8 — Wire the dashboard
In the main `App` component:
- Add `useEffect` that runs once on mount.
- Fetches `GET /api/v1/academic/dashboard`.
- Stores result in state.
- Replaces hardcoded modules, deadlines, quota, and greeting with real values.

### Step 9 — Wire the summary panel
In the summary panel's submit handler:
- POST to `/api/v1/ai/summarize` with `{module_code, content}`.
- Show the returned summary.
- Handle 429 by showing "Daily summary limit reached."

### Step 10 — Smoke test the three screens
- Login with fixture user.
- Verify dashboard shows real data.
- Paste text, click Summarize, verify real summary appears.

---

## §5. Time/Space Complexity Audit

Not applicable for tonight. This is wiring existing components to existing endpoints. No new algorithms, no new queries.

---

## §6. Security & Scale Guarantees

| Guarantee | Mechanism |
|---|---|
| Token stored in localStorage | Acceptable for hackathon; documented as demo-only |
| Bearer token used on every authenticated call | `VC.api()` attaches automatically |
| 401 handling | `VC.api()` clears token and forces re-login |
| CORS locked to specific origins | No wildcard |
| No secrets in frontend code | API base URL is public; no keys in the app |
| Fixture user only for demo | No real user data touched |

---

## §7. Acceptance Criteria

1. Figma dev server runs on `http://localhost:8443` without errors.
2. Login screen appears when the app loads.
3. Logging in with the fixture user's credentials works — no console errors.
4. After login, the dashboard shows **real** data: module codes from the fixture, the fixture's tasks in the deadlines section, and the fixture's AI quota in the sidebar.
5. The "Paste text" panel accepts text and, on submit, displays a real AI-generated summary.
6. Logging out clears the token and returns to the login screen.
7. Refreshing the dashboard while logged in keeps the user logged in (token persists).
8. The whole loop can be completed in under 2 minutes — that's the demo.
9. No hardcoded module data remains in the dashboard.
10. No new packages installed beyond what the Figma project already declares.

---

## §8. Verification Steps

```bash
# Terminal 1: Backend
cd ~/Desktop/projects/university_helper
source venv/bin/activate
uvicorn app.main:app --reload

# Terminal 2: Frontend
cd <figma-project>
pnpm dev

# Terminal 3: Seed the fixture (one-time)
cd ~/Desktop/projects/university_helper
source venv/bin/activate
python scripts/seed_client_fixture.py
# Copy the email + password it prints

# Browser
open http://localhost:8443
# Log in with fixture credentials.
# Verify each of the 10 acceptance criteria.
```

---

## §9. Defect-Discovery Prompts

> Run it, don't just read it.

- **Login returns CORS error in browser console** → `cors_origins` in `.env` not updated, or backend not restarted.
- **Login returns 401 with correct credentials** → `x-auth-mode` header missing or wrong case. Must be exactly lowercase `api`.
- **Login returns 404** → frontend calls wrong path. Should be `/api/v1/auth/login`.
- **Dashboard loads but is empty** → fixture user has no modules; re-run `seed_client_fixture.py`.
- **Dashboard shows "Loading" forever** → fetch is failing silently. Open DevTools Network tab; check the request's status.
- **Summary panel returns 429** → quota exhausted; wait for midnight PT or use a fresh fixture.
- **Summary panel returns 503** → `GEMINI_API_KEY` missing or invalid in `.env`.
- **After login, refreshing kicks you back to login** → `onSuccess()` called before `setToken()` completes. Reorder.
- **Two login requests sent** → form is submitting via both `onClick` and `onSubmit`. Ensure the button is `type="submit"` and no `onClick` is attached.

---

## §10. Sign-Off Checklist

- [ ] Figma project located and dev server runs
- [ ] Backend CORS accepts `http://localhost:8443`
- [ ] `VC.api()` helper exists and attaches bearer token
- [ ] Login POSTs to `/api/v1/auth/login` with `x-auth-mode: api`
- [ ] Successful login stores token in `localStorage`
- [ ] Dashboard fetches `/api/v1/academic/dashboard`
- [ ] Real module codes appear (from fixture)
- [ ] Real tasks appear in "deadlines" section
- [ ] Real AI quota appears in sidebar
- [ ] Summary panel POSTs to `/api/v1/ai/summarize`
- [ ] Real summary displays
- [ ] Logout clears token and returns to login
- [ ] Refreshing dashboard stays logged in
- [ ] No hardcoded dashboard data remains
- [ ] No new packages installed
- [ ] Demo loop takes under 2 minutes

---

## §11. What Comes Next (After Tonight)

If tonight's sprint succeeds, tomorrow (Saturday) is:

1. **Rehearse the demo.** Practice the six interactions. Identify anything that's slow or crashes.
2. **Fix small issues found in rehearsal.**
3. **Deploy.** Cloudflare Pages for frontend, tunnel for backend (`cloudflared` or `ngrok`).
4. **Write the pitch.** 2 minutes, scripted.
5. **Sleep by 1am.**

Sunday morning is a final dry-run, then the hackathon.

---
