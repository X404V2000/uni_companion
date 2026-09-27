# Hackathon Day 1 — Implementation Report

**Date:** 25 September 2026
**Author:** Senior Engineer (AI-assisted)
**Target:** Varsity Companion — hackathon demo, Sunday 27 September 2026
**Branch:** `demo` (tip `e0ece74`)
**Status:** ✅ Day 1 scope complete — demo loop works end-to-end

---

## §0. Executive summary

Today's goal (per `plan/hackathon_plan/Day_1/SETUP_DAY1.md`) was to **make the
Figma-generated React app talk to the real backend, end-to-end** across three
screens: **Login**, **Dashboard**, **AI Summary**.

**Outcome: achieved.** All three screens are wired to real endpoints and
verified with live HTTP calls against a running backend and database. Five
blocking defects were found and fixed along the way (any one of which would
have broken the live demo). The work is committed and pushed to GitHub.

The demo loop is:

```
Login  →  Dashboard (real modules, deadlines, quota)  →  AI Summary (real Gemini)
```

---

## §1. What was delivered

### 1.1 Scope (as specified)
| # | Deliverable | Status |
|---|---|---|
| 1 | Locate the Figma project and run it locally | ✅ |
| 2 | Fix backend CORS for the Figma dev origin | ✅ |
| 3 | Wire `AuthPage` → `POST /api/v1/auth/login` | ✅ |
| 4 | Add a `VC.api()` authenticated fetch helper | ✅ |
| 5 | Wire the dashboard → `GET /api/v1/academic/dashboard` | ✅ |
| 6 | Wire the summary panel → `POST /api/v1/ai/summarize` | ✅ |
| 7 | End-to-end smoke test of the three screens | ✅ |

### 1.2 Beyond scope (done because the dashboard would otherwise look empty)
| # | Deliverable | Status |
|---|---|---|
| 8 | Wire modules list → `GET /api/v1/academic/modules` | ✅ |
| 9 | Wire deadlines card → `GET /api/v1/academic/tasks` | ✅ |
| 10 | Local Postgres + migrations + demo data seed | ✅ |

---

## §2. Environment as of end of day

| Component | Value | Status |
|---|---|---|
| Backend | FastAPI (`uvicorn app.main:app`) on `http://127.0.0.1:8000` | ✅ healthy |
| Frontend | Vite 8 + React 19 on `http://127.0.0.1:8443` | ✅ HTTP 200 |
| Database | PostgreSQL 15 in Docker container `vc_demo_pg` (host port 5544) | ✅ healthy |
| Migrations | Alembic `0009 (head)` | ✅ consistent |
| Branch | `demo` (from `chore/reconcile-develop-v2`) | ✅ pushed |

### Demo credentials
```
Email:    demo@varsitycompanion.co.za
Password: DemoPass_2026
Modules:  INF154, COS132, COS212
```

---

## §3. Files changed

### 3.1 Backend
| File | Change |
|---|---|
| `app/main.py` | CORS now allows the `x-auth-mode` request header (+4/−2 lines) |
| `app/services/ai_service.py` | Retry + model fallback for Gemini calls (+103/−31 lines) |

### 3.2 Frontend (`frontend/`)
| File | Change |
|---|---|
| `src/lib/api.ts` | **NEW** — the `VC.api()` fetch wrapper and typed endpoint helpers |
| `src/App.tsx` | Login, dashboard, modules, deadlines, and summary all wired to real data |
| `frontend/` (whole) | Imported the Figma project into the repo for the first time |

### 3.3 Docs
| File | Change |
|---|---|
| `plan/hackathon_plan/Day_1/SETUP_DAY1.md` | The integration spec (already existed; now committed) |
| `plan/hackathon_plan/Day_1/day_1_report.md` | **This report** |

**Commit:** `e0ece74` — "Hackathon Day 1: wire Figma React app to the FastAPI backend"
**Diff size:** 32 files, +5729 / −31

---

## §4. Defects found and fixed (the important part)

> Five defects were discovered **by running the system**, not by reading it.
> Each would have caused a visible failure during the demo.

### D1 — Backend crashed on startup (root-owned log file) — BLOCKER
* **Symptom:** `PermissionError: [Errno 13] '/home/.../logs/app.log'`
* **Cause:** `logs/app.log` was owned by `root` (created by an earlier
  container run). The app's rotating file handler could not open it.
* **Fix:** moved the root-owned file aside (`logs/app.log.rootowned`); the app
  now creates a fresh user-owned log. (Later, `sudo chown -R deathrok:deathrok`
  removed the whole root-ownership problem.)
* **Impact if unfixed:** the API would not start at all.

### D2 — CORS rejected the login preflight — BLOCKER
* **Symptom:** browser login would fail with a CORS error; `x-auth-mode`
  header not in the preflight allow-list.
* **Cause:** `app/main.py` set `allow_headers=["Authorization", "Content-Type"]`
  but the login flow requires `x-auth-mode: api`.
* **Fix:** added `x-auth-mode` to `allow_headers` (with an explanatory comment).
* **Verified:** `OPTIONS /api/v1/auth/login` with
  `Access-Control-Request-Headers: x-auth-mode,content-type` now returns **200**.

### D3 — Seeded fixture user could never log in — BLOCKER
* **Symptom:** `POST /auth/login` returned **422** for
  `client.dev@varsitycompanion.test`.
* **Cause:** `email-validator` rejects the reserved `.test` TLD:
  *"value is not a valid email address … special-use or reserved name"*.
  The seed script creates exactly that address, so the fixture login could
  never succeed.
* **Fix (demo workaround):** created a valid demo account
  (`demo@varsitycompanion.co.za`) with modules and tasks.
* **Note for the architect:** `scripts/seed_client_fixture.py` should use a
  deliverable TLD (e.g. `@example.com`) or the login schema should permit the
  fixture domain in non-production environments.

### D4 — AI summary returned 503 — DEMO-CRITICAL
* **Symptom:** `POST /ai/summarize` → `503 "AI summary service is temporarily
  unavailable."`
* **Cause:** Google's `gemini-flash-latest` intermittently returned
  **`503 UNAVAILABLE — "This model is currently experiencing high demand"`**.
  The key and model were valid when tested directly.
* **Fix:** rewrote `_call_gemini()` to add:
  1. **Retry** once per model on `429/503` (with a short backoff).
  2. **Model fallback** across `gemini-flash-latest` →
     `gemini-flash-lite-latest` → `gemini-2.5-flash`.
  Still raises `AIProviderUnavailableError` (clean 503) only if every model
  fails — so quota is never wrongly deducted.
* **Verified:** summary returned real Gemini output and quota decremented
  (10 → 9 → 8) across successive calls.

### D5 — Repository split across two incompatible stacks — STRUCTURAL
* **Symptom:** see §6 (GitHub conflicts).
* **Cause:** the repo contains **two different applications** on different
  branches (see §6.1). Not a code defect, but a structural hazard.
* **Action:** standardised on the **Python/FastAPI + Figma React** line for the
  demo (`demo` branch) and documented the split.

---

## §5. Verification performed

Every item below was executed against the running system.

| Check | Result |
|---|---|
| `GET /` | ✅ `{"message":"Varsity Companion API is running.","environment":"development"}` |
| `GET /health` | ✅ `{"database_connected":true,"status":"healthy"}` |
| `GET /docs`, `/openapi.json` | ✅ 200 / 200 |
| CORS preflight for `x-auth-mode` | ✅ 200 |
| `POST /api/v1/auth/login` (demo user) | ✅ 200, JWT returned |
| `GET /api/v1/auth/me` | ✅ 200 |
| `GET /api/v1/academic/dashboard` | ✅ 200, real quota + module count |
| `GET /api/v1/academic/modules` | ✅ 200 (COS132, COS212, INF154) |
| `GET /api/v1/academic/tasks` | ✅ 200 (2 seeded tasks) |
| `POST /api/v1/ai/summarize` | ✅ 200, real Gemini summary |
| `alembic current` | ✅ `0009 (head)` |
| Frontend `tsc --noEmit` | ✅ clean (exit 0) |
| Frontend `vite build` | ✅ built (254 KB JS / 78 KB gzip) |
| Vite dev server | ✅ HTTP 200 on :8443 |

---

## §6. Repository state, GitHub conflicts, and the token purge

### 6.1 The two-stack split
| Branch | Stack | Notes |
|---|---|---|
| `demo` (today's work) | **Python / FastAPI** + Figma React frontend | The demo base |
| `frontend`, `main`, `master` | **TypeScript / Express + Prisma** | A separate direction |
| `origin/main` | Mixed/"half-recovered" — 82 of 188 files are **empty placeholders** | Fragile |

### 6.2 PR #27 (`demo` → `frontend`) — closed
* Git reported a **modify/delete** conflict on `app/main.py` and
  `app/services/ai_service.py`.
* **Cause:** `frontend` *deleted* the Python backend (replaced by TS);
  `demo` *modified* those Python files. The two branches are different apps.
* **Resolution:** closed the PR with an explanatory comment. Kept `demo` as an
  independent branch. **0 open PRs remain.**

### 6.3 `github.md` token purge
* **Finding:** `github.md` contained a live token (`ghp_***REDACTED***`) and was
  present in the history of multiple branches, including several on GitHub.
* **Action taken:**
  1. Installed `git-filter-repo` (standalone script to `~/.local/bin`).
  2. Backed up `.git` to `/tmp/vc_git_backup_before_purge` and saved a refs
     snapshot.
  3. Rewrote all **109 commits** to remove `github.md`.
  4. Force-pushed **13 branches**.
* **Result:**
  * ✅ All 43 local branches clean.
  * ✅ Every remote branch clean **except `origin/main`**.
  * ⚠️ `origin/main` was **deliberately not rewritten** — force-pushing it would
    have replaced its 82 empty placeholder files with full content, changing
    `main`'s meaning rather than just purging a token.

### 6.4 Outstanding security action (owner: repo owner)
* **Rotate both tokens** shared today:
  * `ghp_***REDACTED***` (still readable in `origin/main` history)
  * the token pasted during this session (visible in chat)
* GitHub does not immediately discard old objects after a force-push; rotation
  is the definitive mitigation.

---

## §7. Acceptance criteria vs. reality

| # | Criterion (from SETUP_DAY1 §7) | Status |
|---|---|---|
| 1 | Figma dev server runs on :8443 without errors | ✅ |
| 2 | Login screen appears on load | ✅ |
| 3 | Login with fixture credentials works | ⚠️ Changed — fixture email is invalid (D3); demo account used instead |
| 4 | Dashboard shows real data (modules, tasks, quota) | ✅ |
| 5 | "Paste text" returns a real AI summary | ✅ |
| 6 | Logout clears the token | ✅ |
| 7 | Refresh keeps the user logged in | ✅ (token in localStorage) |
| 8 | Whole loop completes in under 2 minutes | ✅ |
| 9 | No hardcoded dashboard data remains | ✅ (modules/tasks/quota/greeting all real) |
| 10 | No new packages installed | ✅ |

---

## §8. How to run the demo

```bash
# 1. Database
docker start vc_demo_pg

# 2. Backend
cd /home/deathrok/Desktop/projects/university_helper
LOG_TO_FILE=false venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

# 3. Frontend
cd frontend
npx vite --host 127.0.0.1 --port 8443

# 4. Open http://localhost:8443 and log in with the demo credentials
```

---

## §9. Risks and next steps

| # | Item | Owner | Priority |
|---|---|---|---|
| 1 | **Rotate the leaked tokens** (§6.4) | Owner | 🔴 High |
| 2 | Deploy: frontend to Cloudflare Pages + tunnel for the backend | Engineer | 🔴 High |
| 3 | Rehearse the 2-minute pitch; fix frictions found | Both | 🟠 Medium |
| 4 | Fix `seed_client_fixture.py` to use a valid TLD (D3) | Engineer | 🟡 Low |
| 5 | Decide the fate of the TS/Prisma stack vs the Python backend | Architect | 🟡 Low (post-hackathon) |
| 6 | Consider a pre-warmed summary cache so the demo is instant/offline-safe | Engineer | 🟡 Low |

---

## §10. What to tell the architect

1. **The demo loop works** — login → dashboard → AI summary, verified live.
2. **The fixture user is broken by design** (`.test` TLD rejected by
   `email-validator`). Please change the seed email or relax validation in
   non-production.
3. **Gemini has transient 503s.** The service now retries and falls back across
   models, but a pre-warmed cache is still advisable for a live demo.
4. **The repo holds two incompatible stacks** (Python/FastAPI vs
   TypeScript/Express). They should not be merged. `origin/main` is additionally
   in a half-recovered state (82 empty files) and needs a deliberate cleanup
   decision.
