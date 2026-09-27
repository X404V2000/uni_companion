# Varsity Companion API — Offshore Client Contract (v1.0.0)

> **Audience:** Flutter/Dart (Dio + Drift) client team.
> **Companion artifact:** `docs/openapi.json` — the machine-readable OpenAPI 3.1
> contract for codegen. This document explains the *semantics* that codegen
> cannot convey.
> **Regenerate the schema with:** `python scripts/export_openapi.py`

---

## 1. Base URLs & environment toggles

| Environment | Base URL | Notes |
| :--- | :--- | :--- |
| Local development | `http://127.0.0.1:8000` | `/docs` + `/openapi.json` are **enabled** |
| Staging | `https://staging-api.varsitycompanion.co.za` | docs disabled (hardened) |
| Production | (set at launch) | docs disabled (hardened) |

In staging/production the interactive docs are intentionally removed; the
**frozen `docs/openapi.json`** is the source of truth for codegen.

---

## 2. Authentication — mandatory for the mobile client

### 2.1 Header-name casing is STRICT
The `X-Auth-Mode` header value is matched **exactly** and **case-sensitively**:

```
Header: X-Auth-Mode: api     # exactly this, lowercase "api"
```

Anything else (e.g. `API`, `Api`, or absent) keeps the **browser default**:
the JWT is delivered ONLY as an HttpOnly `Set-Cookie`, and the response body
contains **no token**.

### 2.2 Signup → Login → Authorized request flow
```text
POST /api/v1/auth/login            # with X-Auth-Mode: api
  -> 200 { access_token, token_type, expires_in }

Authorization: Bearer <access_token>   # on every subsequent request
```

- **Never** send `X-Auth-Mode: api` on requests other than login; the cookie
  path is for browser (web) clients only.
- Tokens carry only `sub` (user UUID) + `exp` + `iat` — no PII. Expiry default
  **15 minutes**.
- On invalid/expired/missing token the server returns **401** with a uniform
  body (no information leak).

### 2.3 Required signup legal fields
`terms_version` and `privacy_version` are **strictly validated** against the
current legal constants (currently both `"1.0"`). Sending an old/mismatched
version returns **422**.

---

## 3. Error & rate-limit semantics

| Status | Meaning | Body shape |
| :--- | :--- | :--- |
| 400 | Validation/business rule failed | `{ "detail": "..." }` |
| 401 | Not authenticated | `{ "detail": "Not authenticated" }` |
| 403 | Forbidden (RBAC or cross-tenant) | `{ "detail": "Operation not permitted" }` |
| 404 | Resource not found (no enumeration) | `{ "detail": "..." }` |
| 413 | Request body > 10 KB | global body guard |
| 422 | Pydantic validation (schema) | `{ "detail": [ ... ] }` |
| 429 | Rate limit OR AI daily quota | `{ "detail": "..." }` |
| 503 | AI provider unavailable / DB down | `{ "detail": "..." }` |

**AI quota exhaustion example:**
```json
{ "detail": "Daily free summary limit reached (10/10). Upgrade or try again tomorrow." }
```

---

## 4. Bounded-input safeguards (must match Dart models)

| Bound | Value |
| :--- | :--- |
| Max request body | 10 KB (413) |
| AI summary content | 50..32,000 chars |
| Materials search `q` | ≤ 100 chars |
| Sync batch | ≤ 100 items per list |
| Pagination `size` | 1..50 (materials) / 1..100 (tasks) as documented per route |
| `module_code` | 2..20 chars, upper-cased server-side |

---

## 5. Module inventory (21 routes)

| Area | Routes |
| :--- | :--- |
| Auth | signup, login, logout, me, delete account |
| Admin | purge-deleted-users (ADMIN/SUPERUSER only) |
| Academic | modules CRUD, tasks CRUD + complete, timetable |
| AI | summarize, quota |
| Materials | search, list by module |
| Sync | push, pull |
| Dashboard | academic/dashboard |

Full field-level detail is in `docs/openapi.json`.

---

## 6. Offline sync — critical client behavior

- **Last-Write-Wins** by `updated_at` (UTC, ISO-8601). The server **clamps**
  far-future timestamps (clock-skew guard), so always send clock-truthful
  `updated_at`.
- Client-generated UUIDs are accepted, but a task/slot's `module_id` **must**
  belong to the same user, and an id already owned by another user → **403**.
- `GET /sync/pull?since=<ISO-UTC>` returns only records changed strictly after
  `since`.

---

## 7. Low-data / performance contract

- All list endpoints are paginated (`items`, `total`, `page`, `size`, `pages`).
- Materials return `quality_resolution` (e.g. `"360p"`) for mobile data tuning.
- Dashboard is a single low-bandwidth snapshot (bounded; no pagination needed).

---

## 8. Deep-Link Contract (Client-Enforced)

When a student shares a module, the client generates a URL of the form:

```
{share_link_base_url}/m/{module_code}
```

Examples:
- `https://varsitycompanion.co.za/m/INF154`
- `https://varsitycompanion.co.za/m/COS132`

Requirements:
- `module_code` MUST be uppercase (matches server normalization).
- Opening the link MUST preselect the module for a new or existing user.
- The link MUST resolve to the app (Universal Link / App Link on iOS/Android).
- The backend does NOT serve these URLs — they are a client/routing concern.
- When the client fires the share sheet, it should also
  `POST /api/v1/analytics/share` with `{ "module_code": "..." }` so sharing is
  measurable (the fifth MVP success criterion).
