# Week 4, Day 4 — Staging Deployment & Cloudflare WAF

**Project:** Varsity Companion API
**Date:** 12 September 2026
**Branch:** `week4/day4-staging` (off `develop`)
**Status:** ✅ Code + local verification complete — live deploy & Cloudflare DNS pending user accounts

---

## 1. Objective

Package the hardened Day-3 app for a **staging** environment (full production
parity) and put Cloudflare WAF in front: TLS 1.3, DDoS mitigation, edge rate
limiting — while providing a repeatable, verified deployment path.

---

## 2. Deliverables

| File | Action | Notes |
| :--- | :--- | :--- |
| `deploy/docker-compose.staging.yml` | **NEW** | `ENVIRONMENT=staging`, non-root, healthcheck, migrations at start, secrets via env |
| `scripts/verify_staging_health.py` | **NEW** | Live smoke test (12 checks), exit 0 only if all pass |
| `docs/STAGING_DEPLOYMENT.md` | **NEW** | Step-by-step: Neon staging DB, Docker deploy, Cloudflare DNS + WAF |
| `docs/PRE_LAUNCH_KEYS.md` | **UPDATED** | Staging `STAGING_*` keys + Cloudflare in the services ledger |
| `plan/.../day_4/day_4_report.md` | **NEW** | This report |

---

## 3. Design decisions

- **Compose-based (not Render)** — reuses the exact Day-2 stack we already
  validated, provider-neutral (Hetzner VPS, any Docker host), and testable
  locally (done, see §5).
- **Bundled-Postgres OR managed-Neon, auto-detected** — the `web` service
  defaults `DATABASE_URL` to the in-file `db` service; setting
  `STAGING_DATABASE_URL` (and removing `db`) switches to managed Neon,
  which is the recommended production-parity path.
- **Secrets via `${VAR:?...}`** — the compose file *refuses* to interpolate if
  `STAGING_JWT_SECRET_KEY`/`STAGING_DB_PASSWORD` are missing, so a
  half-configured deploy can't start.
- **`127.0.0.1:8001` bind** — not publicly exposed; Cloudflare terminates TLS
  and proxies in.
- **Verification script imports legal versions from `app.core.legal`** — stays
  correct if consent versions bump; robust to invocation directory.

---

## 4. Acceptance criteria vs. implementation

| # | Criterion | Result |
| :--- | :--- | :--- |
| 1 | Deploys cleanly under `ENVIRONMENT=staging` | ✅ Verified locally (compose up, image build) |
| 2 | Alembic migrations (0001–0003) run against staging Postgres | ✅ Verified (`alembic upgrade head` at start; all tables created) |
| 3 | `GET /health` → 200 + `database_connected: true` | ✅ Verified (live local staging) |
| 4 | `/docs` + `/openapi.json` → 404 | ✅ Verified (both 404 in staging) |
| 5 | Cookies `Secure; SameSite=Lax; HttpOnly` + HSTS | ✅ Verified (12/12 checks green) |

The **literal public domain + Cloudflare proxy + external Neon** part is the
only piece requiring the user's accounts (Cloudflare DNS, Render/Hetzner host,
separate Neon project) and cannot be executed from this environment.

---

## 5. Local verification (real staging-mode container)

Booted `deploy/docker-compose.staging.yml` and ran the verify script:

```
[PASS] GET /health -> 200
[PASS] database_connected is true
[PASS] GET /docs -> 404
[PASS] GET /openapi.json -> 404
[PASS] X-Content-Type-Options: nosniff
[PASS] X-Frame-Options: DENY
[PASS] Content-Security-Policy present
[PASS] Strict-Transport-Security present (staging)
[PASS] login returns 200
[PASS] auth cookie present
[PASS] auth cookie HttpOnly
[PASS] auth cookie SameSite=Lax
[PASS] auth cookie Secure
[SUCCESS] Staging ... verified ready.
```

---

## 6. What you must still do (needs your accounts)

1. **Create a separate Neon staging project** (never reuse the dev DB).
2. **Pick a Docker host** (Hetzner VPS / Render / Fly.io) and run:
   `docker compose -f deploy/docker-compose.staging.yml up -d --build`.
3. **Cloudflare**: add `staging-api` DNS (proxied), SSL/TLS **Full (strict)**,
   **Bot Fight Mode** + High security, HSTS, and a WAF rule (challenge
   `/api/v1/auth/*` > 10 req/min per IP).
4. Run `python scripts/verify_staging_health.py https://staging-api.varsitycompanion.co.za`
   after DNS propagation.

Full steps in `docs/STAGING_DEPLOYMENT.md`.

---

## 7. Branching & next steps

- Work on `week4/day4-staging` → PR into `develop` (no direct `main` pushes).
- Next: Week 4, Day 5 — Month-1 coherence review + adversarial live smoke
  tests + light load test (k6/locust).
