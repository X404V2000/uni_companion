# Week 2, Day 4 — Implementation Report (Transactional Email Service)

**Project:** Varsity Companion API
**Date:** 7 September 2026
**Blueprint:** `plan/month_1/week_2/day_4/SETUP_DAY4.md`

---

## 1. Summary

Delivered a non-blocking welcome-email dispatcher per the blueprint, using Resend's REST API via httpx (no provider SDK), triggered through FastAPI `BackgroundTasks`.

Confirmed decisions:
- **Trigger location:** `BackgroundTasks` injected in the signup route and passed to the service layer (per blueprint).
- **Provider:** Resend (httpx branch); Brevo deferred as a future branch.
- **Settings naming:** snake_case (`email_provider`, `email_api_key`, `email_from`), consistent with the existing `Settings` class.

---

## 2. Deliverables

| File | Change |
|---|---|
| `app/core/config.py` | ADD `email_provider`, `email_api_key`, `email_from` |
| `app/core/email.py` | NEW — `send_welcome_email()` (Resend via httpx, resilient, redacted logging) |
| `app/services/user_service.py` | `create_user(..., background_tasks=None)` schedules welcome email **post-commit** |
| `app/api/v1/auth.py` | signup route injects + passes `BackgroundTasks` |
| `tests/test_email.py` | NEW — 4 unit tests |

---

## 3. Acceptance Criteria Results

| # | Criterion | Result |
|---|---|---|
| 1 | `/signup` returns 201 without waiting on email network calls | ✅ (email runs in FastAPI `BackgroundTasks`, after response) |
| 2 | Missing/invalid key or provider timeout → signup still 201 + warning | ✅ `send_welcome_email` catches all exceptions, returns `False`, never raises |
| 3 | Mocked tests verify welcome email dispatch | ✅ 4 tests (no-op, dispatch, transport-failure, scheduling) |
| 4 | Zero test regressions | ✅ full suite **73 passing** |

---

## 4. Security/Resiliency Notes

- **Never roll back registration:** the email task is scheduled only **after the DB `commit()` succeeds**; a failed insert never dispatches an outbound message.
- **No-op in local dev:** blank `email_api_key` skips sending (logs info), so signup works without a live provider.
- **Redacted logging:** logs exception *type* + recipient only — never the API key or email body.
- **HTML escaping:** the recipient's name is HTML-escaped before interpolation to prevent header/body injection.
- **5s timeout** on the outbound call so a hung provider can't pin background workers indefinitely.

---

## 5. Test Totals

| Suite | Count |
|---|---|
| Prior (Week 1 + Day 3 RBAC) | 69 |
| Email (new) | 4 |
| **Total** | **73 passing** |

---

## 6. Next Steps

- **Day 5 (Friday):** POPIA hard-purge worker (`app/services/purge_service.py`) + `POST /api/v1/admin/purge-deleted-users` gated by `require_role([ADMIN, SUPERUSER])`.

*(Plan-directory reorganization left untouched.)*
