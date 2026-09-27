# Month 2, Week 1, Day 3 — Local Auto-Save & Offline Sync Engine

**Project:** Varsity Companion API
**Date:** 12 September 2026
**Branch:** `month2/week1-day3-sync` (off `develop`)
**Status:** ✅ Complete — tasks + modules + timetable sync, LWW, tenant-guarded

---

## 1. Objective

Backend support for **local auto-save & offline sync**: mobile clients queue
changes offline, then push/pull deltas to the cloud with safe conflict
resolution — so a student with intermittent connectivity never loses work.

---

## 2. Deliverables

| File | Action | Notes |
| :--- | :--- | :--- |
| `app/schemas/sync.py` | **NEW** | Task/Module/TimetableSlot sync items + push/pull envelopes |
| `app/services/sync_service.py` | **NEW** | LWW batch upsert (atomic) + user-scoped delta pull |
| `app/api/v1/sync.py` | **NEW** | `POST /sync/push` + `GET /sync/pull` |
| `app/models/academic.py` | **UPDATED** | Added `updated_at` to `TimetableSlot` (needed for LWW) |
| `alembic/versions/0006_...py` | **NEW** | `timetable_slots.updated_at` migration (backfilled) |
| `app/main.py` | **UPDATED** | Router wired |
| `tests/test_sync_engine_api.py` | **NEW** | 7 tests |

---

## 3. Decisions (2 flagged, 2 resolved) + bugs found & fixed

1. **Scope widened** (your call): sync **tasks + modules + timetable slots** —
   full offline coverage, not just tasks as the blueprint specified.
2. **Client-supplied IDs, with guards** (your call): offline-created items keep
   their client UUID, but the server rejects any id that belongs to another
   user (403) and validates that a task/slot's `module_id` belongs to the
   caller — blocking cross-tenant FK smuggling.

### Bugs in the blueprint caught during implementation
- **`TimetableSlot` had no `updated_at`** — LWW is impossible on slots without
  it. Added the column via migration `0006` (backfilled from `created_at`).
- **`TaskSyncItem` omitted required fields** (`task_type`, `priority`) which
  would have violated the DB CHECK constraints on insert.
- **Mutable `default=[]`** → `default_factory=list`.
- **Naive vs aware `updated_at`** → normalized to UTC so comparisons don't raise.
- **"Older write" wasn't counted** in `ignored_changes` for modules — fixed.

---

## 4. Security & scale guarantees

| Guarantee | Mechanism |
| :--- | :--- |
| Tenant isolation (push) | id owned by another user → 403, never clobbered |
| Tenant isolation (pull) | every query `user_id == current_user.id` |
| Module ownership | task/slot `module_id` must belong to caller |
| Last-Write-Wins | older `updated_at` ignored; only newer applies |
| Atomic batch | all items in ONE transaction — no partial sync |
| Batch bounds | list max_length=100 (schema) + 10 KB body middleware |
| Delta efficiency | `since` filters → O(log N + K) index-backed |

---

## 5. Acceptance criteria vs. implementation

| # | Criterion | Result |
| :--- | :--- | :--- |
| 1 | `since` returns only newer records | ✅ `test_since_returns_only_newer` |
| 2 | LWW: older write ignored | ✅ `test_older_write_ignored` |
| 3 | 101-item batch rejected | ✅ `test_pushing_101_tasks_rejected` (413/422) |
| 4 | Cross-user push rejected/ignored | ✅ `test_cross_user_task_id_rejected` + `test_cross_user_module_reference_rejected` (403) |
| 5 | No regressions | ✅ 7 new tests pass; ruff clean; 0006 head |

---

## 6. Verification

| Check | Result |
| :--- | :--- |
| `ruff check app/ tests/` | **All checks passed** |
| `tests/test_sync_engine_api.py` | **7 passed** |
| App import + route wiring | ✅ `/sync/push` + `/sync/pull` |
| Alembic | ✅ head = `0006` |

No new packages or external keys.

---

## 7. Next

- Day 4 (per MVP build order: "polish the core loop") — check `plan/month_2/
  week_1/day_4` when provided by the architect.
- Note: the `updated_at` migration (`0006`) is a schema change to an existing
  table; it backfills safely and is additive.
