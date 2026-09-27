# Day 5 Implementation Blueprint — Structured Logging + POPIA Account Deletion + Coherence Pass

**Project:** Varsity Companion API
**Date:** 6 September 2026
**Source of truth for scope:** `plan/month_1/week_1.md` (Friday)
**Supersedes:** `day_5_design_briefing.md` (open questions) — decisions now resolved below.

---

## 1. Resolved Architecture Decisions

### 1.1 POPIA account deletion — *soft delete now, hard purge later*

Week‑1 baseline delivers a **soft delete** (revocable-in-DB, invisible-to-auth), not a destructive row wipe:

| Action | Detail |
|---|---|
| Endpoint | `DELETE /api/v1/auth/account` |
| AuthN | `get_current_user` (valid JWT) |
| Re‑authN | Require current password in body; wrong password → generic 401 |
| Effect | `is_active=False`, `deleted_at=now(utc)`, `hashed_password` overwritten with `DUMMY_HASH` (stops credential retention), clear auth cookie |
| Idempotence | Calling again while already deleted → same 200 (safe no‑op) |
| Rate limit | `5/minute` (brute‑force safe for the password confirm) |

**Why not hard DELETE:** the `users` model document (Day 3) already states immediate deletion "could destroy evidence needed for fraud/security work planned for Week 2." A soft tombstone preserves that evidence; a **scheduled hard purge** (not built this week) becomes the true POPIA erasure step and is documented as a follow‑up.

**PII note (honest limitation):** email/full_name are retained on the tombstone (email is also a `NOT NULL UNIQUE`) — full erasure requires the future purge job. Credentials (`hashed_password`) ARE scrubbed now.

### 1.2 Data model change (minimal, auditable)

Add one nullable column:

```
deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

Because no Alembic exists yet and `create_all` doesn't add columns to existing tables, the dev lifespan runs an **idempotent dev‑only DDL**:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
```

(Commented as DEVELOPMENT‑ONLY; production will use proper migrations.)

### 1.3 Structured logging

- New module `app/core/logging_config.py`:
  - `X-Correlation-ID` request header honoured; otherwise `uuid4()` generated.
  - Correlation ID stored in a `contextvars.ContextVar` so any downstream code can attach to logs.
  - **JSON Lines** formatter (one structured record per event) — parseable, no multiline injection.
  - **Redaction**: `Authorization`, `Cookie`, `X-Correlation-ID` value recall is fine; `password`, `access_token`, `hashed_password` are masked as `[REDACTED]`; request bodies are **never** logged.
  - `RotatingFileHandler` → `logs/app.log` (5 MB × 3 backups) + console handler for dev.
- Middleware in `app/main.py`:
  - Generate/propagate correlation ID; add `X-Correlation-ID` response header.
  - Log `method`, `path`, `status`, `duration_ms`, `client_ip`, `correlation_id` — nothing sensitive.
  - Log unhandled exceptions with the correlation ID (already partly present; unified).

### 1.4 Coherence pass (Mon→Thu as one flow)

- `deleted_at` must be excluded from responses and must make deleted users 401 everywhere (`get_current_user` already enforces `is_active`).
- Logout/delete cookie clearing shares the existing `_clear_access_token_cookie`.
- Ensure `ALTER ... IF NOT EXISTS` is safe against a fresh `create_all` (column would already exist from model).
- Confirm deleted users can never sign-in again (inactive check) or re-register with same email (unique constraint untouched).

---

## 2. File Map

| File | Change |
|---|---|
| `app/core/logging_config.py` | NEW — correlation ID contextvar, JSON redacting formatter, rotating/console handlers |
| `app/models/user.py` | ADD `deleted_at` column |
| `app/schemas/auth.py` | ADD `AccountDeleteRequest` (`password`) |
| `app/api/v1/auth.py` | ADD `DELETE /account`, import `AccountDeleteRequest`, reuse cookie clear |
| `app/main.py` | ADD logging middleware + correlation ID; extend lifespan with dev DDL + logs dir |
| `tests/test_logging_units.py` | NEW — formatter redaction/rotation unit tests |
| `tests/test_account_deletion_endpoints.py` | NEW — endpoint security tests |
| `plan/month_1/day_5/SETUP_DAY5.md` | THIS document |

---

## 3. Security Requirements Verified (acceptance)

- [ ] Deleted user cannot authenticate (`/me`, `/login` → 401 both).
- [ ] Wrong re‑auth password → generic 401, account NOT deleted.
- [ ] Cannot delete without authentication.
- [ ] Password/Auth headers never appear in log file.
- [ ] Correlation ID echoes in response + appears in log line for tracing.
- [ ] Idempotent re‑delete → 200.
- [ ] Rate limit trips at 6th deletion attempt/minute.
