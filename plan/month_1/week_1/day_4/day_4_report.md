# Day 4 Implementation & Live-Verification Report — Secure Login, JWT & Session Lifecycle

**Project:** Varsity Companion API  
**Date:** 6 September 2026  
**Developer:** Nhlanhla Mawelele  
**Nature of work:** Cohesive Day-4 completion (auth) + a security-first hardening pass + live verification + cleanup

---

## 1. Executive Summary

Day 4 delivers the complete authentication lifecycle on top of the secure Day 3 signup:

1. `POST /api/v1/auth/login` authenticates credentials and issues a short-lived **HS256 JWT** delivered through an **HttpOnly, SameSite=Lax** cookie.
2. Browser clients never receive a raw token in the body; **mobile/API clients** opt into bearer-token delivery with the exact header `X-Auth-Mode: api`.
3. `GET /api/v1/auth/me` protects an authenticated profile route through a reusable dependency (`get_current_user`) that validates signature, expiry, DB existence, and live `is_active`.
4. `POST /api/v1/auth/logout` provides an idempotent sign-out that expires the cookie with identical path/attributes.

A **security-first hardening pass** (commit `63d8d9f`) tightened several behaviours beyond the baseline blueprint, and a **live verification run against the actual development database executed 41/41 checks successfully**. After verification every user-details row in the development `users` table was removed (user-approved) so Day 5 starts from an empty table while the schema remains intact.

---

## 2. Verified Security Posture (Live, HTTP 127.0.0.1:8000)

| Attack / concern | Live control | Result |
|---|---|---|
| Brute force credential stuffing | `slowapi` — 5 login attempts/min/IP | ✅ 6th attempt returned **429** |
| Username / account enumeration | Uniform generic `401 "Invalid email or password."` for unknown email, wrong password, inactive, corrupt hash | ✅ all indistinguishable payloads |
| Timing side-channel for unknown accounts | bcrypt compare against `DUMMY_HASH` when email absent | ✅ same path used for corrupt/stale rows |
| XSS / client-side token theft | JWT only inside **HttpOnly** cookie for browsers | ✅ raw token absent from browser login body |
| CSRF | `SameSite=Lax` on auth cookie; CORS allow-list | ✅ `SameSite=lax` observed in Set-Cookie |
| Token exfiltration via response body | Raw token only after **exact** `X-Auth-Mode: api` | ✅ `API` casing does **not** leak a token |
| Token tampering | HMAC signature verification on every `/me` | ✅ mid-signature tamper → 401 |
| Stale / expired session | `exp` checked on decode; DB `is_active` re-checked on **every** request | ✅ expired token → 401; deactivated user stale token → 401 |
| Session linger on shared machines | logout expires cookie with `Max-Age=0` | ✅ `/me` after logout → 401 |
| DoS via oversized body | 10 KB request-body middleware | ✅ oversized body → 413 |
| Malformed Content-Length | middleware no longer raises (returns 400) | ✅ covered by autotests |
| Sensitive response caching | `Cache-Control: no-store` on auth responses | ✅ header present |
| Info disclosure on 500 | global handler + correlation ID | ✅ no `Traceback` in output under tests |

Cookie attributes observed during live login (`development`):  
`access_token="Bearer …"; HttpOnly; Max-Age=900; Path=/; SameSite=lax` — **Secure flag intentionally off in development for local HTTP** and toggles on automatically only in `environment=production` (verified by automated `TestCookieSecureFlagProduction`).

---

## 3. Deliverables & Files Produced/Modified (Day 4)

| File | Role |
|---|---|
| `app/core/security.py` | bcrypt hashing/verify, explicit `iat`+`exp`+`sub` HS256 JWT, `DUMMY_HASH` |
| `app/schemas/auth.py` | `LoginRequest` (normalized email, byte-limited password), `TokenResponse` |
| `app/api/deps.py` | `get_current_user` — cookie-first, header-fallback; signature/expiry/active verification |
| `app/api/v1/auth.py` | `login`, `/me`, optional raw-token API mode, strict `X-Auth-Mode`, corrupt-hash fallback, `logout` cookie clearing |
| `app/core/config.py` | require JWT secret; literal environment; cookie/security toggles |
| `app/main.py` | security headers, request-size guard (safe on malformed Content-Length), CORS allow-list |
| `scripts/setup_test_db.py` | one-time dedicated `*_test` DB provisioning |
| `tests/conftest.py` | dedicated `varsity_companion_test` isolation (non-destructive `create_all`, dep-override of `get_db`) |
| `tests/test_security_units.py` | pure JWT/password/byte-boundary unit tests |
| `tests/test_auth_endpoints.py` | 31 endpoint security tests incl. strict header, logout, corrupt-row, Secure-in-production |

Test totals: **18 unit + 31 endpoint = 49 passing** on the isolated database before live runs.

---

## 4. Live Verification Log (Highlights)

Executed against **development** `varsityCompanion_Db` through Uvicorn. All **41 checks PASSED**:

- Browser happy-path: signup 201 → login 200 (no raw token body) → Set-Cookie carried `HttpOnly`, `Max-Age=900`, `Path=/`, `SameSite=lax` → `/me` 200 → logout `Max-Age=0` → `/me` 401.
- API mode: exact lowercase `api` header → raw JWT body with `token_type=Bearer` → `Authorization`-header `/me` 200.
- Strict casing: `X-Auth-Mode: API` still logs in (200) but the body contains **no** `access_token` — a fail-safe for accidental casing/reference mismatches.
- Adversarial: wrong password, unknown email, expired token, mid-signature-tampered token, no token, deactivated account, stale token for a deactivated user — all uniformly return 401.
- Brute force cap: 6th login in a single minute → **429** (message `Rate limit exceeded: 5 per 1 minute`).
- Headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cache-Control: no-store` present on auth responses; oversized request → 413.

### Notable defect found & confirmed NOT a bug
An initial "tamper" probe flipped the **final base64-padding character** of the JWT signature, which can decode to the same digest → still 200. This is not a signature weakness: a mid-signature character change (genuine tampering) was correctly rejected with 401. Total JWT hardening therefore relies on proper verification, not on the irrelevant trailing-bit behaviour.

---

## 5. Post-Verification Cleanup (User-Approved Destructive Step)

Per explicit instruction, after the full live pass, **all** user rows were deleted from the **development** `users` table:

| Metric | Value |
|---|---|
| Target database | `varsityCompanion_Db` |
| Rows before cleanup | **17** (12 pre-existing older test rows + 5 created by the two live passes) |
| Rows after cleanup | **0** |
| Table / schema preserved | ✅ `public.users` still exists and is intact for Day 5 |

Cleanup used `DELETE FROM users` inside a single committed transaction (table/constraints preserved; UUID primary key unaffected).

---

## 6. Outstanding Notes / Next Steps (Day 5)

- **Refresh tokens** intentionally deferred in this session (stated scope).
- Immediate server-side session revocation for active JWTs relies on account deactivation + 15-minute TTL; a token denylist/refresh architecture belongs to Day 5 planning.
- The existing dev/staging seed data was wiped as requested; Day 5 should define controlled sample-data seeding if the UI needs demo accounts.
- Production cookie `Secure` and HSTS must be reconfirmed once Cloudflare/HTTPS is wired and `environment=production`.

---

*Report written after a live, full lifecycle run against the development database; all rows purged post-verification.*
