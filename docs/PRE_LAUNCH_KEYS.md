# Pre-Launch Keys & Configuration Checklist

> **Living document** — update this file every time a new key, external
> service, or configuration requirement is added to the codebase.
>
> **How to use:** before any deployment (staging or production), walk this
> checklist top-to-bottom. "Required for boot" items must be set or the app
> refuses to start; everything else has a safe default in development but must
> be reviewed for production.
>
> Last updated: 12 September 2026 · App version: 0.1.0

---

## 1. Hard-required for the app to boot

The app **will not start** without these. Set in the deploy environment
(secrets manager / platform env vars), never in a committed file.

| Env key | Purpose | Notes / how to obtain |
| :--- | :--- | :--- |
| `DATABASE_URL` | Postgres connection string | Neon dashboard → Connection Details. **Must use `postgresql+psycopg://`** (psycopg v3). The generic `postgresql://` maps to psycopg2, which is not installed. |
| `JWT_SECRET_KEY` | HS256 signing secret | Generate: `openssl rand -hex 32` (≥ 64 hex chars). **Unique per environment** (dev/staging/prod must differ). In `staging`/`production` the app refuses to boot if the key is <32 chars or a known dev/CI default. |

---

## 2. Must set before real user signups / traffic

These default to "safe no-op" in development but must be consciously set for
launch.

| Env key | Dev default | Required before | Notes |
| :--- | :--- | :--- | :--- |
| `EMAIL_API_KEY` | *(empty → emails silently skipped)* | **Live signups** | Resend API key. Without it, welcome emails are no-ops. |
| `EMAIL_FROM` | `onboarding@varsitycompanion.co.za` | Live signups | Must be a **verified sender domain** in Resend. |
| `ENVIRONMENT` | `development` | **Every deploy** | One of `development` / `testing` / `staging` / `production`. `staging` and `production` are fully hardened (Secure cookies, docs off, HSTS, JWT boot guard). |
| `CORS_ORIGINS` | `http://localhost:8000` | **Every deploy** | Comma-separated real frontend origin(s). |
| `REDIS_URL` | *(empty → in-memory rate limiting)* | **Multi-instance / multi-worker** | Without it, rate-limit counters reset per process and are bypassable under load. Requires the `limits[redis]` extra. |
| `LOG_TO_FILE` | `true` | Containers/orchestrated | Set `false` (stdout captured centrally; no writable disk). |

---

## 3. Optional — change only when a behaviour differs from default

| Env key | Default | When to override |
| :--- | :--- | :--- |
| `JWT_ALGORITHM` | `HS256` | Only if switching signature algorithm (rare). |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | If a different session length is required. |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Refresh tokens deferred; revisit when implemented. |
| `POPIA_RETENTION_DAYS` | `30` | If the soft-delete → hard-purge window must change. |
| `EMAIL_PROVIDER` | `resend` | Only if a different email provider is adopted. |

---

## 4. External services (add rows as new integrations appear)

| Service | Purpose | Credential key | Status |
| :--- | :--- | :--- | :--- |
| Neon Postgres | Primary database | `DATABASE_URL` | ✅ Configured (dev) |
| Neon Postgres (staging) | Staging database — **separate project** | `STAGING_DATABASE_URL` | ⏳ Needs a separate staging project |
| Resend | Transactional email | `EMAIL_API_KEY` | ⏳ Key not yet set (emails no-op) |
| **Google Gemini** | AI course-aware summaries | `GEMINI_API_KEY` | ✅ Set (dev). **Critical for unit economics** — see below. |
| Redis (Upstash or self-hosted) | Distributed rate limiting | `REDIS_URL` | ⏳ Deferred until scale-up |
| Cloudflare | Edge WAF / TLS / DNS (staging + prod) | DNS + WAF rules (no env key) | ⏳ Needs account + `staging-api` DNS record |

### AI cost controls (GEMINI_API_KEY — must review before launch)

`GEMINI_API_KEY` powers the AI summary engine. The planning docs are explicit
that uncontrolled LLM usage destroys unit economics, so **before any real
student traffic** confirm:

- `GEMINI_MODEL` is a cheap model (`gemini-flash-latest` default).
- The **daily free quota (10 summaries/user)** + **per-user result cache** are
  active (they are, in `ai_service.py`).
- A monthly spend cap / alert is set on the Google AI / billing dashboard.
- `GEMINI_API_KEY` is **not** the same key in dev, staging, and production.

Staging-specific env keys (`STAGING_*`) — set in the staging deploy environment,
never committed: `STAGING_DATABASE_URL`, `STAGING_JWT_SECRET_KEY`
(≥ 32 chars, boot-guarded), `STAGING_EMAIL_API_KEY`, `STAGING_CORS_ORIGINS`.
See `docs/STAGING_DEPLOYMENT.md` for the full walkthrough.

---

## 5. Secrets hygiene (non-negotiable)

- `.env` is git-ignored and excluded from the Docker image (`.dockerignore`).
- Never reuse `JWT_SECRET_KEY` across environments.
- Secrets go in a **platform secrets manager / env vars**, never in committed
  code, plan docs, or chat logs.
- Rotate `JWT_SECRET_KEY` if it is ever exposed — invalidates all existing
  sessions (users must re-login).

---

## 6. Change log

| Date | Change |
| :--- | :--- |
| 2026-09-12 | Created document. Documented `DATABASE_URL` psycopg3 scheme requirement, `EMAIL_API_KEY`, `REDIS_URL`, `LOG_TO_FILE`, and `.env.example` completeness fix. |
| 2026-09-12 | Day 3 hardening: added `staging` environment; JWT boot guard (min 32 chars + weak-default denylist) enforced in `staging`/`production`; HSTS covers `staging` too. |
| 2026-09-12 | Day 4 staging: added staging deploy orchestration + Cloudflare checklist; documented `STAGING_*` env keys and staging Neon project requirement. |
| 2026-09-12 | Month 2 AI engine: added `GEMINI_API_KEY` + `GEMINI_MODEL`; documented AI cost controls (daily quota + per-user cache + spend cap) to protect unit economics. |
