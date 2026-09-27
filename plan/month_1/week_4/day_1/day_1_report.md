# Week 4, Day 1 — GitHub Actions CI/CD Pipeline

**Project:** Varsity Companion API
**Date:** 6 September 2026
**Branch:** `week4/day1-cicd` (off `develop`)
**Status:** ✅ Complete — awaiting PR into `develop`

---

## 1. Objective

Automate quality enforcement so the growing codebase cannot regress silently:

- Run the **full pytest suite** on every push / PR to `main` and `develop`.
- Provision a **real PostgreSQL 15** service container (no mocks).
- Verify **`alembic upgrade head`** applies cleanly before tests run.
- Enforce **ruff** linting with **zero tolerance** (build fails on any issue).

---

## 2. Deliverables

| File | Action | Notes |
| :--- | :--- | :--- |
| `.github/workflows/ci.yml` | **NEW** | Postgres 15 service → install → ruff → alembic → pytest |
| `pyproject.toml` | **NEW** | Ruff config (strict) + import sorting; no pytest ini section |
| `requirements-dev.txt` | **UPDATED** | Added pinned `ruff==0.7.4`, `pytest-cov==6.0.0` |
| `app/core/config.py` | **UPDATED** | New `testing` environment + derived security-mode properties |
| `tests/conftest.py` | **UPDATED** | Honours explicit `TEST_DATABASE_URL`; keeps `_test` safety guard |
| `tests/test_auth_endpoints.py` | **UPDATED** | Environment-aware cookie assertions + 3 new mode-contract tests |
| 25 source/test files | **UPDATED** | Ruff auto-fixes (import order, whitespace, `timezone.utc`→`UTC`) |

---

## 3. CI Workflow

`.github/workflows/ci.yml` runs on push/PR to `main` + `develop`:

1. **Service container** — `postgres:15-alpine`, with an `pg_isready` health
   check so the job waits for readiness.
2. **Python 3.13** with pip caching.
3. **Install** `requirements.txt` + `requirements-dev.txt` (pinned).
4. **Lint** — `ruff check app/ tests/` (fails the build on any violation).
5. **Migrate** — `alembic upgrade head` against the container DB.
6. **Test** — `pytest -q`.

Pinned env in CI: `ENVIRONMENT=testing`, `TEST_DATABASE_URL` pointing at the
container, `JWT_SECRET_KEY`, and `LOG_TO_FILE=false` (no writable log volume).

---

## 4. Deviations from the Blueprint (deliberate, safer)

| Blueprint | Implementation | Why |
| :--- | :--- | :--- |
| Python **3.11** | Python **3.13** | Matches the actual dev/deploy runtime; avoids CI-vs-prod drift. |
| DB `varsity_companion_ci_test` | `varsity_companion_test` | Must equal the project's canonical test DB name so the conftest `_test` safety guard and local runs are byte-for-byte identical. |
| Lint select `["E","F","W","I"]` | `["E","F","W","I","B","UP","S"]` | User chose **strict** enforcement; this is a safe superset adding bugbear, pyupgrade and bandit (security). |
| Bare `pip install ruff pytest pytest-cov` | Pinned `requirements-dev.txt` | Reproducible builds; a floating ruff/linter version can break CI without any code change. |

---

## 5. Security/risk layers patched in (per standing instruction)

The blueprint asked only for a CI file. While wiring it, the following
risk layers were found and closed:

1. **`ENVIRONMENT=testing` would have crashed the app on boot.** The
   `environment` field was `Literal["development","production"]`, so the
   blueprint's own CI env value was invalid → startup failure. Added
   `"testing"` to the Literal.

2. **`TEST_DATABASE_URL` was silently ignored.** `conftest._test_database_url()`
   always derived the Neon test URL, so CI would have hit an unreachable
   database. Now an explicit `TEST_DATABASE_URL` wins, **while still enforcing
   the `_test` suffix guard** (a misconfigured URL can never point tests at
   production).

3. **Secure cookies broke cookie-auth in CI (found by simulating CI locally).**
   Forcing `Secure` for non-local modes made the plain-HTTP test client stop
   sending the auth cookie → every authenticated test 401'd. Resolved with an
   explicit, documented split:
   - `cookie_secure` → **production only** (Secure cookies are only ever sent
     over HTTPS).
   - `is_hardened` → production **and** testing (docs off, verbose errors
     suppressed).
   - `docs_enabled` → development only.
   Three new `TestEnvironmentModeContract` tests pin this mapping so it can
   never silently regress.

4. **A weak security test was tightened.** `test_wrong_key_rejected` used
   `try/except Exception: pass`, which would pass even on an unrelated error.
   Now asserts the specific `jwt.PyJWTError`.

5. **B904 exception chaining** fixed across `auth.py` / `academic.py` / `deps.py`
   (`raise ... from exc` / `from None`) so internal errors can't leak via
   chained tracebacks, and log noise is reduced.

---

## 6. Verification

| Check | Result |
| :--- | :--- |
| `ruff check app/ tests/` | **All checks passed** (168 violations → 0) |
| Full suite, `development` | **124 passed** (13m 04s) |
| Full suite, `ENVIRONMENT=testing` | **124 passed** (CI configuration) |
| App boots under `ENVIRONMENT=testing` | ✅ docs disabled, hardened |
| `.env` / env-var precedence | Shell env wins; `.env` has no `ENVIRONMENT` key |
| `alembic upgrade head` in CI | Uses `DATABASE_URL` (no hardcoded URL; fallback only) |

Test suite growth: 121 → **124** (3 new environment-mode contract tests).

---

## 7. Branching discipline

- `main` — protected; **no direct pushes**.
- `develop` — integration branch; PRs land here.
- `week4/day1-cicd` — this day's work; PR opens into `develop`.

CI is configured to gate both `main` and `develop`, so a red pipeline blocks
the merge.

---

## 8. Next

- Push `week4/day1-cicd` and open the PR into `develop` (needs remote auth).
- Week 4, Day 2: Docker containerisation.
