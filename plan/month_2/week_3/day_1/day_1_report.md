# Month 2, Week 3, Day 1 — Admin Materials Curation API

**Project:** Varsity Companion API
**Date:** 16 September 2026
**Branch:** `month2/week3-day1-materials-admin` (off `develop`)
**Status:** ✅ Complete — admins can now add/correct/hide/remove materials

---

## 1. Objective

Give ADMIN/SUPERUSER a complete CRUD surface over `study_materials` so the
materials search feature becomes *usable for real modules* — the smallest
possible surface, nothing more.

---

## 2. Deliverables

| File | Action | Notes |
| :--- | :--- | :--- |
| `app/models/material.py` | **UPDATED** | `updated_at` + `created_by_user_id` (SET NULL FK) |
| `alembic/versions/0009_...py` | **NEW** | 3-step updated_at backfill + creator FK |
| `app/schemas/material.py` | **UPDATED** | `MaterialAdminCreate/Update/Response` (HttpUrl) |
| `app/services/material_service.py` | **UPDATED** | admin CRUD + `MaterialNotFoundError` + INFO logs |
| `app/api/v1/admin.py` | **UPDATED** | 4 routes (role-gated) |
| `docs/openapi.json` | **REGENERATED** | 30 routes, drift gate `[PASS]` |
| `tests/test_admin_materials_api.py` | **NEW** | 13 tests |

**No new packages.**

---

## 3. Decisions & key design points (per blueprint)

- **FK `ondelete=SET NULL` (not CASCADE)** — materials are global, non-PII
  content; hard-purging the creator must NOT delete them (POPIA).
- **`module_code` not updatable** — moving a material between modules is a
  deliberate recreate, not a PATCH.
- **`exclude_unset=True`** on PATCH — only sent fields change (no silent data
  loss from "PUT with defaults").
- **`HttpUrl` schema** — blocks `javascript:` and malformed URLs at the layer.
- **3-step `updated_at` migration** — add nullable → backfill from created_at →
  enforce NOT NULL (no lingering column default).

### Bundled (per architect §11, your call)
- **11.1** ✅ INFO logs on admin create/update/delete (actor + target).
- **11.2** ✅ Guard test: student search always filters `is_approved=True`.
- Deferred: 11.3 (curl helper), 11.4 (audit table), 11.5 (bulk import = Day 2).

---

## 4. Acceptance criteria vs. implementation

| # | Criterion | Result |
| :--- | :--- | :--- |
| 1 | 403 for STUDENT / 401 unauth | ✅ |
| 2 | POST returns 201 | ✅ |
| 3 | module_code uppercased | ✅ `test_create_normalizes_module_code` |
| 4 | `javascript:` URL → 422 | ✅ |
| 5 | title/description sanitized | ✅ |
| 6 | PATCH only sent fields | ✅ |
| 7 | unapprove hides from student search | ✅ (the day's purpose) |
| 8 | DELETE 204 → subsequent 404 | ✅ |
| 9 | list filters + paginated | ✅ |
| 10 | size=999 → 422 | ✅ |
| 11-16 | migration, head 0009, openapi, ruff, no packages | ✅ all verified |

---

## 5. Verification

| Check | Result |
| :--- | :--- |
| `ruff check app/ tests/ scripts/` | **All checks passed** |
| `tests/test_admin_materials_api.py` | **13 passed** |
| Migration to test DB | ✅ head `0009` (3-step backfill clean) |
| Drift gate | `[PASS]` (30 routes) |
| New packages | **none** |

---

## 6. Next (Week 3 arc)

Day 2 = bulk import (CSV/JSON) with validation + dry-run, building on this CRUD
surface.
