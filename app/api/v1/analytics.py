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
    ConsentHistoryEntry,
    ConsentHistoryResponse,
    ConsentRequest,
    ConsentState,
    FeedbackCreate,
    FeedbackResponse,
    ShareEventRequest,
)
from app.services import analytics_service, consent_service

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
        has_consent=getattr(current_user, "_has_improvement_consent", False),
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


# ---------------------------------------------------------------------------
# POPIA consent (Month 2, Week 3, Day 3.5)
# ---------------------------------------------------------------------------
@router.post("/consent", response_model=ConsentState, status_code=status.HTTP_200_OK)
def set_consent(
    payload: ConsentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Grant or withdraw consent to product-improvement data collection.

    Granting appends a consent row. Withdrawing appends a row AND deletes the
    user's Category B data (usage events, improvement signals) in the same
    transaction - either both happen or neither does. A withdrawal recorded
    without the delete would leave us holding data we have promised to drop.
    """
    if payload.granted:
        consent_service.grant(db, user_id=current_user.id, source=payload.source)
    else:
        consent_service.withdraw(db, user_id=current_user.id, source=payload.source)

    state = consent_service.current_state(db, current_user.id)
    return ConsentState(
        granted=bool(state and state.granted),
        policy_version=state.policy_version if state else None,
        updated_at=state.recorded_at if state else None,
    )


@router.get("/consent", response_model=ConsentState, status_code=status.HTTP_200_OK)
def read_consent(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Read the current consent state. Read-only - never mutates."""
    state = consent_service.current_state(db, current_user.id)
    return ConsentState(
        granted=bool(state and state.granted),
        policy_version=state.policy_version if state else None,
        updated_at=state.recorded_at if state else None,
    )


@router.get(
    "/consent/history",
    response_model=ConsentHistoryResponse,
    status_code=status.HTTP_200_OK,
)
def read_consent_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the append-only consent audit trail, newest first.

    This endpoint is what makes the consent state PROVABLE rather than merely
    stored: it shows every grant and withdrawal with its timestamp, policy
    version and source. A boolean column could not answer "when did they
    withdraw?" - this can.
    """
    rows = consent_service.history(db, current_user.id)
    return ConsentHistoryResponse(
        entries=[
            ConsentHistoryEntry(
                granted=r.granted,
                policy_version=r.policy_version,
                source=r.source,
                recorded_at=r.recorded_at,
            )
            for r in rows
        ]
    )
