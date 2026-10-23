# Technical architecture — Varsity Companion

**Last verified:** 2026-10-23 against the running system, not from memory.
**Audience:** anyone joining the project, or reviewing it.

---

## 1. What the system is

A phone-first study companion for South African university students. A student
adds modules, records deadlines, finds study materials automatically, and
summarises their own notes. It is designed for a weak connection and a low
data budget, because that is the environment it runs in.

**The promise every decision serves:** *a student must not be blocked the night
a deadline is due.*

---

## 2. System context

```
                        ┌──────────────────────────┐
   Student (phone) ────▶│  Web app (React SPA)     │  Cloudflare Workers
                        │  uni-companion.          │  static assets, global CDN
                        │  scrapymog.workers.dev   │
                        └───────────┬──────────────┘
                                    │ HTTPS / JSON
                                    │ bearer token + HttpOnly refresh cookie
                                    ▼
                        ┌──────────────────────────┐
                        │  API (FastAPI)           │  Render, Docker, free tier
                        │  uni-companion.          │  ~1 vCPU, sleeps when idle
                        │  onrender.com            │
                        └─────┬──────────┬─────────┘
                              │          │
                     ┌────────▼──┐   ┌───▼──────────────────────────┐
                     │ PostgreSQL│   │ External services (outbound) │
                     │ Neon      │   │ · Gemini (AI summaries)      │
                     │ eu-west-2 │   │ · OpenAI-compatible gateways │
                     └───────────┘   │ · arXiv / Crossref /         │
                                     │   Wikipedia / Open Library / │
                                     │   Open Textbook Library      │
                                     └──────────────────────────────┘

                        ┌──────────────────────────┐
   Student (phone) ────▶│  Mobile app (Expo/RN)    │  same API, separate UI
                        │  SDK 57, expo-router     │  token in SecureStore
                        └──────────────────────────┘
```

**Two clients, one API.** The web app and the mobile app are independent
frontends over the same contract. Features must be built twice if both should
show them — a cost that is real and is why mobile is out of scope for the
hackathon weekend.

---

## 3. Stack

| Layer | Technology | Version |
|---|---|---|
| API | FastAPI | 0.115.0 |
| Server | Uvicorn | 0.32.0 |
| ORM | SQLAlchemy | 2.0.35 |
| Migrations | Alembic | 1.13.3 (head **`0014`**) |
| Validation | Pydantic | 2.9.2 |
| Database | PostgreSQL (Neon) | 15+, driver `psycopg` 3.3.5 |
| Rate limiting | Slowapi | — |
| Web | React + Vite + Tailwind + TypeScript | 19 / 8 / 4 / 5.7 |
| Mobile | Expo + expo-router | SDK 57 |
| Container | Docker, `python:3.13-alpine`, non-root, **< 150 MB enforced** | — |
| CI | GitHub Actions | — |

---

## 4. Backend layers

```
app/
├── main.py              app assembly: middleware, routers, lifespan
├── api/
│   ├── deps.py          get_current_user, require_role
│   └── v1/              one router per domain
│       auth · academic · ai · materials · dashboard
│       analytics · sync · admin · bursaries
├── services/            business rules, framework-agnostic
├── models/              SQLAlchemy tables
├── schemas/             Pydantic request/response shapes
├── core/                config, security, rate limiter, sanitizer,
│                        roles, legal, logging, event types
└── db/session.py        engine, SessionLocal, Base
```

**The rule that makes this testable:** a service never imports FastAPI. It takes
plain objects and an injected `Session`, so every business rule can be tested
without a server or a request. Routers do three things only — authenticate,
validate, delegate.

### Request pipeline

Every request passes through, in order:

1. **Correlation ID** — one id per request, attached to logs
2. **Request size** — rejects oversized bodies before parsing
3. **Rate limiting** — per-client, plus tighter per-route limits
4. **Security headers**
5. **CORS** — an explicit allow-list; the Workers origin is whitelisted
6. **Router → service → database**

### Key services

| Service | Responsibility |
|---|---|
| `user_service` | create/authenticate/deactivate; the only place a password is hashed |
| `refresh_token_service` | rotate, revoke, detect replay, purge chains |
| `ai_service` | summary generation, cache, quota, model fallback |
| `material_ingest_service` | fetch materials from 6 sources, validate URLs, score relevance |
| `material_service` | module-scoped search over approved rows |
| `bursary_service` | exclude ineligible bursaries, score and rank matches |
| `dashboard_service` | aggregate deadlines, modules and quota |
| `purge_service` | POPIA hard-delete past retention |
| `consent_service` | consent state and anonymised signal handling |

---

## 5. Authentication and sessions

This is the most carefully built part of the system and the part most easily
broken by careless editing.

```
signup ─▶ login ─▶ access JWT (15 min, stateless) ─▶ API calls
                     │
                     └─ expires ─▶ refresh token (7 days, opaque, hashed at rest)
                                     │
                                     ├─ rotate: issue new, mark old replaced
                                     └─ replay of a used token ─▶ revoke chain
```

- **Access token** is a short-lived JWT. It cannot be revoked, which is exactly
  why it is short.
- **Refresh token** is an opaque random string stored only as a SHA-256 hash, so
  a database leak yields no usable sessions.
- **Rotation with reuse detection.** A consumed token replayed means theft or a
  double-fired client; the entire chain is revoked rather than guessing which
  holder is legitimate.
- **Where the token lives differs per client:** `localStorage` on web,
  `expo-secure-store` on mobile. Everything else is shared.
- **401 means three different things**, and the client must not flatten them:
  bad credentials, a failed re-auth password, or an expired token. See
  `REAUTH_PATHS` in `frontend/src/lib/api.ts`.

---

## 6. Data model

14 tables, one migration per change.

```
users ─┬─< modules ─┬─< timetable_slots
       │            └─< academic_tasks
       ├─< refresh_tokens          (cascade on delete)
       ├─< usage_events            (cascade)
       ├─< feedback                (cascade)
       ├─< user_consents           (cascade)
       ├─< user_ai_quota
       ├─< ai_summary_cache
       └─< brief_documents ─< brief_chunks

study_materials       shared, not per-user; notified by module_code
bursaries             shared, curated content; matched at read time
```

**Two deliberately shared tables.** `study_materials` and `bursaries` describe
facts about the world, not student data. Neither has a `user_id`; both are
scoped at read time. This keeps them cacheable and means one curator action
serves every student.

**Deletion semantics (POPIA).** Deleting an account sets `is_active = false`,
stamps `deleted_at`, and replaces the password hash with a dummy. Cascading rows
go with it. A separate purge erases rows older than `POPIA_RETENTION_DAYS`
(30). **Known gap:** the purge has no scheduler (TASK-0010) and must be triggered
manually until fixed.

---

## 7. External integrations

| Service | Use | Failure behaviour |
|---|---|---|
| Gemini / OpenAI-compatible | AI summaries | model fallback chain, then honest error |
| arXiv, Crossref, Wikipedia, Open Library, Open Textbook Library, YouTube | materials | each collector returns `[]` on failure; one source failing never fails the request |
| Neon | data | connection pool; `database_connected` surfaced in `/health` |
| Cloudflare Workers | web hosting | static, globally cached |

**Outbound calls are SSRF-guarded** by a hard host allow-list checked before
every fetch, not merely before the first.

**Only official APIs are used.** No publisher HTML scraping, no robots.txt
evasion, no search-engine scraping.

---

## 8. Frontend architecture (web)

```
App.tsx
 ├─ auth gate → AuthPage
 └─ shell ─┬─ OverviewTab     (first-run guide, deadlines, modules, activity)
           ├─ SummariesTab    (paste or upload → summary)
           ├─ MaterialsTab    (module-scoped search + "find resources")
           ├─ PlannerTab
           └─ SettingsPanel   (profile, consent, sign out, delete account)

lib/
 ├─ api.ts          fetch wrapper: auth header, single-flight refresh, typed errors
 ├─ session.ts      session marker, error-to-sentence mapping
 └─ fileText.ts     PDF/DOCX text extraction in the browser
```

**Data flow.** `App` holds the shared module list; each tab fetches what only it
needs. There is no global store and no query cache library — state is React
state, kept deliberately small.

**Error handling.** `api.ts` converts FastAPI's validation arrays into sentences
("Module code is too short"), and `session.ts` maps status codes to actionable
text. A student never sees `[object Object]`.

**Fonts are self-hosted** (61 KB, two variable `.woff2` files). There is no
Google Fonts request, so typography survives a blocked network.

---

## 9. Deployment

| Piece | Where | Trigger |
|---|---|---|
| Web | Cloudflare Workers | push to `main` (build declared in `frontend/wrangler.toml`) |
| API | Render (Docker) | push to `main` |
| DB migrations | Render release step / CI | `alembic upgrade head` |
| Keep-warm | GitHub Actions, every 10 min | `.github/workflows/keep-warm.yml` |

**Free-tier constraints, stated plainly:**

- Render sleeps after ~15 min idle; first request then takes 5–15 s.
- ~750 instance-hours/month. The keep-warm job uses ~730. **Do not add a second
  free service** — it would exhaust the allowance for both.
- One instance, ~1 vCPU, no GPU. This is why scoring is arithmetic rather than
  a model.

---

## 10. CI gates

A merge to `main` must pass all three. They are the reason "it works on my
machine" is not enough.

| Check | What it catches |
|---|---|
| **Lint, Migrate & Test** | ruff, `alembic upgrade head`, full pytest suite |
| **OpenAPI contract sync** | a route added without regenerating `docs/openapi.json` |
| **Build & Verify Image** | image > 150 MB, or a non-root runtime user |

The contract check is the one most easily forgotten: `python
scripts/export_openapi.py docs/openapi.json` must be run and committed whenever
a route changes.

---

## 11. Security posture

| Concern | Control |
|---|---|
| Passwords | bcrypt via `app.core.security`; never logged, never returned |
| Tokens | short-lived JWT; refresh token hashed at rest; rotation + replay detection |
| Authorisation | `require_role`; every query scoped to the caller's `user_id` |
| Input | Pydantic validation; `sanitize_string`; ORM-bound parameters only |
| Outbound | host allow-list (SSRF); verified links only |
| Abuse | per-route rate limits; request size cap; security headers |
| Secrets | environment only; `.env` git-ignored; a pre-commit credential scan |
| Privacy | raw notes not stored (metadata only); consent optional; deletion real |

**Known limitation:** GitHub branch protection is unavailable on a private repo
without GitHub Pro, so enforcement is local git hooks plus CI. `--no-verify`
bypasses the hooks; the rule still binds the person even when the hook does not.

---

## 12. Testing

| Layer | Location | What it proves |
|---|---|---|
| Unit | `tests/test_*_service.py` | business rules in isolation, no server |
| API | `tests/test_*_api.py` | auth, serialisation, and rules through FastAPI |
| Contract | `tests/test_materials_contract_snapshots.py` | response shape did not change |
| Relevance | `tests/test_material_relevance.py`, `tests/test_bursary_matching.py` | scoring is deterministic and correct |

**Project rule:** a test must be seen to fail before the code that makes it pass
exists. A test that has only ever been green proves nothing.

---

## 13. Known gaps and deliberate deferrals

Honest list, so nobody discovers these in a demo:

| Item | Status |
|---|---|
| POPIA purge has no scheduler | **TASK-0010** — must be triggered manually |
| Materials library is thin in production | **BLK-0003** — per-module fetch fills it in ~30–60 s |
| Mobile has no bursary or study-plan screens | deferred; web only for the hackathon |
| No push notifications | needs `expo-notifications`; not built |
| iOS build | needs Apple Developer (~R1,300/yr) |
| Bursary seed is deliberately empty | entries require human verification |

---

## 14. Design rules that are not negotiable

1. **Additive over invasive.** New features add files and lines; they do not
   reshape what works.
2. **A service never imports FastAPI.** Rules must be testable without a server.
3. **No package without asking.** The image budget and the free tier both depend
   on it.
4. **Honest UI over clever UI.** If something is slow, say it is slow; if it
   fails, say it failed. The app tells the truth even when the news is bad.
5. **Wrong data is worse than no data.** A dead application link, or a bursary
   with an invented deadline, is the worst outcome this system can produce.
