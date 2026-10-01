"""app/api/v1/sync.py

PURPOSE
-------
Offline Sync endpoints (Month 2, Week 1, Day 3).

POST /api/v1/sync/push  — apply a batch of offline changes (LWW + guards).
GET  /api/v1/sync/pull  — return user-scoped records changed since `since`.

Both require a valid access token.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.sync import SyncPullResponse, SyncPushRequest
from app.services import analytics_service, sync_service

router = APIRouter(prefix="/sync", tags=["Offline Sync Core"])


@router.post("/push", status_code=status.HTTP_200_OK)
def push_offline_changes(
    payload: SyncPushRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply offline changes. Raises 403 on cross-tenant id/module violations
    (never mutates another user's rows)."""
    try:
        result = sync_service.process_sync_push(
            db=db, user_id=current_user.id, push_data=payload
        )
        analytics_service.record_event(
            db,
            current_user.id,
            "SYNC_PUSHED",
            has_consent=getattr(current_user, "_has_improvement_consent", False),
        )
        if payload.client_duration_ms is not None:
            analytics_service.record_duration(
                db,
                current_user.id,
                "SYNC_PUSH_DURATION",
                duration_ms=payload.client_duration_ms,
                has_consent=getattr(current_user, "_has_improvement_consent", False),
            )
        return result
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sync rejected: item belongs to another user.",
        ) from exc


@router.get("/pull", response_model=SyncPullResponse, status_code=status.HTTP_200_OK)
def pull_delta_changes(
    since: datetime | None = Query(default=None, description="UTC timestamp of last sync"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return records changed after `since` for offline caching."""
    return sync_service.process_sync_pull(db=db, user_id=current_user.id, since=since)
