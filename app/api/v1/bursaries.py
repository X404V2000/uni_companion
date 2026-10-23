"""app/api/v1/bursaries.py

PURPOSE
-------
Read-only endpoints for bursary recommendations.

WHY THIS ROUTER IS PURELY READ-ONLY
-----------------------------------
A bursary is curated content, not student data. Students never create, edit or
delete one, so there is no write surface to secure, abuse or get wrong. Keeping
it read-only means the worst a bug here can do is show the wrong list - it cannot
corrupt anything, which is the property that makes this feature safe to ship on
a weekend.

RATE LIMITING
-------------
30/minute per client. The matching is a single indexed query over a few dozen
rows, so this is generous for a human and stops a script from hammering the free
instance, which sleeps when idle and is shared with every other endpoint.
"""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rate_limiter import limiter
from app.db.session import get_db
from app.models.bursary import Bursary
from app.models.user import User
from app.schemas.bursary import BursaryMatch, BursaryPage
from app.services import bursary_service

router = APIRouter(prefix="/bursaries", tags=["Bursaries"])


def _to_match(bursary, score: int, reasons: list[str], today) -> BursaryMatch:
    days_left = None
    if bursary.application_closes is not None:
        # Computed here, from the same clock the ranking used - see the note in
        # app/schemas/bursary.py about device clocks.
        days_left = (bursary.application_closes - today).days
    return BursaryMatch(
        id=bursary.id,
        name=bursary.name,
        provider=bursary.provider,
        description=bursary.description,
        url=bursary.url,
        closes_on=bursary.application_closes,
        opens_on=bursary.application_opens,
        days_left=days_left,
        score=score,
        match_reasons=reasons,
    )


@router.get(
    "/matches",
    response_model=BursaryPage,
    status_code=status.HTTP_200_OK,
    summary="Bursaries this student can apply for",
    description=(
        "Returns bursaries the caller is eligible for, best match first. "
        "Closed bursaries and bursaries the student cannot apply for are "
        "excluded entirely rather than ranked last. Each item carries "
        "`match_reasons` explaining why it is there."
    ),
)
@limiter.limit("30/minute")
def list_matches(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BursaryPage:
    today = date.today()
    ranked = bursary_service.matches_for_user(db, current_user, today=today)
    items = [_to_match(b, s, r, today) for b, s, r in ranked]
    return BursaryPage(items=items, total=len(items))


@router.get(
    "/{bursary_id}",
    response_model=BursaryMatch,
    status_code=status.HTTP_200_OK,
    summary="One bursary",
)
@limiter.limit("60/minute")
def get_bursary(
    request: Request,
    bursary_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BursaryMatch:
    bursary = db.query(Bursary).filter(Bursary.id == bursary_id).first()
    if bursary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Bursary not found"
        )

    today = date.today()
    # Score it for THIS caller so the detail view agrees with the list view.
    # Returning a raw row instead would show "0 matches" on a bursary the
    # student reached because it scored 4 - an inconsistency a user notices.
    value, reasons = bursary_service.score(bursary, current_user, today)
    return _to_match(bursary, value, reasons, today)
