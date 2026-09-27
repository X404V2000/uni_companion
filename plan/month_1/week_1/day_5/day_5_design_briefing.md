# Day 5 Design Briefing — For System Design & Architecture Engineer

**Project:** Varsity Companion API
**Date:** 6 September 2026
**Author:** Nhlanhla Mawelele
**Audience:** System Design & Architecture Engineer
**Status:** Needs design review before implementation

---

## 1. Where we are

**Completed through Thursday (Day 4), verified, tracking clean.**

| Day | Scope | State |
|---|---|---|
| Mon | Project skeleton, `.env`, Neon via SQLAlchemy | ✅ |
| Tue | User model + Pydantic schemas (consent fields) | ✅ |
| Wed | Secure signup + bcrypt + POPIA consent + rate limiting | ✅ |
| Thu | Login, JWT (HS256) via httpOnly cookie, `/me`, logout, rate limiting, test isolation | ✅ verified live |

**Key numbers / evidence**
- 49 automated tests passing (18 unit + 31 endpoint) against dedicated `varsity_companion_test` DB.
- 41/41 live checks passed against development DB (browser cookie flow, api-mode bearer, strict `X-Auth-Mode` casing, tampered/expired/inactive tokens, 429 rate limit, headers, 413).
- Post-verification, **all** `users` rows in the dev DB were deleted (17 → 0); schema preserved.
- Dev DB currently points at Neon `varsityCompanion_Db`; no migration tool yet (uses `create_all`, dev-only).
- Detailed verified scope: `plan/month_1/day_4/day_4_report.md`.

**Architecture today**
Client → FastAPI (`app/main.py`, middleware: size limit 10 KB, security headers, CORS) → SQLAlchemy
Endpoints: `POST /api/v1/auth/signup`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`.

---

## 2. What Day 5 (Friday) needs — per `plan/month_1/week_1.md`

1. **Structured logging middleware**
   - Request correlation IDs.
   - Sensitive-field redaction (passwords, tokens, auth headers, email?).
   - Rotating log files.
2. **Basic account deletion endpoint** — the POPIA right-to-delete baseline.
3. **Coherence pass** — make Mon→Thu pieces behave as one flow.

---

## 3. Open design questions for you

**Please decide/target these** — intentionally left open, **no team default pre-selected**:

### A. Account-deletion model
We deferred this. Options you may weigh and specify:
- Soft deletion (immutable flag + revocation via existing `get_current_user` live-active check) vs. immediate hard DELETE vs. soft-with-scheduled-hard-purge.
- Consider: UUID FK surface (currently only `users` used), POPIA erasure obligation vs. evidence retention for abuse/fraud reviews, and whether an **audit/consent log** must be introduced so deletion can still be proven.

### B. Data model change
Would `is_deleted/deleted_at` (distinct from `is_active`) be required? If added, what's the migration story **since no Alembic exists yet** for `users`?

### C. Endpoint + auth shape for deletion
- `DELETE /api/v1/auth/account` authenticated? Re-authentication/password confirm required before destructive action?
- Response semantics for idempotency + POPIA acknowledgement.

### D. Logging integration
- Middleware vs. logging in endpoint layer? Where to put correlation ID (response header?).
- Rotation strategy + file path lifecycle (does Neon/prod have a writable volume?), and whether to route via stdlib `logging` with a formatter or a dedicated JSON logger. Redaction boundary (emails sensitive?).

---

## 4. What I need back from you

A short design decision note recommending:
1. Deletion model & DB column/migration plan (or explicit "no schema change, mark inactive" decision).
2. Logging architecture + rotation + redaction policy.
3. Ordered implementation and test plan for Day 5, with any blocker/risk callouts.

---

*This is a planning/design artifact only — no Day-5 code written yet.*
