# Day 5 Implementation & Live-Verification Report — Structured Logging + POPIA Account Deletion + Coherence Pass

**Project:** Varsity Companion API
**Date:** 6 September 2026
**Developer:** Nhlanhla Mawelele
**Scope:** `plan/month_1/week_1.md` (Friday)
**Design blueprint:** `plan/month_1/day_5/SETUP_DAY5.md`

---

## 1. Executive Summary

Day 5 closes Week 1's Friday scope with three deliverables:

1. **Structured logging** — correlation IDs propagated across requests, redacted credential output, UTC timestamps, rotating file logs.
2. **POPIA account deletion baseline** — `DELETE /api/v1/auth/account` soft-deletes the caller after password re-authentication, immediately revoking access and scrubbing the stored credential.
3. **Coherence pass** — Mon→Thu pieces now behave as one flow: deleted/inactive users rejected everywhere, cookie clearing shared with logout, `deleted_at` column safely introduced.

Automated tests grew from 49 → **62 passing**; live verification against the development DB passed **12/12**; a redaction gap found during live verification was closed and regression-tested.

---

## 2. Deliverables

| File | Change |
|---|---|
| `app/core/logging_config.py` | Correlation-ID contextvar, PII-redacting formatter, rotating file handler (5 MB × 5) |
| `app/main.py` | `correlation_middleware` (propagate/emit access log, `X-Correlation-ID` response header), safe error-log summary, dev DDL for `deleted_at` |
| `app/models/user.py` | Added nullable `deleted_at` soft-delete tombstone |
| `app/schemas/auth.py` | Added `AccountDeleteRequest` (password + bcrypt 72-byte guard) |
| `app/api/v1/auth.py` | `DELETE /api/v1/auth/account` (re-authN → soft delete → scrub credential → clear cookie) |
| `app/core/rate_limiter.py` | Global `100/minute` default (coherence with per-route 5/min) |
| `tests/conftest.py` | `deleted_at` DDL mirrored into the test DB (non-destructive) |
| `tests/test_logging_units.py` | 8 tests: redaction, correlation ID, rotation, exception-log leak guard |
| `tests/test_account_deletion_endpoints.py` | 6 endpoint security tests |
| `.gitignore` | `logs/` added (never commit structured runtime logs) |

---

## 3. Account Deletion Semantics (POPIA baseline)

| Aspect | Behaviour | Verified |
|---|---|---|
| Authentication | `get_current_user` valid JWT required | ✅ 401 otherwise |
| Re-authentication | Current password required; wrong → generic 401, nothing changes | ✅ live `12/12` |
| Effect | `is_active=False`, `deleted_at=now(utc)`, `hashed_password=DUMMY_HASH`, auth cookie cleared | ✅ |
| Post-deletion access | `/me` → 401; login → 401 (generic) | ✅ live |
| Idempotency nuance | Deleted account can no longer authenticate, so repeat calls are 401 by design (documented) | ✅ |
| Rate limit | `5/minute` | ✅ suite |

**Deliberate choice:** soft-delete now (preserves abuse/security evidence per Day-3 model comment), with a scheduled hard-purge documented as the Week-2 true-erasure step. Full PII erasure of `email/full_name` is deferred to that purge; the credential hash is scrubbed immediately.

---

## 4. Structured Logging

- **Correlation IDs**: inbound `X-Correlation-ID` honoured, else UUID generated; echoed on every response; attached to every access + error line.
- **Access log shape**: `method path status duration_ms client_ip` inside `[correlation-id]` — no query strings, no bodies.
- **Redaction**: `password`, `token`, `access_token`, `authorization`, `cookie`, `secret`, `jwt_secret_key` + `Bearer <token>` masked as `[REDACTED]` across JSON/`k=v`/`k:v` forms.
- **Rotation**: `logs/app.log`, 5 MB × 5 backups; `logs/` is gitignored.

Live log evidence: correlation id appeared on **6** request lines; leak scan for password/user-id/`[SQL:`/`Traceback` returned **empty**.

---

## 5. Defects Found & Fixed During Verification

1. **Redaction gap** — original redacter did not catch `password="value"` (quoted-after-equals) format. Fixed with expanded patterns; regression tests added (7/7 → 8/8).
2. **Exception-log leak** — the unhandled-error logger embedded `str(exc)` (+ `exc_info`), which could carry bound SQL parameters into the log. Fixed to log only `type(exc).__name__` + path + correlation id; new `test_error_log_contains_only_type_name` guards it.
3. **Column-not-in-test-DB** — `create_all` can't add columns; `deleted_at` DDL mirrored into the test fixture (non-destructive `ADD COLUMN IF NOT EXISTS`).

---

## 6. Test Totals

| Suite | Count | Result |
|---|---|---|
| Unit (`security` + `logging`) | 18 + 8 = 26 | ✅ |
| Endpoint (`auth` + `deletion`) | 31 + 6 = 37 | ✅ |
| **Total** | **62** | ✅ |

Live verification: **12/12** passed on `varsityCompanion_Db`; post-run all 5 test rows purged (table back to 0, schema intact).

---

## 7. Day 6+ Notes / Follow-ups

- **Hard purge job** (Week 2): scheduled removal of soft-deleted tombstones for true POPIA erasure of residual PII.
- **Alembic migrations**: replace the dev `ALTER TABLE ... IF NOT EXISTS` approach with versioned migrations.
- **Centralised log shipping**: rotating file handler is single-node; multi-instance deployment should stream JSON logs to a collector.
- **Rate limiter storage**: currently in-memory (single instance); Redis backend when scaling horizontally.

---

*Report written after a full live lifecycle run; all test rows purged post-verification.*
