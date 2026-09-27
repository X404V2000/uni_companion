# Week 2, Day 5 — Implementation Report (POPIA Hard-Purge Worker & Admin Endpoint)

**Project:** Varsity Companion API
**Date:** 7 September 2026
**Blueprint:** `plan/month_1/week_2/day_5/SETUP_DAY5.md`

---

## 1. Summary

Completed Week 2 with the POPIA hard-purge engine — the true physical-erasure counterpart to Week 1's soft-delete tombstone.

- **`purge_service.py`** deletes soft-deleted accounts whose `deleted_at` is older than `popia_retention_days` (default 30).
- **`POST /api/v1/admin/purge-deleted-users`** triggers it manually, gated by RBAC (`ADMIN`/`SUPERUSER`).

---

## 2. Deliverables

| File | Change |
|---|---|
| `app/core/config.py` | ADD `popia_retention_days: int = 30` (env `POPIA_RETENTION_DAYS`) |
| `app/services/purge_service.py` | NEW — `purge_expired_users(db, retention_days=None) -> int` |
| `app/api/v1/admin.py` | NEW — `POST /purge-deleted-users`, `require_role([ADMIN, SUPERUSER])`, rate-limited 5/min |
| `app/main.py` | Wire `/api/v1/admin` router |
| `tests/test_purge_service.py` | NEW — 6 tests |

---

## 3. Acceptance Criteria Results

| # | Criterion | Result |
|---|---|---|
| 1 | Accounts soft-deleted within window are NOT purged | ✅ |
| 2 | Expired soft-deleted accounts are permanently removed | ✅ (row count → 0) |
| 3a | STUDENT → 403 `"Operation not permitted"` | ✅ |
| 3b | ADMIN / SUPERUSER → 200 | ✅ |
| 4 | Zero test regressions | ✅ full suite **79 passing** |

---

## 4. Design Notes & Deviations

Two minor adaptations from the blueprint, applied for codebase consistency (no behaviour change):

1. **Setting renamed** `POPIA_RETENTION_DAYS` → `popia_retention_days` (snake_case, matching the established `Settings` class). `.env` may still use the UPPER_CASE key because pydantic-settings maps case-insensitively.
2. **`PurgeService` class → module-level `purge_expired_users`**, consistent with `app/services/user_service.py` (module-level functions), keeping one service-layer style across the codebase.

Also added `request: Request` to the admin handler because slowapi's `@limiter.limit` requires it (the blueprint sample omitted it, which would raise at import).

---

## 5. Security Properties

- **RBAC enforced server-side** via `require_role`; a leaked student token cannot trigger mass erasure.
- **Retention-boundary respected** in the query (`deleted_at <= now - retention`), with a timezone-aware cutoff to avoid naive-datetime comparison bugs.
- **Single transaction** for the delete batch.
- **No PII logged** — only aggregate counts.
- **Rate limited** (5/min) to blunt abuse of an elevated-privilege endpoint.

---

## 6. Test Totals

| Suite | Count |
|---|---|
| Week 1 + Day 3 (RBAC) + Day 4 (email) | 73 |
| Day 5 purge (new) | 6 |
| **Total** | **79 passing** |

---

## 7. Week 2 Complete ✅

All five days delivered:
- Mon–Tue: Alembic + service layer decoupling (approved by architect)
- Wed: RBAC
- Thu: transactional email
- Fri: POPIA hard-purge worker + admin endpoint

Next: the architect's Week-2 coherence review, then into Week 3 scope.

*(Plan-directory reorganization left untouched.)*
