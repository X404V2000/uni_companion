# Security Audit Report — Week 3 (Academic Tracker) Adversarial Pass

**Project:** Varsity Companion API
**Date:** 7 September 2026
**Scope:** Full attack-surface review of the new Academic Tracker (14 API routes) after Week 3 delivery
**Result:** 2 hardening fixes; everything else verified safe. **121/121 tests passing.**

---

## 1. Attack Surface

14 API routes now exposed: auth (5), admin (1), academic (8). Academic routes are all authenticated (`get_current_user`) and tenant-scoped at the service layer.

---

## 2. Findings Fixed 🔧

### (a) Unvalidated enum filters on `GET /tasks` (low)
- **Was:** `priority`/`task_type` query params were untyped `str | None`, so arbitrary values were accepted (parameterized SQL — not injection — but inconsistent with the write path and lenient).
- **Fix:** router typed them as `TaskPriority | None` / `TaskType | None` (422 on invalid), AND the service now applies its own allow-list (`LOW/MEDIUM/HIGH/CRITICAL`, `ASSIGNMENT/EXAM/TEST/QUIZ`).

### (b) Pagination bounds only enforced at the router (low / defense-in-depth)
- **Was:** `get_user_tasks_paginated` itself had no cap on `page`/`size`; a future direct caller could page/limit unbounded.
- **Fix:** service now clamps `page >= 1` and `1 <= size <= 100` internally (belt-and-braces with the router's `Query(ge/le)`).

---

## 3. Verified Safe (no changes needed)

| Area | Result |
|---|---|
| **IDOR / tenant isolation** | User B cannot delete A's module, patch A's task, or use A's module in a slot — all return generic 404. |
| **Mass assignment** | `user_id`/`id`/`is_completed` in create bodies are ignored; never persisted from client input. |
| **SQL injection** | All filters are SQLAlchemy-parameterized bind values; enum allow-lists block junk values. |
| **Pagination abuse** | `page=0` and `size=999` rejected (422). |
| **Module/task/slot writes** | Enum + range + ownership checks all enforced (existing Day 2–4 tests). |

---

## 4. New Regression Tests

`tests/test_week3_security.py` (9 tests): invalid enum filters, pagination bounds, mass assignment (module + task), cross-tenant IDOR (delete/patch/slot).

**Totals:** 112 → **121 passing**, zero regressions.

---

## 5. Residual Notes (non-blocking)

- **`GET /timetable`** is unpaginated (returns full week — bounded to ≤7 days × slots, acceptable for a single user's schedule; revisit if schedules grow large).
- **`GET /modules`** is unpaginated (a student owns at most dozens of modules; acceptable).
- **slowapi in-memory counters** remain single-instance; `redis_url` config already exists for scaling.

*(Plan-directory reorganization left untouched.)*
