# Week 2, Day 3 — Implementation Report (Role-Based Access Control)

**Project:** Varsity Companion API
**Date:** 7 September 2026
**Architect decisions source:** `plan/month_1/week_2/day_1_and_day_2/SETUP_DAY1_AND_2.md`

---

## 1. Summary

Implemented RBAC exactly per the architect's five decisions:

| # | Decision | Result |
|---|---|---|
| 1 | `STUDENT`/`ADMIN`/`SUPERUSER` as string enum; VARCHAR + CHECK (no native ENUM) | ✅ `app/core/roles.py` + `ck_users_role_valid` |
| 2 | CLI bootstrap (`scripts/create_admin.py`) — no public provisioning endpoint | ✅ |
| 3 | `/me` exposes `role`; `DELETE /account` self-service = STUDENT+ADMIN; Friday purge = ADMIN+SUPERUSER | ✅ (`/me` via schema; delete gate applied) |
| 4 | Migration `0002_add_user_roles.py` with `server_default='student'` | ✅ |
| 5 | Uniform `403 {"detail": "Operation not permitted"}` | ✅ |

---

## 2. Deliverables

| File | Change |
|---|---|
| `app/core/roles.py` | NEW — `UserRole(str, Enum)` + CHECK-constraint builder |
| `app/models/user.py` | ADD `role` column (VARCHAR(20), server_default 'student') + `__table_args__` CHECK |
| `alembic/versions/0002_add_user_roles.py` | NEW — add column + CHECK; downgrade reverses |
| `app/api/deps.py` | ADD `require_role(allowed_roles)` dependency factory |
| `app/schemas/user.py` | `UserResponse` now includes `role` |
| `app/api/v1/auth.py` | `DELETE /account` gated to `[STUDENT, ADMIN]` |
| `app/services/user_service.py` | `create_user(..., role=STUDENT)` optional elevated role for bootstrap |
| `scripts/create_admin.py` | NEW — out-of-band SUPERUSER/ADMIN bootstrap via the service layer |
| `tests/test_rbac.py` | NEW — 6 RBAC tests |

---

## 3. Bug Found & Fixed During Implementation (important)

**Alembic `env.py` clobbered programmatic URL overrides.**

- `alembic/env.py` unconditionally ran `config.set_main_option("sqlalchemy.url", settings.database_url)`.
- This silently ignored any caller-supplied URL — so the "upgrade the test DB" step was actually re-running the **dev** DB migration, leaving the isolated `*_test` DB without the new column.
- Fix: only apply the settings URL as a **fallback** when none is already set (`if not config.get_main_option(...)`).
- This is exactly the kind of subtle bug that would let tests pass against the wrong database; the test DB was then correctly stamped `0001` + upgraded to `0002`.

---

## 4. Verification

| Check | Result |
|---|---|
| Offline migration SQL | ✅ `ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'student' NOT NULL;` + CHECK constraint |
| Dev DB at `0002` | ✅ |
| Test DB at `0002` (role column present) | ✅ |
| RBAC test file | ✅ 6/6 |
| Full suite | ✅ (69 expected) |

### RBAC behaviour verified
- New signup defaults to `student`; `/me` returns `role`.
- `require_role([ADMIN, SUPERUSER])` passes ADMIN, blocks STUDENT with exactly `403 {"detail": "Operation not permitted"}`.
- `DELETE /account`: STUDENT ✅, ADMIN ✅, SUPERUSER ❌ (403).

---

## 5. How to bootstrap the first elevated account

```bash
python scripts/create_admin.py --email admin@example.com --role superuser
# (password prompted securely, or --password '...')
```

No HTTP endpoint exposes role elevation.

---

## 6. Next Steps

- **Day 4** — Email service integration (Resend/Brevo) with async welcome email (per `week_2.md`).
- **Day 5** — POPIA hard-purge worker + `POST /api/v1/admin/purge-deleted-users` gated by `require_role([ADMIN, SUPERUSER])`.

*(The plan-directory reorganization remains intentionally untouched.)*
