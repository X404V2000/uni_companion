"""app/api/v1/analytics.py

PURPOSE
-------
User-facing feedback capture (Month 2, Week 2, Day 3). The usage-event
recording itself is emitted server-side from the core-loop routes; this router
only exposes the user's own feedback submission surface.
"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.analytics import (
    ActivityResponse,
    FeedbackCreate,
    FeedbackResponse,
    ShareEventRequest,
)
from app.services import analytics_service

router = APIRouter(prefix="/analytics", tags=["Feedback"])


@router.post(
    "/feedback",
    response_model=FeedbackResponse,
    status_code=status.HTTP_201_CREATED,
)
def submit_feedback(
    payload: FeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a 1-5 usefulness rating (optional short comment)."""
    return analytics_service.record_feedback(
        db=db,
        user_id=current_user.id,
        rating=payload.rating,
        comment=payload.comment,
    )


@router.post(
    "/share",
    status_code=status.HTTP_204_NO_CONTENT,
)
def record_share(
    payload: ShareEventRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record a module share (client fired the OS share sheet). 204 — the
    client sent a signal and moved on; no body needed."""
    analytics_service.record_share(
        db=db,
        user_id=current_user.id,
        module_code=payload.module_code,
    )


@router.get(
    "/activity",
    response_model=ActivityResponse,
    status_code=status.HTTP_200_OK,
)
def get_my_activity(
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the current user's own recent activity (newest first).

    Strictly scoped to the authenticated user. `limit` is clamped in the
    service (1..50) so the response stays bounded.
    """
    return {
        "items": analytics_service.get_user_activity(
            db=db, user_id=current_user.id, limit=limit
        )
    }
