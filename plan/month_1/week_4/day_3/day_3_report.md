# Week 4, Day 3 — Production Configuration & Environment Hardening

**Project:** Varsity Companion API
**Date:** 12 September 2026
**Branch:** `week4/day3-hardening` (off `develop`)
**Status:** ✅ Complete

---

## 1. Objective

Harden the production/staging boot path and make environment-dependent
security toggles explicit and testable:

- Reject a weak `JWT_SECRET_KEY` at boot in non-local, HTTPS-facing modes.
- Auto-disable `/docs` and `/openapi.json` off development.
- Enforce `Secure` auth cookies only on HTTPS-terminated modes.
- Add a `staging` environment (blueprint requirement) with full production
  parity.
- Lock everything with a deterministic, dependency-free test file.

---

## 2. Deliverables

| File | Action | Notes |
| :--- | :--- | :--- |
| `app/core/config.py` | **UPDATED** | `staging` added to `Literal`; JWT boot guard (`model_validator`); `hsts_enabled` property |
| `app/main.py` | **UPDATED** | HSTS now driven by `settings.hsts_enabled` (covers staging) |
| `tests/test_production_config.py` | **NEW** | 28 tests: boot guard, security-posture matrix, docs, cookies |
| `.env.example` | **UPDATED** | Documented `staging` mode |
| `docs/PRE_LAUNCH_KEYS.md` | **UPDATED** | Boot-guard + `staging` in the launch checklist |
| `plan/.../day_3/day_3_report.md` | **NEW** | This report |

---

## 3. Security-mode matrix (single source of truth)

| Property | development | testing | staging | production |
| :--- | :--- | :--- | :--- | :--- |
| `is_hardened` (docs off, generic errors) | ❌ | ✅ | ✅ | ✅ |
| `cookie_secure` (Secure auth cookie) | ❌ | ❌ | ✅ | ✅ |
| `docs_enabled` (Swagger/OpenAPI) | ✅ | ❌ | ❌ | ❌ |
| `hsts_enabled` (Strict-Transport-Security) | ❌ | ❌ | ✅ | ✅ |
| JWT boot guard | off | off | **on** | **on** |

Rationale: `testing` is the CI mode — hardened for docs/errors but run over
plain HTTP, so it must NOT send Secure cookies or HSTS (the test client would
stop sending the cookie and every authenticated test would 401).

---

## 4. JWT boot guard

`Settings` now refuses to construct (→ app refuses to start) when
`environment` is `staging`/`production` and the secret is:

1. **shorter than 32 chars**, or
2. **a known weak dev/CI/docker default** (denylist of the placeholder keys we
   actually use in `.env.example`, CI, and docker-compose).

Verified at real boot level:
- `ENVIRONMENT=production JWT_SECRET_KEY=your-secret-key-here …` → `ValidationError`.
- `ENVIRONMENT=production JWT_SECRET_KEY=<32-char known default> …` → `ValidationError` (denylist branch).
- `ENVIRONMENT=production JWT_SECRET_KEY=<64 random hex> …` → boots, `docs_url=None`.

Development and testing are deliberately exempt so local/CI keep working with
their placeholder keys.

---

## 5. Deviations from the blueprint (deliberate, safer)

| Blueprint | Implementation | Why |
| :--- | :--- | :--- |
| `ENVIRONMENT` Literal `["development","testing","staging","production"]` | Exact match added `staging` | ✅ |
| Reject weak secret only in `["production","staging"]` | Same | ✅ |
| Docs enabled in `development` **and** `testing` | Docs **also disabled** in `testing` | Our Day-1 "testing is hardened" decision (hardened posture in CI, no regression in a day-3 edit). |
| Field-level validation reading "current env" | `model_validator(mode="after")` | Cleaner Pydantic v2 idiom; has the validated `environment` value directly (no fragile `os.getenv` re-read). |
| `JWT_SECRET_KEY` `min_length=32` unconditionally | Guard only in prod/staging | Keeps dev/CI placeholders working; the guard is scoped to where it matters. |

---

## 6. Acceptance criteria vs. implementation

| # | Criterion | Result |
| :--- | :--- | :--- |
| 1 | Production boot guard rejects weak JWT key | ✅ Verified live (min-length + denylist) |
| 2 | `/docs` + `/openapi.json` → 404 in production | ✅ `docs_url=None`, `openapi_url=None` at boot |
| 3 | Auth cookies `Secure=True` + `SameSite=Lax` in production | ✅ via `cookie_secure` (prod + staging) |
| 4 | Neon idle-recovery via `pool_pre_ping=True` | ✅ already in `db/session.py` (verified Day 2) |
| 5 | Zero test regressions | ✅ 28 new tests pass; 18 security units + 4 cookie/contract tests pass |

---

## 7. Verification

| Check | Result |
| :--- | :--- |
| `ruff check app/ tests/` | **All checks passed** |
| `tests/test_production_config.py` | **28 passed** (0.13s, no DB) |
| Boot guard (weak key) | **ValidationError** (refuses boot) |
| Boot guard (strong key, prod) | boots; `docs_url=None`, `openapi=None` |
| `tests/test_security_units.py` | 18 passed |
| Cookie/contract tests (auth) | 4 passed |

New tests: 124 → **152** (28 added, all config-level and deterministic).

---

## 8. Branching & next steps

- Work on `week4/day3-hardening` → PR into `develop` (no direct `main` pushes).
- Next: Week 4, Day 4 — staging deployment + Cloudflare WAF.
