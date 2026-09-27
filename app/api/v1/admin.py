"""
app/api/v1/admin.py

PURPOSE
-------
Administrative operations gated by RBAC (Week 2, Day 5).

The purge endpoint triggers the POPIA hard-purge worker. Access is restricted
to ADMIN and SUPERUSER via the require_role() dependency so a leaked student
credential can never invoke mass data erasure.
"""
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.core.rate_limiter import limiter
from app.core.roles import UserRole
from app.db.session import get_db
from app.models.user import User
from app.schemas.academic import PaginatedResponse
from app.schemas.analytics import MetricsResponse
from app.schemas.material import (
    CoverageResponse,
    ImportReport,
    MaterialAdminCreate,
    MaterialAdminResponse,
    MaterialAdminUpdate,
)
from app.services import analytics_service, material_import_service, material_service
from app.services.purge_service import purge_expired_users

router = APIRouter(prefix="/admin", tags=["Admin"])


class PurgeResponse(BaseModel):
    message: str
    purged_count: int


@router.post(
    "/purge-deleted-users",
    response_model=PurgeResponse,
    status_code=status.HTTP_200_OK,
    summary="Purge soft-deleted accounts past eligibility date",
    dependencies=[Depends(require_role([UserRole.ADMIN, UserRole.SUPERUSER]))],
)
@limiter.limit("5/minute")
def trigger_popia_purge(request: Request, db: Session = Depends(get_db)):
    """Manually trigger physical erasure of expired soft-deleted accounts."""
    purged = purge_expired_users(db)
    return PurgeResponse(
        message=f"Purge complete. Permanently deleted {purged} record(s).",
        purged_count=purged,
    )


@router.get(
    "/metrics",
    response_model=MetricsResponse,
    status_code=status.HTTP_200_OK,
    summary="Aggregate product usage metrics (no PII)",
    dependencies=[Depends(require_role([UserRole.ADMIN, UserRole.SUPERUSER]))],
)
def get_metrics(
    request: Request,
    days: int = Query(default=7, ge=1, le=90),
    db: Session = Depends(get_db),
):
    """Daily/weekly usage readout: WAU, summaries, cache hit rate, cost."""
    return analytics_service.get_metrics(db, days=days)

@router.post(
    "/materials",
    response_model=MaterialAdminResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Admin: create a study material",
    dependencies=[Depends(require_role([UserRole.ADMIN, UserRole.SUPERUSER]))],
)
def admin_create_material(
    payload: MaterialAdminCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a material (default is_approved=True)."""
    return material_service.create_material(
        db, admin_user_id=current_user.id, payload=payload
    )


@router.get(
    "/materials/coverage",
    response_model=CoverageResponse,
    status_code=status.HTTP_200_OK,
    summary="Admin: materials coverage by module, including starved modules",
    dependencies=[Depends(require_role([UserRole.ADMIN, UserRole.SUPERUSER]))],
)
def admin_materials_coverage(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Read-only coverage report over the global materials library.

    DECLARATION ORDER MATTERS: this route is declared ABOVE
    `/materials/{material_id}`. FastAPI matches routes in declaration order, so
    if the dynamic route came first, `/materials/coverage` would be captured as
    `material_id="coverage"` and fail UUID validation with a 422 - a confusing
    error for what is really "the static route is in the wrong place".

    Both lists are independently bounded by `size` (max 100), so the response
    stays small however many modules exist.
    """
    return material_service.get_materials_coverage(db, page=page, size=size)


@router.patch(
    "/materials/{material_id}",
    response_model=MaterialAdminResponse,
    status_code=status.HTTP_200_OK,
    summary="Admin: update or unapprove a material",
    dependencies=[Depends(require_role([UserRole.ADMIN, UserRole.SUPERUSER]))],
)
def admin_update_material(
    material_id: uuid.UUID,
    payload: MaterialAdminUpdate,
    db: Session = Depends(get_db),
):
    """PATCH semantics — only sent fields are changed."""
    try:
        return material_service.update_material(db, material_id, payload)
    except material_service.MaterialNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Material not found"
        ) from exc


@router.delete(
    "/materials/{material_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Admin: hard-delete a material (rare; prefer unapprove)",
    dependencies=[Depends(require_role([UserRole.ADMIN, UserRole.SUPERUSER]))],
)
def admin_delete_material(
    material_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    try:
        material_service.delete_material(db, material_id)
    except material_service.MaterialNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Material not found"
        ) from exc


@router.get(
    "/materials",
    response_model=PaginatedResponse[MaterialAdminResponse],
    status_code=status.HTTP_200_OK,
    summary="Admin: list all materials (incl. unapproved), paginated",
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


@router.post(
    "/materials/import",
    response_model=ImportReport,
    status_code=status.HTTP_200_OK,
    summary="Admin: bulk-import materials from CSV or JSON (with dry-run)",
    dependencies=[Depends(require_role([UserRole.ADMIN, UserRole.SUPERUSER]))],
)
@limiter.limit("10/minute")
async def admin_import_materials(
    request: Request,
    dry_run: bool = Query(default=False),
    on_duplicate: Literal["update", "skip", "fail"] = Query(default="update"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-import study_materials from CSV or JSON.

    - Dry-run (`?dry_run=true`) validates + reports WITHOUT writing anything.
    - Commit (default) applies all non-rejected rows in ONE transaction.

    Content-Type must be `text/csv` or `application/json`. Max 500 rows per
    request and a 1 MB body cap are enforced here (defence in depth: the
    request-size middleware grants this route a matching 1 MB exemption;
    every other route keeps the global 10 KB guard).

    Duplicate is defined as `(module_code, url)`. `on_duplicate` controls
    behaviour: `update` (default), `skip`, or `fail` (all-or-nothing 409).

    Registered as `async` because the raw body must be read directly
    (`await request.body()`) to honour both the Content-Type router and the
    explicit 1 MB cap BEFORE FastAPI/Pydantic parsing.
    """
    content_type = request.headers.get("content-type", "")
    content = await request.body()

    # Belt-and-braces: the middleware also caps this path at 1 MB, but the
    # handler re-checks so the limit holds even if middleware order changes.
    if len(content) > material_import_service.MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Import body exceeds 1 MB")

    # Parse (format errors are whole-request failures -> 422).
    try:
        rows = material_import_service.parse_payload(content_type, content)
    except material_import_service.ImportFormatError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Row cap, checked BEFORE validation/planning (fail fast, no DB work).
    if len(rows) > material_import_service.MAX_ROWS:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Too many rows: {len(rows)} "
                f"(max {material_import_service.MAX_ROWS})"
            ),
        )

    # Plan (shared by dry-run and commit). No writes happen here.
    plan = material_import_service.plan_import(db, rows, on_duplicate=on_duplicate)

    # All-or-nothing strict mode: any duplicate -> refuse the whole batch.
    if on_duplicate == "fail" and any(
        d.action == "rejected_invalid"
        and d.error
        and d.error.startswith("duplicate found")
        for d in plan.decisions
    ):
        raise HTTPException(
            status_code=409, detail="Duplicate rows found with on_duplicate=fail"
        )

    # The ONLY difference between modes: commit applies the plan + commits the
    # transaction. Dry-run purposefully skips both.
    if not dry_run:
        try:
            material_import_service.apply_plan(
                db, plan, admin_user_id=current_user.id
            )
            db.commit()
        except Exception:
            # Guarantee atomicity: any failure rolls back EVERY row.
            db.rollback()
            raise

    report = material_import_service.build_report(plan, dry_run=dry_run)
    material_import_service.log_import(
        actor_id=current_user.id,
        dry_run=dry_run,
        total_rows=report.total_rows,
        created=report.created,
        updated=report.updated,
        rejected=report.rejected_invalid,
    )
    return report
