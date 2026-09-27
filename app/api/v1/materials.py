"""app/api/v1/materials.py

PURPOSE
-------
Materials Search Engine endpoints (Month 2, Week 1, Day 2).

GET /api/v1/materials/search?module_code=...&q=...     keyword search
GET /api/v1/materials/modules/{module_code}            list by module

Both require a valid access token and return a bounded, paginated envelope
(reusing the Week-3 PaginatedResponse[T] for O(K) memory).
"""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.academic import PaginatedResponse
from app.schemas.material import IngestResult, MaterialResponse
from app.services import (
    analytics_service,
    material_ingest_service,
    material_service,
)

router = APIRouter(prefix="/materials", tags=["Study Materials"])


@router.get(
    "/search",
    response_model=PaginatedResponse[MaterialResponse],
    status_code=status.HTTP_200_OK,
)
def search_materials(
    module_code: str = Query(..., min_length=2, max_length=20),
    q: str | None = Query(default=None, max_length=100),
    resource_type: Literal["YOUTUBE", "JOURNAL", "PDF", "ARTICLE"] | None = Query(
        default=None
    ),
    # Result ordering. `Literal` makes FastAPI validate the value, so an
    # unknown sort returns 422 rather than silently falling back to a default -
    # a silent fallback would make a client's typo look like it worked.
    sort: Literal["relevance", "recent", "title"] = Query(default="relevance"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search curated, low-data study materials scoped to a module.

    Ranked by default: an exact title match outranks a title prefix, which
    outranks a title substring, which outranks a description match. The rule is
    deterministic and documented in `material_service._score_material`.
    """
    result = material_service.search_materials_paginated(
        db=db,
        module_code=module_code,
        query_str=q,
        resource_type=resource_type,
        sort=sort,
        page=page,
        size=size,
    )
    analytics_service.record_event(
        db, current_user.id, "MATERIALS_SEARCHED", module_code=module_code
    )
    return result


@router.get(
    "/modules/{module_code}",
    response_model=PaginatedResponse[MaterialResponse],
    status_code=status.HTTP_200_OK,
)
def list_module_materials(
    module_code: str,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all approved materials for a module."""
    return material_service.list_materials_for_module(
        db=db, module_code=module_code, page=page, size=size
    )


@router.post(
    "/modules/{module_code}/ingest",
    response_model=IngestResult,
    status_code=status.HTTP_200_OK,
)
def ingest_module_resources(
    module_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Find and store real resources for one of the caller's own modules.

    The student types a module in themselves (never auto-filled); this endpoint
    only goes and finds resources FOR that module. It accepts no URL, so the
    server never fetches a destination supplied by the caller.

    Returns 404 when the module is not the caller's, and 429 when a fetch for
    the same module is already running (protects the upstream APIs).
    """
    try:
        return material_ingest_service.ingest_for_module(
            db=db, user_id=current_user.id, module_code=module_code
        )
    except material_ingest_service.ModuleNotFoundForUserError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except material_ingest_service.IngestBusyError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)
        ) from exc
