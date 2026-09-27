# Week 3, Day 4 — Implementation Report (Task & Assignment Deadline Tracker)

**Project:** Varsity Companion API
**Date:** 7 September 2026
**Blueprint:** `plan/month_1/week_3/day_4/SETUP_DAY4.md`

---

## 1. Summary

Delivered the Task & Assignment Deadline Tracker: users can create academic tasks (assignment/exam/test/quiz), list them (optionally filtered by completion), and toggle completion with an automatic `completed_at` state machine.

---

## 2. Deliverables

| File | Change |
|---|---|
| `app/schemas/academic.py` | ADD `TaskType`/`TaskPriority` Literals + `TaskCreate`, `TaskUpdateStatus`, `TaskResponse` |
| `app/services/academic_service.py` | ADD `create_task`, `get_user_tasks`, `update_task_completion`, `TaskNotFoundError` |
| `app/api/v1/academic.py` | ADD `POST/GET /tasks`, `PATCH /tasks/{id}/complete` |
| `tests/test_academic_tasks_api.py` | NEW — 6 tests |

---

## 3. Endpoints

| Method | Path | Result |
|---|---|---|
| POST | `/api/v1/academic/tasks` | 201 / 404 (module not yours) |
| GET | `/api/v1/academic/tasks?is_completed=` | 200 (scoped, sorted by due_date) |
| PATCH | `/api/v1/academic/tasks/{id}/complete` | 200 / 404 (not yours) |

---

## 4. Acceptance Criteria Results

| # | Criterion | Result |
|---|---|---|
| 1 | Invalid `task_type`/`priority` → 422 | ✅ |
| 2 | Foreign module → 404 | ✅ |
| 3 | `is_completed=True` → `completed_at` set; `False` → `None` | ✅ |
| 4 | List scoped to user; cross-user PATCH → 404 | ✅ |
| 5 | Zero regressions (101 existing) | ✅ **107 passing** |

---

## 5. Security & Correctness

- **Enum enforcement** via `Literal` in Pydantic + DB CHECK constraints (two layers).
- **State machine**: `completed_at` set to `now(utc)` on complete, reset to `None` on un-complete.
- **Tenant isolation**: module ownership verified on create; list + patch scoped by `user_id`; cross-user patch → generic 404 (no enumeration).
- **Input hardening**: `title` sanitized; `weight_percentage` bounded 0–100.
- **Auth required** on all three routes.

---

## 6. Test Totals

| Suite | Count |
|---|---|
| Prior (Weeks 1–2 + W3 D1–D3) | 101 |
| Tasks (new) | 6 |
| **Total** | **107 passing** |

---

## 7. Next Steps (Week 3)

- **Day 5 (Friday):** Unified filtering, pagination (`page`, `size`, `module_id`, `priority`, `from_date`, `to_date`) + expand tests to 95+ (already at 107).

*(Plan-directory reorganization left untouched.)*
