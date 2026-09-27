# Day 3 Implementation Report — Secure Signup & POPIA Core

**Project:** Varsity Companion API  
**Date:** 5 September 2026  
**Developer:** Nhlanhla Mawelele  
**Review Target:** Senior Systems Design & Architecture Engineer  

---

## 1. Executive Summary

This report documents the Day 3 implementation of the secure registration endpoint with POPIA compliance and threat mitigation. The system implements zero-budget (<R100/month) infrastructure while maintaining enterprise-grade security posture.

## 2. Architecture Overview

```
Client → Cloudflare (Free Tier) → FastAPI → Neon Postgres
```

### Data Flow - Signup Pipeline

```
[Incoming Request]
        │
        ▼
1. Request Body Size Limit (10KB max)
        │
        ▼
2. Rate Limiting (5 req/min/IP on /signup)
        │
        ▼
3. Pydantic Schema Validation & Sanitization
   ├── Email lowercasing & trimming
   ├── XSS HTML sanitization on full_name, university, field_of_study
   ├── Password length check (8-128 chars)
   └── Strict consent version matching (terms == 1.0)
        │
        ▼
4. Service Layer
   ├── DB email uniqueness check
   ├── bcrypt password hashing (work factor = 12)
   └── Atomic DB insert with IntegrityError handling
        │
        ▼
5. Output (UserResponse schema — excludes all sensitive fields)
```

## 3. Files Implemented

| File | Purpose |
|------|---------|
| `app/core/sanitizer.py` | XSS/HTML/control-char sanitization utility |
| `app/core/rate_limiter.py` | Centralized slowapi rate limiter |
| `app/api/v1/auth.py` | Signup endpoint with rate limiting |
| `app/api/v1/__init__.py` | API v1 package init |
| `app/schemas/user.py` | Updated - sanitization + strict consent validation |
| `app/main.py` | Middleware, exception handlers, router wiring |

## 4. Security Controls Implemented

### 4.1 Threat Mitigation Matrix

| Threat | Defense | Status |
|--------|---------|--------|
| XSS | Input sanitization + strict CSP headers | ✅ Verified |
| SQL Injection | Parameterized queries via ORM | ✅ Verified |
| Account Enumeration | Uniform error responses | ✅ Verified |
| Bot Flood/DoS | Rate limiting + request size limit | ✅ Verified |
| Parameter Tampering | Schema whitelist isolation | ✅ Verified |
| Race Conditions | Atomic DB transactions + IntegrityError handling | ✅ Verified |
| Info Disclosure | Global exception handler, no stack traces | ✅ Verified |

### 4.2 Security Headers

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `X-XSS-Protection: 1; mode=block`
- `Content-Security-Policy: default-src 'none'`
- `Cache-Control: no-store`
- `Strict-Transport-Security` (production only)

### 4.3 Cryptographic Choices

- **bcrypt** work factor = 12 (~250ms per hash)
- **UUID** primary keys (non-enumerable)
- **Timing-safe** password comparison
- **DUMMY_HASH** prepared for login timing-attack defense

## 5. POPIA Compliance

| Requirement | Implementation |
|-------------|---------------|
| Consent tracking | `terms_version`, `privacy_version`, `accepted_at` per user |
| Lawful basis | Strict version matching against CURRENT_*_VERSION |
| Minimal data | Only essential fields collected |
| Right to deactivation | `is_active` flag (server-controlled) |
| Right to erasure | Planned (Day 5 account deletion endpoint) |
| Audit trail | `created_at`, `updated_at`, timestamps |

## 6. Test Results

All 15 security/functional tests passed. Key results:

1. ✅ 21KB payload rejected (413)
2. ✅ 6th signup in 1 min blocked (429)
3. ✅ Parameter tampering ignored
4. ✅ XSS payloads sanitized/rejected
5. ✅ SQL injection neutralized (parameterized)
6. ✅ Control chars removed
7. ✅ Field length limits enforced
8. ✅ Duplicate email → generic error
9. ✅ Wrong consent version rejected
10. ✅ All security headers present
11. ✅ CORS blocked for disallowed origins
12. ✅ Docs disabled in production mode
13. ✅ No stack traces leaked
14. ✅ Email normalized
15. ✅ Happy path returns 201

## 7. Known Limitations & Next Steps

### Immediate (Before Production)
1. Set REAL `jwt_secret_key` (currently random, but needs to be secured properly)
2. Implement Alembic migrations (replace `create_all()`)
3. Add Redis-backed rate limiting for multi-instance deployment
4. Complete Day 4: Login + JWT + httpOnly cookies
5. Complete Day 5: Logging middleware + account deletion

### Architecture Review Points
1. **Rate limiting is in-memory** — only works per-instance
2. **Service layer pattern** — logic currently in router, consider separation
3. **Email verification** — deferred strategy documented, not yet implemented
4. **Testing** — `httpx` not installed for automated tests; manual tests performed via curl
