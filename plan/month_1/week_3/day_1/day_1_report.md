# Week 3, Day 1 — Implementation Report (Academic Tracker Models & Migration 0003)

**Project:** Varsity Companion API
**Date:** 7 September 2026
**Blueprint:** `plan/month_1/week_3/day_1/SETUP_DAY1.md`

---

## 1. Summary

Established the Academic Tracker domain schema: three SQLAlchemy ORM models with strict multi-tenant isolation (CASCADE FKs to `users.id`) and a clean Alembic migration `0003`.

---

## 2. Deliverables

| File | Change |
|---|---|
| `app/models/academic.py` | NEW — `Module`, `TimetableSlot`, `AcademicTask` |
| `app/models/__init__.py` | Export the three models |
| `alembic/versions/0003_academic_tracker_schema.py` | NEW migration (hand-written, matches 0001/0002 style) |
| `tests/test_academic_models.py` | NEW — 5 ORM/constraint tests |

---

## 3. Acceptance Criteria Results

| # | Criterion | Result |
|---|---|---|
| 1 | `upgrade head` + `downgrade -1` clean | ✅ (offline SQL preview + applied to dev & test DBs) |
| 2 | Cascade: deleting a User purges modules/slots/tasks | ✅ |
| 3 | Unique module code per user (dup same-user → IntegrityError; different users share) | ✅ |
| 4 | Zero test regressions (85 existing) | ✅ **90 passing** (85 + 5) |

---

## 4. Schema Implemented

- **`modules`** — UUID pk, `user_id` FK CASCADE, `code`(20)/`name`(255)/`color_code`(7), timestamps, `UNIQUE(user_id, code)`.
- **`timetable_slots`** — `user_id`+`module_id` FK CASCADE, `day_of_week` (CHECK 1–7), `start/end_time`, `venue`, index `(user_id, day_of_week)`.
- **`academic_tasks`** — `user_id`+`module_id` FK CASCADE, `title`, `task_type`, `due_date`, `priority`, `weight_percentage NUMERIC(5,2)`, `is_completed`, `completed_at`, timestamps, index `(user_id, is_completed, due_date)`.

### Deviation (hardening, no behavior change)
Added **CHECK constraints** on `task_type` (`ASSIGNMENT/EXAM/TEST/QUIZ`) and `priority` (`LOW/MEDIUM/HIGH/CRITICAL`) — consistent with our `UserRole` pattern. The blueprint stored these as plain VARCHAR; the CHECKs add a DB-level backstop without altering the default or API contract.

### Note on migration style
Hand-written `0003` (matching `0001`/`0002`) rather than `alembic revision --autogenerate`, keeping our auditable, offline-SQL-friendly baseline approach. Verified the generated SQL matches the model exactly.

---

## 5. Test Totals

| Suite | Count |
|---|---|
| Weeks 1–2 (incl. security audit) | 85 |
| Academic models (new) | 5 |
| **Total** | **90 passing** |

---

## 6. Next Steps (Week 3)

- **Day 2:** `ModuleService` + module CRUD endpoints (`POST/GET/DELETE /api/v1/academic/modules`) with tenant-scoped queries.

*(Plan-directory reorganization left untouched.)*
