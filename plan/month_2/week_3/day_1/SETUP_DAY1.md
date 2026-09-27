# Day 5 Report — Architectural Review & Week 3 Day 1 Blueprint

**Reviewer:** Senior Systems Design & Architecture Engineer
**Date:** 16 September 2026
**Status:** Day 5 **APPROVED** / Week 2 **CLOSED** / Week 3 Day 1 specification below

---

## 1. Sign-Off on Day 5

Day 5 is approved. It's exactly what a review day should be: no new surface, complete audit, honest about limits.

**What landed well:**

| Deliverable | Assessment |
|---|---|
| Migration chain `0001 → 0008` verified | Offline SQL + idempotency + reversibility is the strongest proxy available for a remote Neon DB. **Honest limitation, correctly stated.** |
| Cross-tenant isolation audit | Every Week 2 surface covered, no gaps. |
| Running defect list | Six defects across the week — all caught by the blueprint's prompts + running the code, not by reading it. |
| Merge order documented | Correctly notes that Day 4 touches Day 3's service file; out-of-order merge produces false conflicts. |
| Handoff note | One paragraph, states unblocked path for the offshore team, names the three remaining triggers. |

**Two small notes (neither blocks merge):**

1. **§3 test totals**: the report says "Total `def test_`: 191" but "Week 1 baseline (27) + Week 2 additions (27) = 54" — which implies the 191 is the full-repo count (Month 1 + Month 2). Please confirm this is what you meant; it's fine either way, but the write-up reads as if there's a discrepancy. My read: Month 1 ended at 152, Month 2 W1 added 27 (=179), W2 added 27 (=206 collected runs, or fewer unique `def` if parametrized). **191 is plausible if some tests are parametrized or were consolidated.** Not a defect — just worth stating clearly in the merge PR.

2. **§6 verification summary placeholders** — `<count>` and `<runtime>` are unfilled. Fill these before opening the PR. The engineers who read this PR in three months will want the actual numbers.

**The Neon fresh-DB limitation deserves one sentence of context:** your CI already runs `alembic upgrade head` against a fresh `postgres:15-alpine` container on every push (from Month 1 Week 4 Day 1). That IS the fresh-DB test, running continuously. So the local "can't drop Neon" limitation is not a gap — it's covered by CI. Worth noting in the merge PR so nobody tries to "fix" it.

**Week 2 closed. All five branches ready for merge in the documented order.**

---

## 2. Week 3 Direction — Confirmed

You didn't explicitly answer the A/B/C question from my last message, so I'm proceeding with my **recommendation: Option A — Materials Curation Pipeline.** Rationale restated briefly:

- The `study_materials` table exists but has no workflow to add rows beyond the client fixture.
- Materials search is the MVP's #2 daily-value feature; it's inert without content.
- Prompt tuning (Option C) is premature until real student feedback exists — the current prompt isn't failing on anything measured yet.
- Push notifications (Option B) require a client, which the offshore team is still building.

**If you wanted B or C instead, say so now and I'll pivot.** Otherwise, Week 3 begins with materials curation.

### Week 3 arc (for context — Day 1 detailed below)

| Day | Theme |
|---|---|
| **D1** | **Admin CRUD on materials** — create / update / unapprove / delete, plus an admin listing that shows everything |
| D2 | Bulk import (CSV/JSON) with validation + dry-run |
| D3 | Module coverage dashboard — which modules have materials, which are starved |
| D4 | Search relevance upgrade — ranked results instead of `ILIKE` only |
| D5 | Week 3 coherence review |

Day 1 is the foundation; each subsequent day builds on it.

---

# Month 2, Week 3, Day 1 — Admin Materials Curation API

**To:** Lead Developer
**From:** Senior Systems Design & Architecture Engineer
**Date:** 16 September 2026
**Status:** Week 3 Day 1 Specification Active

---

## 0. Scope

Give admins (ADMIN / SUPERUSER) a complete CRUD surface over `study_materials` so content can be added, corrected, unapproved, or removed. This is the smallest possible surface that makes the materials feature *usable for real modules* — nothing more.

**In scope:** create, update, unapprove, delete, list-everything (including unapproved).
**Out of scope (later days):** bulk import, coverage analytics, relevance ranking, approval workflow with audit trail.

---

## 1. Technical Objectives

1. **Add the missing audit columns** to `study_materials`: `updated_at`, `created_by_user_id`.
2. **Add admin CRUD endpoints** — `POST /admin/materials`, `PATCH /admin/materials/{id}`, `DELETE /admin/materials/{id}`, `GET /admin/materials`.
3. **Enforce the same normalization rules** as student search: `module_code` uppercase, URL scheme check, sanitizer applied to text fields.
4. **Reuse the existing composite index** `ix_materials_module_type (module_code, resource_type, is_approved)` — no new index unless justified.
5. **Preserve the POPIA erasure invariant:** when a creator is hard-purged, their authored materials **survive** (materials are global content, not user content). Use `ondelete=SET NULL`.

---

## 2. Architectural Strategy

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      ADMIN MATERIALS SURFACE                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Route                             Role          Effect                  │
│  ──────────────────────────────    ─────────     ─────────────────────   │
│  POST   /admin/materials           ADMIN|SUPER   create (default         │
│                                                    is_approved=true)     │
│  PATCH  /admin/materials/{id}      ADMIN|SUPER   update any field        │
│                                                    (incl. unapprove)     │
│  DELETE /admin/materials/{id}      ADMIN|SUPER   hard delete             │
│                                                    (for mistakes only)   │
│  GET    /admin/materials           ADMIN|SUPER   list all (incl.         │
│                                                    unapproved), paginated│
│                                                                          │
│  Service: material_service.py (extended — same domain, admin verbs)      │
│  Auth:    require_role([ADMIN, SUPERUSER]) — existing dependency         │
│  Schema:  MaterialAdminCreate / MaterialAdminUpdate /                    │
│           MaterialAdminResponse                                          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                      DATA MODEL DELTA (migration 0009)                   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  study_materials                                                         │
│    + updated_at          TIMESTAMPTZ NOT NULL   (backfilled from         │
│                                                  created_at)             │
│    + created_by_user_id  UUID NULL              FK users.id              │
│                                                  ON DELETE SET NULL      │
│                                                                          │
│  Why SET NULL (not CASCADE):                                             │
│    Materials are global, non-PII content. If a SUPERUSER is hard-        │
│    purged under POPIA, their authored materials must NOT vanish —        │
│    they belong to the system, not the person. The FK nulls out;          │
│    the audit trail is preserved in the migration log.                    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                SOFT UNAPPROVE vs HARD DELETE                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Unapprove (PATCH { is_approved: false }):                               │
│    • Preferred operation for "this shouldn't show to students"           │
│    • Row survives; URL remains resolvable if someone has it cached       │
│    • Reversible                                                            │
│                                                                          │
│  Hard delete (DELETE):                                                   │
│    • Only for typo cleanup (wrong URL, duplicate, junk)                  │
│    • Irreversible                                                        │
│    • Documented as "rare; prefer PATCH unapprove"                        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Why extend `material_service.py` rather than create `admin_material_service.py`:** services in this codebase are grouped by **domain** (materials, academic, ai), not by role. Role gating is a router concern (`require_role`). Keeping one service file per domain preserves the pattern.

---

## 3. File Implementation Map

| File Path | Action | Purpose |
|---|---|---|
| `app/models/material.py` | **UPDATED** | Add `updated_at` + `created_by_user_id` |
| `alembic/versions/0009_...py` | **NEW** | Add both columns; backfill `updated_at` from `created_at`; `SET NULL` FK |
| `app/schemas/material.py` | **UPDATED** | `MaterialAdminCreate`, `MaterialAdminUpdate`, `MaterialAdminResponse` |
| `app/services/material_service.py` | **UPDATED** | `create_material`, `update_material`, `delete_material`, `list_materials_admin` |
| `app/api/v1/admin.py` | **UPDATED** | 4 new routes (all `require_role([ADMIN, SUPERUSER])`) |
| `docs/openapi.json` | **REGENERATED** | Drift gate will enforce |
| `tests/test_admin_materials_api.py` | **NEW** | ~12 tests |
| `scripts/curl_metrics.sh` (optional §11) | **NEW** | Convenience wrapper, if you want it now |

**No new packages.**

---

## 4. Step-by-Step Developer Guide

### Step 1: Model (`app/models/material.py`)

Add two columns:

```python
from datetime import UTC, datetime
import uuid
from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID

# inside StudyMaterial:

updated_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    default=lambda: datetime.now(UTC),
    onupdate=lambda: datetime.now(UTC),
    nullable=False,
)

created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
    UUID(as_uuid=True),
    ForeignKey("users.id", ondelete="SET NULL"),
    nullable=True,
)
```

Note: `created_by_user_id` is nullable because fixture-seeded materials have no creator.

### Step 2: Migration `0009`

The FK column is trivial; the `updated_at` column needs a **safe backfill** because existing rows have no value:

```python
def upgrade() -> None:
    # 1. Add updated_at as NULL first (existing rows have no value)
    op.add_column(
        "study_materials",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    # 2. Backfill from created_at — atomic, single UPDATE
    op.execute(
        "UPDATE study_materials SET updated_at = created_at WHERE updated_at IS NULL"
    )
    # 3. Now safe to enforce NOT NULL
    op.alter_column("study_materials", "updated_at", nullable=False)

    # 4. Add nullable creator FK with SET NULL
    op.add_column(
        "study_materials",
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_materials_created_by_user",
        "study_materials",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_materials_created_by_user", "study_materials", type_="foreignkey")
    op.drop_column("study_materials", "created_by_user_id")
    op.drop_column("study_materials", "updated_at")
```

**Why this three-step dance for `updated_at`:** adding a `NOT NULL` column to a table with rows requires a default. Postgres 11+ can do this in one ALTER with a default, but the default stays on the column forever, which is wrong. The three-step approach gives you a real value (from `created_at`), then enforces `NOT NULL` with no lingering default. Clean, reversible, no table rewrite beyond what's necessary.

### Step 3: Schemas (`app/schemas/material.py`)

```python
from typing import Literal
from pydantic import BaseModel, Field, field_validator, HttpUrl
from app.core.sanitizer import sanitize_string


class MaterialAdminCreate(BaseModel):
    module_code: str = Field(..., min_length=2, max_length=20)
    title: str = Field(..., min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    url: HttpUrl
    resource_type: Literal["YOUTUBE", "JOURNAL", "PDF", "ARTICLE"]
    quality_resolution: str = Field(default="360p", max_length=10)
    is_approved: bool = True

    @field_validator("module_code")
    @classmethod
    def normalize_module(cls, v: str) -> str:
        clean = sanitize_string(v)
        if not clean:
            raise ValueError("Invalid module code")
        return clean.upper()

    @field_validator("title", "description")
    @classmethod
    def sanitize_text(cls, v: str | None) -> str | None:
        if v is None:
            return None
        clean = sanitize_string(v)
        if not clean and v:
            raise ValueError("Invalid characters detected in text field")
        return clean


class MaterialAdminUpdate(BaseModel):
    """All fields optional — PATCH semantics."""
    title: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    url: HttpUrl | None = None
    resource_type: Literal["YOUTUBE", "JOURNAL", "PDF", "ARTICLE"] | None = None
    quality_resolution: str | None = Field(default=None, max_length=10)
    is_approved: bool | None = None

    @field_validator("title", "description")
    @classmethod
    def sanitize_text(cls, v: str | None) -> str | None:
        if v is None:
            return None
        clean = sanitize_string(v)
        if not clean and v:
            raise ValueError("Invalid characters detected in text field")
        return clean


class MaterialAdminResponse(BaseModel):
    id: uuid.UUID
    module_code: str
    title: str
    description: str | None
    url: str
    resource_type: str
    quality_resolution: str
    is_approved: bool
    created_by_user_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
```

**Why `HttpUrl`:** Pydantic validates the scheme, netloc, and shape. It returns a `Url` object — call `str(url)` when assigning to the model. This blocks `javascript:` schemes and malformed URLs at the schema layer.

### Step 4: Service Layer (`app/services/material_service.py`)

Add at the bottom of the file:

```python
import uuid
from datetime import UTC, datetime
from sqlalchemy.orm import Session
from app.models.material import StudyMaterial
from app.schemas.material import MaterialAdminCreate, MaterialAdminUpdate


class MaterialNotFoundError(Exception):
    """Raised when an admin targets a material ID that doesn't exist."""


def create_material(
    db: Session,
    admin_user_id: uuid.UUID,
    payload: MaterialAdminCreate,
) -> StudyMaterial:
    material = StudyMaterial(
        module_code=payload.module_code,
        title=payload.title,
        description=payload.description,
        url=str(payload.url),
        resource_type=payload.resource_type,
        quality_resolution=payload.quality_resolution,
        is_approved=payload.is_approved,
        created_by_user_id=admin_user_id,
    )
    db.add(material)
    db.commit()
    db.refresh(material)
    return material


def update_material(
    db: Session,
    material_id: uuid.UUID,
    payload: MaterialAdminUpdate,
) -> StudyMaterial:
    material = db.query(StudyMaterial).filter(StudyMaterial.id == material_id).first()
    if material is None:
        raise MaterialNotFoundError("Material not found")

    updates = payload.model_dump(exclude_unset=True)
    if "url" in updates and updates["url"] is not None:
        updates["url"] = str(updates["url"])

    for field, value in updates.items():
        setattr(material, field, value)

    db.commit()
    db.refresh(material)
    return material


def delete_material(db: Session, material_id: uuid.UUID) -> None:
    material = db.query(StudyMaterial).filter(StudyMaterial.id == material_id).first()
    if material is None:
        raise MaterialNotFoundError("Material not found")
    db.delete(material)
    db.commit()


def list_materials_admin(
    db: Session,
    module_code: str | None = None,
    is_approved: bool | None = None,
    resource_type: str | None = None,
    page: int = 1,
    size: int = 20,
) -> dict:
    page = max(1, page)
    size = max(1, min(size, 100))

    query = db.query(StudyMaterial)

    if module_code:
        query = query.filter(StudyMaterial.module_code == module_code.upper())
    if is_approved is not None:
        query = query.filter(StudyMaterial.is_approved == is_approved)
    if resource_type:
        query = query.filter(StudyMaterial.resource_type == resource_type)

    total = query.count()
    offset = (page - 1) * size
    items = (
        query.order_by(StudyMaterial.updated_at.desc())
        .offset(offset)
        .limit(size)
        .all()
    )
    pages = (total + size - 1) // size if total > 0 else 1

    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size,
        "pages": pages,
    }
```

**Why `exclude_unset=True` in update:** PATCH semantics — only touch fields the caller actually sent. This means `PATCH {"is_approved": false}` leaves every other field alone, which is what callers expect.

**Why `updated_at` is not manually set in `update_material`:** SQLAlchemy's `onupdate` lambda fires on commit for any changed row. The ORM handles it — don't fight the framework.

### Step 5: Router (`app/api/v1/admin.py`)

Add the four routes:

```python
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.api.deps import get_current_user, require_role
from app.core.roles import UserRole
from app.models.user import User
from app.schemas.academic import PaginatedResponse
from app.schemas.material import (
    MaterialAdminCreate,
    MaterialAdminUpdate,
    MaterialAdminResponse,
)
from app.services import material_service


@router.post(
    "/materials",
    response_model=MaterialAdminResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role([UserRole.ADMIN, UserRole.SUPERUSER]))],
)
def admin_create_material(
    payload: MaterialAdminCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return material_service.create_material(db, admin_user_id=current_user.id, payload=payload)


@router.patch(
    "/materials/{material_id}",
    response_model=MaterialAdminResponse,
    dependencies=[Depends(require_role([UserRole.ADMIN, UserRole.SUPERUSER]))],
)
def admin_update_material(
    material_id: uuid.UUID,
    payload: MaterialAdminUpdate,
    db: Session = Depends(get_db),
):
    try:
        return material_service.update_material(db, material_id, payload)
    except material_service.MaterialNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")


@router.delete(
    "/materials/{material_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role([UserRole.ADMIN, UserRole.SUPERUSER]))],
)
def admin_delete_material(
    material_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    try:
        material_service.delete_material(db, material_id)
    except material_service.MaterialNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")


@router.get(
    "/materials",
    response_model=PaginatedResponse[MaterialAdminResponse],
    dependencies=[Depends(require_role([UserRole.ADMIN, UserRole.SUPERUSER]))],
)
def admin_list_materials(
    module_code: str | None = Query(default=None, min_length=2, max_length=20),
    is_approved: bool | None = Query(default=None),
    resource_type: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    return material_service.list_materials_admin(
        db,
        module_code=module_code,
        is_approved=is_approved,
        resource_type=resource_type,
        page=page,
        size=size,
    )
```

### Step 6: Tests (`tests/test_admin_materials_api.py`)

Aim for **12 tests**, following the pattern from previous days:

```
1.  test_create_requires_admin                         — STUDENT → 403
2.  test_create_requires_auth                          — no token → 401
3.  test_create_succeeds_and_returns_201               — happy path
4.  test_create_normalizes_module_code                 — "inf154" stored as "INF154"
5.  test_create_rejects_invalid_url_scheme             — "javascript:alert(1)" → 422
6.  test_create_sanitizes_title                        — XSS payload stripped
7.  test_patch_updates_only_sent_fields                — PATCH {is_approved} leaves title
8.  test_patch_unapprove_hides_from_student_search     — end-to-end (create → unapprove → student search returns nothing)
9.  test_patch_rejects_unknown_material                — 404
10. test_delete_removes_material                       — 204, subsequent GET returns 404
11. test_list_shows_unapproved_to_admin                — student search hides, admin sees
12. test_list_pagination_bounded                       — size=999 → 422
```

The critical test is **#8** — it proves the entire reason for the day's existence: admin can hide content from students.

---

## 5. Time/Space Complexity Audit

| Component | Time | Space | Safeguard |
|---|---|---|---|
| `POST /admin/materials` | O(1) | O(1) | Single insert |
| `PATCH /admin/materials/{id}` | O(1) | O(1) | PK lookup + partial update |
| `DELETE /admin/materials/{id}` | O(1) | O(1) | PK lookup + delete |
| `GET /admin/materials` | O(log N + K) | O(K), K ≤ 100 | Filters lead with `module_code` → `ix_materials_module_type` serves module-scoped listings; unfiltered listings hit `updated_at DESC` — acceptable sort at current volume |
| Migration `0009` | O(N) one-time backfill | O(1) | Single `UPDATE`, no table rewrite beyond the necessary scan |

**New index?** No. The existing `(module_code, resource_type, is_approved)` composite serves the common admin query pattern ("show me unapproved materials for module X"). If unfiltered listings become slow at scale, revisit — not before.

**Confirm the sort is acceptable:** `ORDER BY updated_at DESC` with no index. At 100k materials, this is O(N log N) worst case. At current volume (< 10k), it's fine. Flag it as an open item for the scale review, not a Day 1 concern.

---

## 6. Security & Scale Guarantees

| Guarantee | Mechanism |
|---|---|
| **Role-gated** | `require_role([ADMIN, SUPERUSER])` on every route — students get 403 |
| **POPIA-safe deletion of creator** | FK `ondelete=SET NULL` — creator purged, material survives |
| **URL scheme validation** | Pydantic `HttpUrl` rejects non-HTTP schemes |
| **XSS/control-char sanitization** | Same sanitizer as student endpoints |
| **Module code normalization** | Uppercased on create; update path cannot change it (not in `MaterialAdminUpdate`) |
| **Bounded pagination** | `size ≤ 100`, `page ≥ 1` — both router and service enforce |
| **No PII in responses** | `MaterialAdminResponse` exposes `created_by_user_id` (a UUID, not an email) — no user PII |
| **Idempotent operations** | DELETE on missing id → 404 (not 500); PATCH with empty body → no-op success |
| **Update path cannot rename module_code** | Deliberately omitted from `MaterialAdminUpdate` — moving a material between modules is a data-correctness decision that should require an explicit recreate |

**Explicit non-guarantee:** admin actions are **not** logged to a separate audit table on Day 1. The `created_at` / `updated_at` timestamps + creator FK provide basic accountability. A full audit log is deferred (see §11 optional).

---

## 7. Acceptance Criteria

1. All four admin routes return **403** for STUDENT tokens; **401** for unauthenticated.
2. `POST /admin/materials` returns **201** with the created material.
3. `module_code` is uppercased before storage; lowercase input is accepted and normalized.
4. Invalid URL schemes (e.g., `javascript:`) are rejected with **422**.
5. `title` and `description` are sanitized (XSS payloads stripped).
6. `PATCH /admin/materials/{id}` updates **only the fields present** in the body; absent fields are left unchanged.
7. `PATCH` with `{"is_approved": false}` hides the material from `GET /materials/search` (student view) but keeps it visible in `GET /admin/materials`.
8. `DELETE /admin/materials/{id}` returns **204**; a subsequent GET to that id returns **404**.
9. `GET /admin/materials` supports `module_code`, `is_approved`, `resource_type` filters and returns a paginated envelope.
10. `GET /admin/materials?size=999` returns **422** (bounded).
11. Migration `0009` applies forward cleanly, backfills `updated_at` from `created_at` for existing rows, enforces `NOT NULL` afterward, and downgrades cleanly.
12. Alembic head = `0009`.
13. `docs/openapi.json` regenerated; drift gate `[PASS]`.
14. All existing tests pass; ~12 new admin material tests pass.
15. `ruff check app/ tests/ scripts/` clean.
16. **No new packages.**

---

## 8. Verification Steps

```bash
# 1. Migration
alembic upgrade head              # expect 0009
alembic downgrade -1              # reverses cleanly
alembic upgrade head
alembic current                   # 0009 (head)

# Offline SQL sanity
alembic upgrade 0008:0009 --sql | head -n 40

# 2. Lint + tests
ruff check app/ tests/ scripts/
pytest tests/test_admin_materials_api.py -v

# 3. Drift gate
python scripts/export_openapi.py > docs/openapi.json   # regenerate
python scripts/check_contract_drift.py                 # expect [PASS]

# 4. Smoke test (local, using fixture admin)
python scripts/seed_client_fixture.py
# (you'll need an admin; the create_admin.py script from Week 2 can create one)
python scripts/create_admin.py --email admin@varsitycompanion.test --role admin
# start server, get admin token, then:
curl -X POST http://127.0.0.1:8000/api/v1/admin/materials \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "module_code": "inf315",
    "title": "Systems Analysis Overview",
    "url": "https://www.youtube.com/watch?v=example",
    "resource_type": "YOUTUBE",
    "quality_resolution": "360p"
  }'
# expect: 201, module_code = "INF315"

# 5. Verify end-to-end unapprove → student invisibility
curl -X PATCH http://127.0.0.1:8000/api/v1/admin/materials/$MATERIAL_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_approved": false}'
# expect: 200, is_approved = false

# student search should now exclude it
curl "http://127.0.0.1:8000/api/v1/materials/search?module_code=INF315" \
  -H "Authorization: Bearer $STUDENT_TOKEN" | jq '.items | length'
# expect: fewer than before

# admin list should still show it
curl "http://127.0.0.1:8000/api/v1/admin/materials?module_code=INF315" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.items | length'
# expect: includes the unapproved material
```

---

## 9. Defect-Discovery Prompts

> Run it, don't just read it.

- **CREATE succeeds but student search can't find the new material** → `module_code` casing was stored wrong, or `is_approved` defaulted to `False` when you expected `True`. Inspect the DB row directly.
- **PATCH with empty body modifies the row** → `payload.model_dump()` was used instead of `model_dump(exclude_unset=True)`. Every field is now set to its default; the original values are lost. This is a silent data-loss bug — verify by PATCHing `{}` and comparing the row before/after.
- **PATCH accepts `module_code` changes** → the field leaked into `MaterialAdminUpdate`. It must not be there — moving materials between modules is a deliberate recreate, not an update.
- **DELETE returns 200 instead of 204** → missing `status_code=status.HTTP_204_NO_CONTENT`. FastAPI defaults to 200.
- **DELETE on missing id returns 500** → the service raised a generic exception instead of `MaterialNotFoundError`. The router must catch and translate to 404.
- **Migration fails on a DB that already has the columns** → you didn't use the three-step `updated_at` dance (add nullable → backfill → enforce NOT NULL). A naive `add_column(NOT NULL)` on a table with rows fails.
- **Migration downgrade leaves an orphan index** → you created `ix_materials_updated_at` in `upgrade` but didn't drop it in `downgrade`. Grep both functions for symmetry.
- **Admin list returns unapproved materials to student search** → the student search query lost its `is_approved == True` filter during a refactor. Grep `search_materials_paginated` for the filter; verify it's still there.
- **URL with `javascript:alert(1)` is accepted** → you stored `str(payload.url)` but the schema field is typed as `str` not `HttpUrl`. Change the schema type — Pydantic will reject the scheme.
- **Fixture user's materials disappear after a purge test** → FK is `CASCADE` instead of `SET NULL`. Check `ondelete` in the migration AND in the model. They must match.
- **`test_patch_unapprove_hides_from_student_search` passes but the manual smoke test fails** → the test mocks the student search; the manual test hits the real one. Remove the mock; integration tests must exercise real code paths (the "no mocks" discipline from Month 1).

---

## 10. Sign-Off Checklist

- [ ] `updated_at` + `created_by_user_id` added to `StudyMaterial`
- [ ] Migration `0009` applies forward + downgrade cleanly; `updated_at` backfilled from `created_at`
- [ ] FK `ondelete=SET NULL` (not `CASCADE`)
- [ ] `MaterialAdminCreate` / `Update` / `Response` schemas added
- [ ] Service functions added to `material_service.py`
- [ ] 4 admin routes in `admin.py`, all gated by `require_role([ADMIN, SUPERUSER])`
- [ ] `module_code` uppercased on create; not updatable
- [ ] `HttpUrl` schema type blocks non-HTTP schemes
- [ ] PATCH uses `exclude_unset=True`
- [ ] Admin listing paginated; `size ≤ 100`
- [ ] `docs/openapi.json` regenerated; drift gate `[PASS]`
- [ ] ~12 admin material tests pass
- [ ] Full suite: zero regressions
- [ ] `ruff check app/ tests/ scripts/` clean
- [ ] Alembic head = `0009`
- [ ] **No new packages**
- [ ] Branch: `month2/week3-day1-materials-admin` off `develop`

---

## 11. Optional Best Practices (Bundle or Defer — Your Call)

Following the pattern from Day 4 W2. My recommendations:

### Bundle (prevent correctness bugs)

**11.1 — Log admin mutations at INFO with actor + target.**
When an admin creates/updates/deletes a material, emit one line:
```
logger.info("material.admin.create actor=%s material_id=%s module=%s", admin_user_id, material.id, material.module_code)
```
Not an audit table — just a log line. Costs ~6 lines total. **Why bundle now:** the day introduces admin write surfaces for the first time; without a log line, "who added this material?" is unanswerable except by `git blame` on the seed script. The log is free; the audit table is not.

**11.2 — Guard test: student search always filters `is_approved=True`.**
Add one test that asserts `search_materials_paginated` excludes unapproved rows even when they exist. Fails loudly if a future refactor drops the filter. **Why bundle:** this is the single most important invariant of the whole day; a test for it is 5 lines.

### Defer (ergonomics only)

**11.3 — `scripts/curl_metrics.sh` (11.4 from W2 Day 4).** Now marginally more relevant, but still not blocking. Add when the founder starts reading metrics daily.

**11.4 — Admin audit table.** A separate `admin_actions` table with actor / action / target / timestamp. Real value, but genuinely deferrable until multiple admins exist.

**11.5 — Bulk import endpoint.** This is Day 2's scope. Don't bundle.

**My recommendation: bundle 11.1 and 11.2. Defer the rest.** Combined cost: ~15 lines of code + 1 test. Both prevent classes of bugs (unattributed changes; silently leaked unapproved content) that would be hard to detect after the fact.

---

## 12. What to Tell the Engineer

Send this blueprint as-is. Key points to highlight:

1. **One migration** (`0009`) with a **three-step `updated_at` dance** (add nullable → backfill → enforce NOT NULL). Do not shortcut this.
2. **FK must be `SET NULL`**, not `CASCADE` — materials are global content, not user content. This is a POPIA design decision, not a preference.
3. **`module_code` is not updatable** — deliberately. Moving materials between modules is a recreate, not a PATCH.
4. **`exclude_unset=True`** in the update path. This is the difference between "PATCH" and "PUT with defaults," and getting it wrong causes silent data loss.
5. **Regenerate `docs/openapi.json` before pushing** — the drift gate will fail otherwise.
6. **Test #8 (`test_patch_unapprove_hides_from_student_search`) is the day's purpose** — an end-to-end proof that admin can hide content from students. If only one test lands, it must be this one.

Engineer should branch as `month2/week3-day1-materials-admin` off `develop`, run the §8 verification, and submit the Day 1 report in the same structure as previous days.

---
