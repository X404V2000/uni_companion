# Month 2, Week 1, Day 4 — Core Academic Loop Integration (Dashboard)

**Project:** Varsity Companion API
**Date:** 12 September 2026
**Branch:** `month2/week1-day4-dashboard` (off `develop`)
**Status:** ✅ Complete — unified low-bandwidth dashboard endpoint

---

## 1. Objective

Close out Week 1 by unifying Days 1–3 into a single `GET /academic/dashboard`
snapshot for the mobile home screen: today's timetable, top-5 urgent tasks,
AI quota, and registered-module count — one indexed, low-bandwidth payload.

---

## 2. Deliverables

| File | Action | Notes |
| :--- | :--- | :--- |
| `app/schemas/dashboard.py` | **NEW** | `AcademicDashboardResponse` |
| `app/services/dashboard_service.py` | **NEW** | tenant-scoped, index-backed aggregation |
| `app/api/v1/dashboard.py` | **NEW** | `GET /academic/dashboard` |
| `app/schemas/academic.py` | **UPDATED** | Added `updated_at` to `TimetableSlotResponse` |
| `app/main.py` | **UPDATED** | Router wired |
| `tests/test_academic_dashboard_api.py` | **NEW** | 4 tests |

---

## 3. Bugs in the blueprint caught & fixed

1. **Day-of-week type mismatch (would return an empty schedule every time).**
   The blueprint did `day_name = today.strftime("%A").upper()` and compared it
   against `TimetableSlot.day_of_week` — but our column is a **SmallInteger
   1=Mon..7=Sun** (with a CHECK constraint). So `int == "MONDAY"` is *always
   false* → zero slots. Fixed via `datetime.weekday() + 1`.
2. **`TimetableSlotResponse` was missing `updated_at`** (the column we added in
   Day 3's migration `0006`). Added it to the response schema.
3. **Misleading `unregistered_modules_count`** field name (it actually counts
   *registered* modules). Renamed to `modules_count`.

---

## 4. Scale/performance guarantees

| Component | Index / bound | Complexity |
| :--- | :--- | :--- |
| Today's slots | `ix_timetable_user_day (user_id, day_of_week)` | O(log N + S) |
| Urgent tasks | `ix_tasks_user_due (user_id, is_completed, due_date)` | O(log N + K), K ≤ 5 |
| AI quota | `ix_user_quota_date (user_id, usage_date)` UNIQUE | O(log N) |
| Modules count | `user_id` FK index | O(log N) |

Result size is **O(1)** — bounded by LIMIT 5 tasks + the user's own timetable;
a single home-screen snapshot needs no pagination. Four indexed queries in one
request; no N+1.

---

## 5. Acceptance criteria vs. implementation

| # | Criterion | Result |
| :--- | :--- | :--- |
| 1 | Indexed aggregation (existing B-Tree indexes) | ✅ (table above) |
| 2 | `urgent_tasks` ≤ 5 | ✅ `test_urgent_tasks_capped_at_5` |
| 3 | Strict tenant scoping | ✅ `test_data_scoped_to_user` |
| 4 | No regressions | ✅ 4 new tests pass; ruff clean |

---

## 6. Verification

| Check | Result |
| :--- | :--- |
| `ruff check app/ tests/` | **All checks passed** |
| `tests/test_academic_dashboard_api.py` | **4 passed** |
| App import + route wiring | ✅ `/academic/dashboard` |
| Alembic | unchanged (no new migration; reuses 0006) |

No new packages or keys.

---

## 7. Week 1 complete — the MVP core loop is now fully wired

- Day 1: AI summaries + cost controls ✅
- Day 2: Materials search (retrieval-first) ✅
- Day 3: Offline sync engine ✅
- Day 4: Unified dashboard ✅

Next (per MVP build order): "Polish the core loop", then a Month-2 Week-1
coherence review / light load test.
