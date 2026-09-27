---

## §0. Prerequisite — Test DB Must Exist

Before starting Day 3, confirm:

```bash
docker ps --filter name=vc_test_pg
```

If nothing is running, start it:

```bash
docker run -d --name vc_test_pg \
  -e POSTGRES_USER=test_user \
  -e POSTGRES_PASSWORD=test_password \
  -e POSTGRES_DB=varsity_companion_test \
  -p 5545:5432 \
  postgres:15-alpine
```

Then add this line to `.env`:

```
TEST_DATABASE_URL=postgresql+psycopg://test_user:test_password@localhost:5545/varsity_companion_test
```

Apply migrations to the test DB:

```bash
cd ~/Desktop/projects/university_helper
source venv/bin/activate
DATABASE_URL="postgresql+psycopg://test_user:test_password@localhost:5545/varsity_companion_test" alembic upgrade head
```

Confirm `alembic current` reports `0009 (head)`. If yes, proceed.

---

# Month 2, Week 3, Day 3 — Materials Coverage Analytics + `(module_code, url)` Index

**To:** Implementation (DeepSeek V4, guided by founder)
**From:** Senior Systems Design & Architecture Engineer
**Date:** 27 September 2026
**Status:** Specification Active
**Branch:** `month2/week3-day3-coverage`
**Baseline:** `develop` (reconciled, CI green, head `0009`)

---

## §0. Scope

Day 3 delivers two related things:

1. **Migration `0010`** — a composite index on `study_materials(module_code, url)`. Closes the O(N) duplicate-check cost flagged in the Day 2 blueprint.
2. **`GET /admin/materials/coverage`** — an admin-gated read of module-level coverage: per-module counts (approved vs unapproved), a "starved modules" list (modules with zero materials), and a global summary.

**In scope:** one migration, one endpoint, one service function, one admin route, ~10 tests.
**Out of scope:** relevance ranking (Day 4), dashboards, material tagging, cross-module discovery, export.

---

## §1. Technical Objectives

1. **Add the `(module_code, url)` composite index** — O(log N) for the duplicate check.
2. **Deliver `/admin/materials/coverage`** — aggregated, bounded read with three sections: `summary`, `by_module`, `starved`.
3. **Reuse the existing** `ix_materials_module_type (module_code, resource_type, is_approved)` index where it applies. Do not add redundant indexes.
4. **Bound everything**: response size, per-module entry count, pagination.
5. **No new packages, no LLM calls, no external APIs.**

---

## §2. Architectural Strategy

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     ADMIN MATERIALS COVERAGE                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  (A) THE DUPLICATE-CHECK INDEX                                           │
│  ────────────────────────────────────────────────────────────────────    │
│    Before 0010:  O(N) sequential scan                                    │
│    After 0010:   O(log N) index lookup on ix_materials_module_url        │
│                                                                          │
│  (B) THE COVERAGE ENDPOINT                                               │
│  ────────────────────────────────────────────────────────────────────    │
│                                                                          │
│    GET /admin/materials/coverage?page=1&size=50                          │
│                                                                          │
│    Returns:                                                              │
│      summary:    total/approved/unapproved/modules_with_materials/       │
│                  starved_modules                                         │
│      by_module:  [ {code, total, approved, unapproved, last_updated} ]   │
│                  Sorted total DESC, code ASC. Paginated.                 │
│      starved:    [ {module_code, module_name} ]                          │
│                  Modules in `modules` table with zero study_materials.   │
│                  Paginated (same page/size as by_module).                │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Design principle:** The migration and endpoint ship together because they share a concern — *knowing what materials exist and what doesn't*. Splitting them would make Day 3 incoherent.

**Design constraint:** `by_module` groups by `module_code` on `study_materials`. `starved` is the reverse: codes in `modules` table but not in `study_materials`. The two tables are independent — `study_materials` is global content, `modules` is per-student enrolment.

---

## §3. File Implementation Map

| File Path | Action | Purpose |
|---|---|---|
| `alembic/versions/0010_materials_module_url_index.py` | **NEW** | Add composite index |
| `app/schemas/material.py` | **UPDATED** | `CoverageSummary`, `CoverageByModule`, `StarvedModule`, `CoverageResponse` |
| `app/services/material_service.py` | **UPDATED** | `get_materials_coverage(...)` |
| `app/api/v1/admin.py` | **UPDATED** | `GET /admin/materials/coverage` |
| `tests/test_materials_coverage_api.py` | **NEW** | ~10 tests |
| `docs/openapi.json` | **REGENERATED** | Drift gate |

**No new packages. No new schema beyond the index.**

---

## §4. Step-by-Step Developer Guide

### §4.1 Migration `0010`

Create `alembic/versions/0010_materials_module_url_index.py`:

```python
"""
add composite index on study_materials(module_code, url)

Revision ID: 0010
Revises: 0009

Rationale
---------
The bulk-import duplicate check (Day 2) filters on
(module_code, url). Without a composite index this is O(N)
per row, which becomes O(R*N) for an R-row import.

This index makes it O(log N). It is deliberately NOT unique:
the application-level duplicate rule stays in the import
layer until real usage shows whether a DB constraint is safe.
"""
from alembic import op


revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_materials_module_url",
        "study_materials",
        ["module_code", "url"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_materials_module_url", table_name="study_materials")
```

### §4.2 Schemas (`app/schemas/material.py`)

Add at the bottom of the file:

```python
class CoverageSummary(BaseModel):
    """Global counts. Invariants:
       approved + unapproved == total_materials
       modules_with_materials == distinct module_code in study_materials
       starved_modules == distinct module_code in modules NOT IN study_materials
    """
    total_materials: int
    approved: int
    unapproved: int
    modules_with_materials: int
    starved_modules: int


class CoverageByModule(BaseModel):
    """Per-module counts. Sorted total DESC, module_code ASC."""
    module_code: str
    total: int
    approved: int
    unapproved: int
    last_updated_at: datetime | None


class StarvedModule(BaseModel):
    """Module in `modules` table with zero study_materials."""
    module_code: str
    module_name: str | None


class CoverageResponse(BaseModel):
    """Bounded: by_module and starved each ≤ `size` entries."""
    summary: CoverageSummary
    by_module: list[CoverageByModule]
    starved: list[StarvedModule]
    page: int
    size: int
    by_module_total: int
    starved_total: int
```

### §4.3 Service (`app/services/material_service.py`)

Add at the bottom:

```python
def get_materials_coverage(
    db: Session,
    page: int = 1,
    size: int = 50,
) -> dict:
    """
    Aggregated coverage of study_materials by module code.

    Time:  O(M log M) group-by/sort + O(log N) summary aggregates
    Space: O(P), P ≤ 100 (page size)

    Guarantees:
      summary.starved_modules == starved_total (same count reused)
      summary.total_materials == summary.approved + summary.unapproved
    """
    page = max(1, page)
    size = max(1, min(size, 100))

    # 1. Summary
    total_materials = db.query(func.count(StudyMaterial.id)).scalar() or 0
    approved = (
        db.query(func.count(StudyMaterial.id))
        .filter(StudyMaterial.is_approved.is_(True))
        .scalar()
        or 0
    )
    unapproved = total_materials - approved
    modules_with_materials = (
        db.query(func.count(distinct(StudyMaterial.module_code))).scalar() or 0
    )

    # 2. by_module
    module_rows = (
        db.query(
            StudyMaterial.module_code.label("module_code"),
            func.count(StudyMaterial.id).label("total"),
            func.sum(
                func.case((StudyMaterial.is_approved.is_(True), 1), else_=0)
            ).label("approved"),
            func.max(StudyMaterial.updated_at).label("last_updated_at"),
        )
        .group_by(StudyMaterial.module_code)
        .order_by(func.count(StudyMaterial.id).desc(), StudyMaterial.module_code.asc())
        .all()
    )
    by_module_total = len(module_rows)
    offset = (page - 1) * size
    page_slice = module_rows[offset : offset + size]

    # 3. starved
    covered_subq = db.query(StudyMaterial.module_code).distinct().subquery()
    starved_rows = (
        db.query(
            Module.code.label("module_code"),
            func.min(Module.name).label("module_name"),
        )
        .filter(~Module.code.in_(db.query(covered_subq.c.module_code)))
        .group_by(Module.code)
        .order_by(Module.code.asc())
        .all()
    )
    starved_total = len(starved_rows)
    starved_slice = starved_rows[offset : offset + size]

    return {
        "summary": {
            "total_materials": total_materials,
            "approved": approved,
            "unapproved": unapproved,
            "modules_with_materials": modules_with_materials,
            "starved_modules": starved_total,
        },
        "by_module": [
            {
                "module_code": r.module_code,
                "total": r.total,
                "approved": r.approved,
                "unapproved": r.total - r.approved,
                "last_updated_at": r.last_updated_at,
            }
            for r in page_slice
        ],
        "starved": [
            {"module_code": r.module_code, "module_name": r.module_name}
            for r in starved_slice
        ],
        "page": page,
        "size": size,
        "by_module_total": by_module_total,
        "starved_total": starved_total,
    }
```

**Ensure imports are present:** `from sqlalchemy import func, distinct` and `from app.models.academic import Module` at the top of the file.

### §4.4 Router (`app/api/v1/admin.py`)

**Critical:** `/materials/coverage` **must be declared above** `/materials/{material_id}` if that route exists. FastAPI matches in declaration order.

Add the route:

```python
@router.get(
    "/materials/coverage",
    response_model=CoverageResponse,
    dependencies=[Depends(require_role([UserRole.ADMIN, UserRole.SUPERUSER]))],
)
def admin_materials_coverage(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    return material_service.get_materials_coverage(db, page=page, size=size)
```

Add the import: `from app.schemas.material import CoverageResponse` (extend the existing import line).

### §4.5 Tests (`tests/test_materials_coverage_api.py`)

Ten tests:

1. `test_coverage_requires_admin` — STUDENT → 403
2. `test_coverage_requires_auth` — no token → 401
3. `test_coverage_summary_counts_correct` — seed known set; assert totals
4. `test_coverage_by_module_ordering` — total DESC, code ASC
5. `test_coverage_by_module_pagination` — size=2, page=2 → correct slice
6. `test_coverage_starved_lists_modules_without_materials`
7. `test_coverage_starved_excludes_covered_modules`
8. `test_coverage_empty_dataset` — zeros, empty lists, no crash
9. `test_coverage_size_capped_at_100` — size=999 → 422
10. `test_coverage_index_is_used` — seed 1,000 materials; run `EXPLAIN` on `SELECT ... WHERE module_code = ? AND url = ?`; assert plan contains `ix_materials_module_url`

**Test 10 is the day's purpose.** Without it, the migration could be wrong and nothing would catch it.

---

## §5. Time/Space Complexity Audit

| Component | Time | Space | Safeguard |
|---|---|---|---|
| Migration `0010` | O(N) one-time | O(N) index | Non-blocking on Postgres 11+ |
| Summary aggregate | O(log N + N) | O(1) | Index-assisted count |
| `by_module` group-by | O(log N + N) + O(M log M) | O(M) | M = distinct codes |
| `starved` | O(log N + N) + O(K log K) | O(K) | K = distinct modules |
| Response payload | — | O(P), P ≤ 100 | `size` capped |

---

## §6. Security & Scale Guarantees

| Guarantee | Mechanism |
|---|---|
| Role-gated | `require_role([ADMIN, SUPERUSER])` |
| Bounded response | `page`/`size` capped; both lists bounded independently |
| No PII in response | Only aggregate counts and module codes/names |
| No cross-tenant leakage | Materials are global; per-user data is not exposed |
| Index is non-unique | Deliberately; duplicate rule stays in import layer |
| No new dependencies | Stdlib only |
| Idempotent | Read-only endpoint |

---

## §7. Acceptance Criteria

1. Migration `0010` applies forward cleanly; downgrade reverses; Alembic head = `0010`.
2. `GET /admin/materials/coverage` requires ADMIN/SUPERUSER → 403/401.
3. `summary.total_materials` equals row count of `study_materials`.
4. `summary.approved + summary.unapproved == summary.total_materials`.
5. `summary.modules_with_materials` equals distinct `module_code` count.
6. `summary.starved_modules == starved_total`.
7. `by_module` sorted total DESC, code ASC.
8. `by_module` respects `page`/`size`; `by_module_total` reports full count.
9. `starved` lists only modules with zero materials.
10. Empty dataset → zeros, empty lists.
11. `size=999` → 422.
12. `EXPLAIN` uses `ix_materials_module_url`.
13. `docs/openapi.json` regenerated; drift gate `[PASS]`.
14. ~10 new tests pass; full suite no regressions.
15. `ruff check app/ tests/ scripts/` clean.
16. **No new packages.**

---

## §8. Verification Steps

```bash
# 1. Migration
alembic upgrade head           # 0010
alembic current                # 0010 (head)
alembic downgrade -1           # reverses
alembic upgrade head

# 2. Index presence
psql "$DATABASE_URL" -c "\d study_materials" | grep ix_materials_module_url

# 3. Lint + tests
ruff check app/ tests/ scripts/
pytest tests/test_materials_coverage_api.py -v
pytest -q                       # full suite

# 4. Drift gate
python scripts/export_openapi.py > docs/openapi.json
python scripts/check_contract_drift.py     # [PASS]
```

---

## §9. Defect-Discovery Prompts

> Run it, don't just read it.

- **Migration fails "index already exists"** → partial state. Check `alembic current`; if still `0009`, drop the index manually and retry.
- **`EXPLAIN` shows Seq Scan despite the index** → the table is too small; the test must seed 1,000+ rows.
- **`by_module` order shifts between calls** → non-stable sort. Add `module_code ASC` as tiebreaker.
- **`starved` includes covered modules** → the `NOT IN` filter is inverted.
- **`starved` has duplicates** → `modules` has one row per student-module enrolment; the query must `GROUP BY Module.code` (as written) or `DISTINCT`.
- **`summary.starved_modules != starved_total`** → computed with different queries. Reuse one count.
- **`size=999` returns 200** → router `Query(..., le=100)` missing.
- **`/coverage` returns 422 "value is not a valid uuid"** → route ordering. `/coverage` must be declared above `/materials/{material_id}`.

---

## §10. Sign-Off Checklist

- [ ] Migration `0010` created; forward + downgrade clean; head = `0010`
- [ ] Index `ix_materials_module_url` present
- [ ] Four coverage schemas added
- [ ] `get_materials_coverage` in `material_service.py`
- [ ] `GET /admin/materials/coverage` route added, gated
- [ ] Route declared above `/materials/{material_id}` if it exists
- [ ] `by_module` sorted total DESC, code ASC
- [ ] `starved` uses `GROUP BY Module.code`
- [ ] `summary.starved_modules == starved_total`
- [ ] `size` bounded ≤ 100
- [ ] `EXPLAIN` test passes with seeded rows
- [ ] `docs/openapi.json` regenerated; drift gate `[PASS]`
- [ ] ~10 tests pass; full suite no regressions
- [ ] `ruff check` clean
- [ ] **No new packages**
- [ ] Branch: `month2/week3-day3-coverage` off `develop`

---

## §11. Optional Bundles

**Bundle (prevent silent bugs):**
- **§11.1** — Assert the index name directly: a one-line test querying `pg_indexes` for `ix_materials_module_url`.
- **§11.2** — INFO log line: `logger.info("coverage.read actor=%s page=%d size=%d by_module=%d starved=%d", ...)`.

**Defer:** caching, CSV export, historical snapshots.

**Recommendation: bundle both.** ~5 lines total.

---
