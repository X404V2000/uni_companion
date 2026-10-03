# Project History

**Last updated:** 1 October 2026
**Purpose:** engineering handover. Read this before touching the code — it records what
exists, why it is that way, and which mistakes have already been made once.

---

## 1. What this is

**Varsity Companion** — an AI study companion for South African university students.
Course-aware summaries, deadline tracking, a curated study-materials library, and
POPIA-compliant handling of student data.

### Live right now

| Piece | URL | Notes |
|---|---|---|
| Web frontend | `https://uni-companion.21401284.workers.dev` | Cloudflare Workers |
| Backend API | `https://uni-companion.onrender.com` | Render, Docker |
| Database | Neon (`eu-west-2`) | Migration `0012` |

**Demo account:** `demo@varsitycompanion.co.za` — password is in the founder's password
manager, deliberately not here.

> **Credential history, worth knowing.** An earlier demo password was committed to
> `plan/hackathon_plan/Day_1/day_1_report.md` and pushed to both repos. That account has
> role **admin**, so the exposure was serious rather than cosmetic. The password has since
> been rotated on the live database: the old value returns 401 and no longer authenticates.
> The dead value still exists in git history, which is harmless, but do not commit a live
> one again. Note also that rotating `DATABASE_PASSWORD` does **not** address this — that
> key protects the Postgres connection, whereas this is an application login credential
> stored as a bcrypt hash in the `users` table.

**API docs:** append `/docs` to the backend URL.

---

## 2. The two repositories

There are two GitHub repos. **They are not different codebases** — one is a clean-history
copy of the other.

| | `X404V2000/university_helper` | `X404V2000/uni_companion` |
|---|---|---|
| Commits | 152 | 7 |
| Branches | **30 remote, many stale** | **1** |
| Contains | identical `app/`, same 12 migrations, 42 test files | identical `app/`, same 12 migrations, 42 test files |
| Also contains | `plan/` (86 files), dated reports, demo scripts | deployment config only |
| Role | **Frozen.** The hackathon submission. | **CANONICAL.** All new work. |

`diff -rq university_helper/app uni_companion/app` returns nothing. They are the same
backend.

### Why `uni_companion` is canonical

Not because it is newer — because `university_helper` has a live hazard:

- **`main` there does not contain `new_frontend_layout/`.** Building from `main` silently
  produces weeks-old code. This already caused one failed deployment.
- 30 branches means any tool that guesses a default branch has a 1-in-30 chance of being
  right.

`uni_companion` has one branch and one obvious answer.

### Do not do this

**Do not build Cloudflare from `university_helper`.** Point it at `uni_companion`, branch
`main`, path `frontend`.

---

## 3. Architecture

### Backend — FastAPI

```
app/api/v1/       routes          8 modules, 43 endpoints
app/schemas/      Pydantic v2     validation + the OpenAPI contract
app/services/     business logic  all real work happens here
app/models/       SQLAlchemy 2.0  tables
app/core/         config, security, rate limiting, logging
app/db/           session
alembic/versions/ 12 migrations, 0001 -> 0012
tests/            42 files, 498 tests
```

**Endpoints by area:**

| Module | Routes | Covers |
|---|---|---|
| `auth.py` | 5 | signup, login, logout, me, delete account |
| `academic.py` | 8 | modules, tasks, timetable |
| `ai.py` | 9 | summaries, brief RAG, recommendations, link fetch |
| `materials.py` | 3 | search, ingest |
| `analytics.py` | 6 | activity, consent, improvement signals |
| `sync.py` | 2 | **offline push / pull delta** |
| `dashboard.py` | 2 | unified dashboard, at-risk |
| `admin.py` | 8 | curation, coverage |

### Frontend — React 19 + Vite

Lives at `frontend/` in `uni_companion` (was `new_frontend_layout/` in the other repo).
Tailwind 4, TypeScript, PWA, Playwright for verification.

### Database

PostgreSQL 15. Local development uses Docker on port `5544`; production is Neon.

**The driver scheme matters.** SQLAlchemy selects psycopg 3 only for
`postgresql+psycopg://`. A bare `postgresql://` silently falls back to **psycopg2**,
which this project deliberately never installs. See §7 for the bug this caused.

---

## 4. This week — 26 September to 1 October

39 commits. Grouped by theme rather than listed, because the individual messages are in
`git log`.

**AI summaries — rebuilt.** Long documents were being truncated at 32k characters and
silently losing the tail; now chunked map-reduce. PDFs and Word files could not be read at
all. Output was showing raw LaTeX (`\text{R}333\,333$`) instead of currency. And the
original prompt asked for brevity, producing eight flat bullets rather than a study guide.

**Materials library — replaced.** The library was placeholder rows: `example.org` URLs and
fabricated YouTube IDs. Every link was dead. Replaced with validated real sources, and an
ingest path that works for **any student-entered module**, not a hardcoded list.

**RAG — added.** "Chat with your brief": chunking, keyword retrieval with a phrase bonus,
grounded prompts, citations. Embeddings are behind a `rag_embedding_enabled` flag with the
column reserved.

**At-risk detection — added.** Deterministic heuristics flagging deadlines a student is
likely to slip.

**Frontend rework (Week 4 Day 1).** Refactor to 188 lines, copy revision, the warm-dark
palette, responsive frames, and a PWA conversion.

**Deployment — built from nothing.** Docker multi-stage (128 MB), Render, Cloudflare
Workers, and the whole chain verified end to end.

---

## 5. Deployment runbook

### Backend — Render

```
Repo:      X404V2000/uni_companion
Branch:    main
Runtime:   Docker          <- must be Docker, not Python
```

`scripts/docker_entrypoint.sh` does two things the previous CMD did not:

1. Runs `python -m alembic upgrade head` before serving. Without it a fresh database gets
   an empty schema and every request 500s.
2. Binds to `$PORT`. Render injects `10000`; the old CMD hardcoded `8000` and would have
   been marked unhealthy.

Invoked as a module rather than the `alembic` console script, because dependencies install
into `/install/lib` with no virtualenv, so `/install/bin` is not reliably on `PATH`.

**Required environment variables:**

| Key | Value |
|---|---|
| `ENVIRONMENT` | `production` |
| `DATABASE_URL` | Neon string. `postgresql://` is fine — normalised in `Settings`. |
| `JWT_SECRET_KEY` | ≥32 chars, not a known default. Boot guard rejects weak values. |
| `CORS_ORIGINS` | the deployed frontend origin, comma-separated |
| `GEMINI_API_KEY` | Google AI Studio key |

**Free tier sleeps after ~15 minutes.** First request then takes 30–60s. Open
`/health` before a demo to wake it.

### Frontend — Cloudflare Workers

```
Repo:      X404V2000/uni_companion
Branch:    main
Path:      frontend        <- the repo root has no package.json
Build:     npm run build
Deploy:    npx wrangler deploy
Output:    dist
```

`VITE_API_BASE` is compiled into the bundle at build time. **It now has a committed
default** in `frontend/src/lib/api.ts`, so a plain push produces a correct build without
touching the dashboard. The variable still wins when set.

---

### ⚠️ Render free-tier instance-hour budget — a hard constraint

Render's free tier allows **750 instance-hours per month**. A keep-warm ping every
10 minutes holds the backend awake around the clock, which uses **~720 of those
750 hours**, leaving roughly **30 hours of headroom**.

**Consequences, which are architectural rather than financial:**

- **A second Render service exceeds the free tier.** Staging cannot share the free
  tier with production. Standing up staging means either stopping the ping (the
  75-second cold start returns) or paying.
- **Every future "let's add a worker / queue / cron service" idea must clear this
  budget before it is designed**, not after it is built.
- The ping is an **optimisation, not a guarantee**. If it stops, students wait
  again. The app therefore handles a cold start itself — see
  `mobile/src/components/WakingUp.tsx`, which retries automatically behind a
  visible countdown. **Do not remove that component on the assumption the ping
  makes it unnecessary.**

Measured: cold start **75.6s**, warm **~1.4s**, and **3.1s** with the ping running.

### Redis is deliberately not used — a funded-scaling item

`REDIS_URL` is empty everywhere. Rate-limit counters live in the app's memory.

**Why this is correct today.** There is one Render instance. In-memory counters are
per-process, and one process means one set of counters — which is exactly what the
limiter needs. Redis would add a service to run, monitor and pay for, in exchange
for a guarantee the current deployment does not require.

**Why it is safe to switch on later.** `limits` resolves the `redis://` scheme by
importing the `redis` package, and the limiter is constructed at **module import**
time. Before this was addressed, setting `REDIS_URL` without that package installed
raised `ConfigurationError` and the app **failed to start entirely** — reproduced,
not theorised. The dependency (`redis==5.2.1`) is now in `requirements.txt` and
guarded by `tests/test_redis_optional.py`, so setting the variable later is a
one-line change rather than an outage.

**When it becomes worth it:**

| Situation | In-memory | Redis |
|---|---|---|
| One instance (today) | correct | unnecessary |
| Two or more instances | ❌ each has its own counters | ✅ shared |
| Must survive a restart | ❌ a deploy clears the throttle | ✅ persists |

That restart row is the honest one: with in-memory limits, an attacker who notices a
deploy can reset the login throttle by waiting for it. Not worth paying for now;
worth knowing.

**Decision: revisit when funded, or on the first second instance — whichever comes
first.** Do not add it for symmetry.

## 6. Decisions and why

**Modules are entered manually.** No autocomplete, no suggestion, no bundled module list.
Students type both the code and the full name. The AI then works from the name. An earlier
design pre-filled modules and was rejected — a student at an institution we did not
anticipate would have been stuck.

**Module code *and* name, with the name primary.** The code is short and useful for
matching; the name is what carries meaning to the AI.

**Chunked map-reduce summarisation.** Long documents are split, summarised per chunk, then
merged by a final call. An omission note is appended when content is dropped, so a
truncated summary never looks complete.

**A self-destroying service worker.** Caching is currently disabled. A PWA that silently
serves an outdated bundle is far more confusing than no offline support — it made several
fixes look like they had not been applied. Re-enable once the app is stable.

**React Native + Expo for mobile, not Flutter.** The roadmap PDF specifies Flutter. We
deviated deliberately: the existing frontend is React/TypeScript, the API client transfers
almost unchanged, Expo needs no new SDK, and Flutter would mean rewriting everything in
Dart with no team to maintain it. **This deviation is intentional and should not be
"corrected" without a conversation.**

**Both frontends live on.** Web is the demo and internal validation surface; mobile is the
product. They share one backend and one set of design tokens.

---

## 7. Bugs already fixed — do not reintroduce

Each of these cost real time. They are recorded by cause, not symptom.

| Bug | Cause |
|---|---|
| **Every screen looked empty** | `login()` returned the token but never called `setToken()`. All requests went out unauthenticated and every list rendered its empty state. One line. |
| **Fixes appeared not to work** | The PWA service worker precached `index.html` and the JS bundle, so the browser served a stale build indefinitely. |
| **`api.ts` was never committed** | A `.gitignore` rule `lib/` matched `frontend/src/lib/`. Anchored to `/lib/`. |
| **Cloudflare rejected the deploy** | SPA fallback configured twice — `_redirects` *and* `not_found_handling`. `_redirects` is the Pages mechanism; this project deploys as a Worker. |
| **Render crash: `No module named 'psycopg2'`** | Normalisation to `+psycopg` lived only in `app/db/session.py`. Alembic bypasses it and reads `settings.database_url` directly. Moved into a `Settings` validator. |
| **Home showed nothing after adding a deadline** | The dashboard returned the 5 soonest tasks; five already-overdue tasks consumed every slot. Now overdue-first, then upcoming, with a `(shown of total)` counter. |
| **Add deadline / Manage did nothing** | Buttons fired toasts. The forms existed only on another tab. |
| **Login worked, then every API call 401'd** | Cookie-first auth precedence let a stale cookie override an explicit `Authorization` header. Header now wins. |

**A pattern worth naming:** several of these were invisible to server-side checks. The API
always answered correctly — just never with the student's credentials. Verifying through a
real browser (Playwright) is what found them. Do not trust "the endpoint returns 200".

---

## 8. POPIA and consent

Migration `0012` added `user_consents` (append-only audit) and `improvement_signals` (no
content columns).

**Endpoints:**

```
POST /api/v1/analytics/consent          grant or withdraw
GET  /api/v1/analytics/consent          current state
GET  /api/v1/analytics/consent/history  full audit trail
```

**How it works:** consent is resolved **once per authenticated request** in
`app/api/deps.py` and cached on the user object. Resolving it inside `record_event` would
add a SELECT per event, and the dashboard fires two events per load.

**No consent means no write — and no query either.** `record_event` returns before
touching the database.

**Withdrawal deletes Category B data in the same transaction.** It deliberately does
**not** delete the consent rows themselves — those are the audit evidence.

**Mobile:** the consent sheet appears contextually at the first AI summary. Declining does
not block the feature; only telemetry is gated.

Per-field minimality justification: `plan/DATA_COLLECTION_FRAMEWORK.md`.

---

## 9. Open items

**Mobile V2 — offline sync.** The roadmap's headline differentiator for South African
connectivity. The backend already exposes `POST /api/v1/sync/push` and
`GET /api/v1/sync/pull?since=`. Estimated 1–2 weeks: local SQLite, the sync engine, and
conflict handling. **This is what separates Mobile V1 from the MVP.**

**Opportunity Hub.** Bursaries, learnerships, internships. Roadmap MVP-core, **not built** —
neither backend nor UI.

**Push notifications.** Deadline reminders. **Not built.** No notification service exists.

**Materials coverage for non-demo modules.** BIO110, CHE101, COS132, COS212 and INF154 have
5–14 resources each. A module a student invents has none until ingestion runs. The UI says
so rather than showing a dead end.

**Repo split cleanup.** `docs/REPO_SPLIT_TODO.md`.

---

## 10. Secrets

**Never commit:** `.env`, `.env.*` (except `.env.example`), `staging_deployement/`.

`staging_deployement/stag_env.md` contained a live Neon password and was pushed to six
branches before being caught. It is now gitignored and untracked.

**Rotate any value that has appeared in a chat, a tracked file, or a screenshot.** Two
GitHub tokens were leaked that way during this project.

The Render dashboard, Cloudflare dashboard, and Neon console are the sources of truth for
production values. This file names configuration keys and never their values.

---

## 11. The mobile app — `mobile/`

**Mobile V1.** Offline sync is not here; that is Mobile V2. See §9.

### Why React Native and not Flutter

The roadmap PDF specifies Flutter. That was overridden deliberately, and this is recorded
so it is not "corrected" by someone reading only the PDF. The reasons are in §6.

### Structure

```
app/_layout.tsx          providers and the navigation tree
app/(auth)/_layout.tsx   redirects a signed-in student onward
app/(auth)/sign-in.tsx   login and signup in one screen
app/(tabs)/_layout.tsx   the tab bar, and the redirect guard
app/(tabs)/index.tsx     Home — dashboard, deadlines, modules, activity
app/(tabs)/planner.tsx   deadlines, with the add form in a modal
app/(tabs)/summaries.tsx AI summaries, and the POPIA consent sheet
app/(tabs)/materials.tsx Find Materials
app/(tabs)/settings.tsx  profile, modules, consent toggle, sign out
src/lib/api.ts           the ported API client
src/lib/queries.ts       React Query layer
src/lib/consent.ts       POPIA consent
src/lib/session.tsx      who is signed in
src/lib/dates.ts         pure date helpers
src/theme.ts             the design tokens
src/components/ui.tsx    five shared primitives
```

### Verify it

```bash
cd mobile
npm install
npx tsc --noEmit        # must be clean
npx jest                # 27 tests
npx expo start          # then scan the QR code with Expo Go
```

Point it at a different backend with `EXPO_PUBLIC_API_BASE`. Without it, a development
build targets `127.0.0.1:8000` and a production build targets the deployed Render backend,
so a plain build is correct with no configuration.

### Two things that broke during the build, and why

**`Stack.Protected` froze the tab bar.** The first version gated the route groups with
`Stack.Protected guard={...}` in the root layout. Signing in worked — the API returned 200
and the token was stored — but tapping a tab changed the URL and left Home mounted. A
`Tabs` navigator inside a conditionally mounted group keeps whichever screen it first
resolved. **Fix:** both groups are now declared unconditionally and each group's own layout
redirects. Do not reintroduce a conditional group around a navigator.

**The session could not tell the guard it had changed.** With the session state living in
the root layout, `login()` had no way to say "a login happened", so the guard still saw
`signed-out` and the app bounced straight back to the login screen without any error.
**Fix:** `src/lib/session.tsx` holds the state and is readable and settable anywhere.

### A test does not need a real password

An early version of `api.test.ts` used the demo account's actual password. A test double
should use a placeholder. This matters beyond tidiness: putting a real credential in a
tracked file is precisely how the earlier leak happened (§1).

### What is deliberately not here

File upload, PDF/DOCX parsing, offline sync, the Opportunity Hub, push notifications,
biometrics, and store submission. Each is listed in §9. **File upload is the most likely
next ask** — the web client has it and a student will expect it on the phone.
