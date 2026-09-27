# Month 2, Week 1, Day 2 — Retrieval-First Materials Search Engine

**Project:** Varsity Companion API
**Date:** 12 September 2026
**Branch:** `month2/week1-day2-materials` (off `develop`)
**Status:** ✅ Complete — DB-backed, retrieval-first, $0 LLM cost

---

## 1. Objective

Give students topic-matched study resources (pre-seeded YouTube tutorials,
open journals, PDFs, articles) filtered by their registered modules — with
**retrieval-first** economics: pure indexed DB lookup, no LLM, no per-request
cost, bounded memory.

---

## 2. Deliverables

| File | Action | Notes |
| :--- | :--- | :--- |
| `app/models/material.py` | **NEW** | `StudyMaterial` (module_code, resource_type, is_approved, quality_resolution) |
| `alembic/versions/0005_...py` | **NEW** | `study_materials` table + `ix_materials_module_type` composite index |
| `app/schemas/material.py` | **NEW** | `MaterialResponse`, `MaterialSearchQuery` (bounded + sanitised) |
| `app/services/material_service.py` | **NEW** | module-scoped indexed search + bounded pagination |
| `app/api/v1/materials.py` | **NEW** | `GET /materials/search` + `GET /materials/modules/{code}` |
| `app/main.py` + `models/__init__.py` | **UPDATED** | Router wired; model exported |
| `tests/test_materials_search_api.py` | **NEW** | 7 tests |

---

## 3. Decisions & scale guarantees

- **Indexed module-scoped search** (your call): every query filters on
  `module_code` (composite index `(module_code, resource_type, is_approved)`)
  **first**, then keyword `ILIKE` runs only within that module. Complexities:
  - List by module: **O(log N + K)** via the index.
  - Keyword search: **O(log N + M + K)** where M = that module's rows — never
    a full-table scan (the blueprint's `%q%` on a bare table would be O(N)).
- **Bounded pagination**: `page ≥ 1`, `size ∈ [1, 50]`, offset/limit pushed to
  the DB → **O(K) worker memory**.
- **Retrieval-first**: zero LLM calls; the "YouTube curation" is the
  pre-seeded, curator-approved `study_materials` rows themselves (no external
  API/key needed at this stage — deliberately not building speculative infra).
- **XSS/control-char sanitization** on the `q` parameter via the existing
  sanitizer; `module_code` normalized upper-case; query length capped at 100.

---

## 4. Acceptance criteria vs. implementation

| # | Criterion | Result |
| :--- | :--- | :--- |
| 1 | `module_code=INF154` returns only that module's materials | ✅ `test_only_requested_module_returned` |
| 2 | >100-char query / XSS sanitized | ✅ `test_query_over_100_chars_rejected` + `test_xss_in_query_is_sanitized` |
| 3 | Pagination capped at ≤ 50 | ✅ `test_size_capped_at_50` (422 on size=999) |
| 4 | Low-data flag 360p on YouTube | ✅ `test_youtube_materials_360p` |
| 5 | No regressions | ✅ 7 new tests pass; ruff clean; app import + 0005 head OK |

---

## 5. Verification

| Check | Result |
| :--- | :--- |
| `ruff check app/ tests/` | **All checks passed** |
| `tests/test_materials_search_api.py` | **7 passed** |
| App import + route wiring | ✅ `/materials/search` + `/materials/modules/{code}` |
| Alembic | ✅ head = `0005` |

No new packages installed; no new external keys required.

---

## 6. Next

- Month 2, Week 1, Day 3 (per the MVP build order): local auto-save backend
  support / the remaining core-loop feature. Check `plan/month_2` for the
  Day 3 blueprint.
- Note: full regression (Day 1 + Day 2 combined) runs against the shared Neon
  test DB; being tracked separately.
