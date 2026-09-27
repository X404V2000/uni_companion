# Staging Deployment Guide

> Week 4, Day 4 — step-by-step for bringing up the **staging** environment
> with production parity, then wiring Cloudflare WAF in front of it.
>
> Prerequisite: Day 2 (Docker) and Day 3 (config hardening) are complete.

---

## 1. What you need (accounts & credentials)

| Item | Purpose | Where |
| :--- | :--- | :--- |
| Docker host | Run the containers | Hetzner VPS, Render, Fly.io, or any Docker-capable box |
| **Staging** Neon Postgres | Separate DB from dev (never reuse `varsityCompanion_Db`) | Neon dashboard → create new project |
| Cloudflare account | DNS + WAF + TLS in front of the staging domain | Cloudflare dashboard |
| Domain (or subdomain) | `staging-api.varsitycompanion.co.za` | Your DNS registrar |

---

## 2. Staging secrets (never committed)

Create these values and export them into the deploy environment:

```bash
# Generate a fresh, strong staging JWT secret (>= 32 chars, 64 recommended)
export STAGING_JWT_SECRET_KEY="$(openssl rand -hex 32)"

# Staging Neon connection string — MUST use postgresql+psycopg://
export STAGING_DATABASE_URL='postgresql+psycopg://user:pass@host/varsity_companion_staging?sslmode=require'

# Optional: email + CORS for the staging frontend
export STAGING_EMAIL_API_KEY='re_...'   # or leave empty (emails no-op)
export STAGING_CORS_ORIGINS='https://staging-app.varsitycompanion.co.za'
```

> ⚠️ The boot guard (Day 3) **refuses to start** if `STAGING_JWT_SECRET_KEY`
> is < 32 chars or a known dev/CI/docker default.

---

## 3. Deploy the containers

```bash
docker compose -f deploy/docker-compose.staging.yml up -d --build
```

This:
- builds the multi-stage image (non-root `appuser`),
- runs `alembic upgrade head` (applies migrations 0001–0003),
- starts uvicorn **2 workers** under `ENVIRONMENT=staging`,
- binds to `127.0.0.1:8001` (NOT public — Cloudflare terminates TLS).

Verify locally:

```bash
curl -s http://127.0.0.1:8001/health
# {"database_connected":true,"status":"healthy"}
```

---

## 4. Wire up Cloudflare (DNS + WAF)

1. **Add DNS record** — `staging-api` → your Docker host's public IP, **Proxied** (orange cloud).
2. **SSL/TLS mode** → **Full (strict)**. This requires a valid cert on the
   origin (or Cloudflare Origin CA cert); Full (strict) prevents MITM.
3. **Security** → **Bot Fight Mode** on; **Security Level** `High`.
4. **HSTS** → enable with `max-age=31536000; includeSubDomains; preload`.
5. **WAF custom rule (API defense)**:
   - Target: hostname equals `staging-api.varsitycompanion.co.za` **and**
     URI path starts with `/api/v1/auth/`
   - Action: **Challenge** (or "Managed Challenge") when request rate
     exceeds **10 requests / minute per IP**.

> Note: we already enforce slowapi rate limits inside the app (e.g. login
> 5/min, health 120/min). Cloudflare is *defense-in-depth*: it stops
> credential-stuffing/DoS at the edge before it reaches the origin. Keep both.

---

## 5. Post-deploy verification

Once DNS propagates, run the smoke test:

```bash
python scripts/verify_staging_health.py https://staging-api.varsitycompanion.co.za
```

It checks: `/health` 200 + DB connected, `/docs` and `/openapi.json` → 404,
security headers (nosniff/DENY/CSP/HSTS), and auth cookie flags
(HttpOnly/SameSite=Lax/Secure). Exit 0 = staging is ready.

---

## 6. Rollback / teardown

```bash
docker compose -f deploy/docker-compose.staging.yml down   # stop containers
docker compose -f deploy/docker-compose.staging.yml down -v  # also drop the volume
```
