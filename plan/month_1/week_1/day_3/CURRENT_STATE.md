# Current State — Week 1 Complete (Days 1–5)

**Last Updated:** 6 September 2026

---

## Overview

Week 1 (Mon–Fri) is **complete, tested, and live-verified**:

- **Day 1 (Mon)** — Project foundation + DB connection ✅
- **Day 2 (Tue)** — User data model + schemas ✅
- **Day 3 (Wed)** — Secure signup + POPIA core ✅ (see `day_3_report.md`)
- **Day 4 (Thu)** — Login, JWT, httpOnly cookie, `/me`, rate limiting ✅ (see `../day_4/day_4_report.md`)
- **Day 5 (Fri)** — Structured logging + POPIA account deletion + coherence pass ✅ (see `../day_5/day_5_report.md`)

The remainder of this document is the historical Day-3→Day-4 snapshot; the section below was accurate at that time.

---

## ✅ What Is DONE & WORKING

### Day 3 — Complete

| Component | File | Status |
|-----------|------|--------|
| XSS Sanitizer | `app/core/sanitizer.py` | ✅ Working |
| Shared Rate Limiter | `app/core/rate_limiter.py` | ✅ Working |
| Signup endpoint | `app/api/v1/auth.py` | ✅ Working (201 Created) |
| User schemas | `app/schemas/user.py` | ✅ Sanitized + version validated |
| Main app wiring | `app/main.py` | ✅ Middleware, routers, exception handling |
| .env config | `.env` | ✅ DATABASE_URL, environment=development, JWT secret set |
| Requirements | `requirements.txt` | ✅ bcrypt + PyJWT + psycopg[binary]=3.3.5 |
| DB Schema | Neon Postgres | ✅ users table with all columns |

---

## 🔄 WHAT IS IN PROGRESS (Day 4 - Login & JWT)

### Partially Built

| Component | File | Status |
|-----------|------|--------|
| JWT functions | `app/core/security.py` | 🔄 Drafted — NOT verified/imported yet |
| Login schemas | `app/schemas/auth.py` | ✅ Created (LoginRequest, TokenResponse) |
| Schemas __init__ | `app/schemas/__init__.py` | ✅ Updated to export auth schemas |
| Auth deps | `app/api/deps.py` | ✅ Created (get_current_user) — NOT TESTED |

---

## ❌ WHAT IS STILL LEFT TO BUILD (Day 4)

### 1. Login Route (`app/api/v1/auth.py`)

Add `POST /api/v1/auth/login` with:

- [ ] Verify password with `verify_password()` + timing attack via `DUMMY_HASH`
- [ ] Rate limit 5 req/min per IP
- [ ] Set HttpOnly cookie with JWT
- [ ] Cookie settings:
      - `httponly: True`
      - `secure: True` in production only (False in dev/HTTP)
      - `samesite: "lax"`
      - `path: /`
- [ ] Return `UserResponse` (no token in body for browser)
- [ ] Support header-based Bearer token for API/mobile clients

### 2. Update `app/core/security.py` with JWT functions

- [ ] `create_access_token(subject, expires_delta)`
- [ ] `decode_token(token)`
- [ ] Test both functions work with settings from .env

### 3. Protected Route Tests

- [ ] Add a `/api/v1/auth/me` endpoint that returns current user
- [ ] Test cookie-based auth flow (login → get
 /me with cookie)
- [ ] Test header-based auth flow
- [ ] Test invalid/expired/tampered token → 401
- [ ] Test deactivated user → 401

### 4. Clean up / Final Review Items

- [ ] Add `httpx` only for testing (not production deps)
- [ ] Verify `app/api/deps.py` imports correctly
- [ ] Run full integration test suite after login is added
- [ ] Update requirements.txt if needed

---

## 📋 Files to Reference

- **Day 3 Blueprint:** `plan/month_1/day_3/security_architecture_and_implementation_blueprint.md`
- **Day 4 Blueprint:** `plan/month_1/SETUP_DAY4.md`
- **Test Report:** `plan/month_1/day_3/IMPLEMENTATION_REPORT.md` (created from test results)

---

## 🔒 Security Notes for Implementation

1. **Timing attack defense:** When email not found in login, run `verify_password(input_pwd, DUMMY_HASH)` before returningerror.
2. **Token claims:** JWT contains ONLY `sub: user_id`. No email/PII in token.
3. **Cookie secure flag:** `secure=True` IF `environment == "production"`, else `False` (for local dev on HTTP).
4. **UserResponse validation:** After login, respond with `UserResponse` schema — doesn't include hashed_password or any consent metadata.
5. **Duplication:** Don't break existing signup during this work.


---

## 🧪 API Endpoints Currently Working

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | No | Root health check |
| GET | `/health` | No | DB connectivity check |
| POST | `/api/v1/auth/signup` | No | Registration (201) |
