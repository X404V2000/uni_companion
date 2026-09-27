# Security Audit & Adversarial Testing Report — Weeks 1–2

**Project:** Varsity Companion API
**Date:** 7 September 2026
**Scope:** Full attack-surface review of every route + adversarial regression tests
**Result:** 1 vulnerability found & fixed; everything else verified safe. **85/85 tests passing.**

---

## 1. Attack Surface

7 HTTP routes + security middleware (correlation/access log, size guard, security headers, CORS) + RBAC + Alembic migration DB.

| Route | AuthN | AuthZ |
|---|---|---|
| `GET /` , `GET /health` | none | none |
| `POST /auth/signup` | none | rate-limit 5/min |
| `POST /auth/login` | none | rate-limit 5/min |
| `GET /auth/me` | JWT (cookie/Bearer) | self |
| `POST /auth/logout` | none | rate-limit 10/min |
| `DELETE /auth/account` | JWT + password re-auth | STUDENT+ADMIN |
| `POST /admin/purge-deleted-users` | JWT | ADMIN+SUPERUSER, 5/min |

---

## 2. Vulnerability Found & Fixed 🔴

### CVE-grade finding: Log-line & response-header injection via unsanitized `X-Correlation-ID`

**Impact:** The correlation middleware reflected the inbound `X-Correlation-ID` header verbatim into:
- the **response header**, and
- the **structured access log** (via `[%(correlation_id)s]`).

A value containing CR/LF (e.g. `x\r\nInjected-Header: evil`) could forge fake log lines (log injection) and, in lax serializers, inject HTTP response headers.

**Fix:** added `_sanitize_correlation_id()` — rejects any value containing control characters (CR/LF included), trims, enforces a 64-char max length, and falls back to a generated UUID otherwise. Regression test `test_crlf_correlation_id_does_not_inject` added.

---

## 3. Verified Safe (no changes needed)

| Area | Finding |
|---|---|
| **JWT algorithm confusion** | `alg=none` rejected (`InvalidAlgorithmError`); wrong-key HS256 rejected. `algorithms=[HS256]` hard-pinned. |
| **Mass assignment** | signup body cannot set `role`, `is_active`, `hashed_password`, `deleted_at`, `id` (Pydantic whitelist + server-set fields). Attempted `role=superuser` → persisted as `student`. |
| **bcrypt truncation** | 72-byte password accepted; 73-byte rejected (no silent truncation). |
| **Email validation** | control chars, HTML, and whitespace emails rejected (422, JSON response). |
| **Enumeration via timing** | unknown-email login runs DUMMY_HASH bcrypt path (pre-existing). |
| **Enumeration via response** | uniform 401/403 messages; no role detail leaked in 403. |
| **IDOR / cross-account** | `DELETE /account` and `/me` operate strictly on the authenticated user. |
| **RBAC** | STUDENT blocked (403) from purge; ADMIN/SUPERUSER allowed. |
| **Rate-limit spoofing** | limiter keys on `request.client.host` (direct peer), NOT `X-Forwarded-For` → no XFF-spoof bypass. |
| **Cookie hardening** | HttpOnly + SameSite=Lax; Secure in prod; cleared on logout/delete. |

---

## 4. Residual Risks (documented, not code-blocking)

| Risk | Severity | Note |
|---|---|---|
| **Chunked/no-Content-Length body** bypasses the 10 KB middleware (which only inspects the `content-length` header) | Low | Mitigated downstream by Pydantic `max_length` constraints, but the body is still read into memory first. Recommend `uvicorn --limit-max-request-size` as defense-in-depth (prod). |
| **Slowapi in-memory counters** | Low | Single-instance only; `redis_url` config exists for horizontal scaling (already delivered). |
| **Email reflected in 422 validation errors** | Info | Pydantic echoes user input in JSON error detail; harmless (JSON, non-rendered) but worth noting for log hygiene. |
| **`/docs`, `/openapi.json` exposed in development** | Info | Acceptable for dev; disabled by `environment=production`. |

---

## 5. New Regression Tests

`tests/test_security_hardening.py` (6 tests): mass-assignment, correlation-ID injection, password byte boundary, email validation, alg=none, wrong-key.

**Totals:** 79 → **85 passing**, zero regressions.

---

*Audit performed adversarially; the single actionable hole was fixed and locked in with a test before declaring testing complete.*
