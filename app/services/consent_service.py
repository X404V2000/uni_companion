"""app/services/consent_service.py

POPIA consent lifecycle: grant, withdraw, read current state, read history.

DESIGN
------
Current state for a (user_id, purpose) pair is the row with the latest
`recorded_at`. Grant and withdrawal are BOTH rows, so the full sequence is
preserved. That is the whole reason this is a table rather than a boolean: a
boolean shows the present but loses the fact that a withdrawal ever happened,
and POPIA may require you to demonstrate that a withdrawal was honoured.

Withdrawal also deletes the user's Category B data immediately. No grace
period - when a user turns the switch off, the expectation is that the data
stops being held, not merely that it stops growing. Being more generous than
the law requires here costs almost nothing and removes an argument.
"""
from __future__ import annotations

import logging
import uuid

from sqlalchemy.orm import Session

from app.models.analytics import ImprovementSignal, UsageEvent, UserConsent

logger = logging.getLogger(__name__)

PURPOSE_PRODUCT_IMPROVEMENT = "product_improvement"

# Bump when the privacy notice text changes. Old consents stay attributable to
# the version the user actually agreed to.
CURRENT_POLICY_VERSION = "1.0"

# Where a consent decision can come from. Constrained here AND by a CHECK
# constraint in migration 0012, so an unexpected source cannot be recorded even
# if a future caller forgets to validate.
VALID_SOURCES = ("onboarding", "settings")


class ConsentError(Exception):
    """Raised for an invalid consent operation (e.g. an unknown source)."""


def has_consent(
    db: Session,
    user_id: uuid.UUID,
    purpose: str = PURPOSE_PRODUCT_IMPROVEMENT,
) -> bool:
    """True if the user's latest consent row for `purpose` is a grant.

    One indexed lookup. Called once per authenticated request (cached on the
    user object by get_current_user), never per analytics event.
    """
    row = (
        db.query(UserConsent.granted)
        .filter(
            UserConsent.user_id == user_id,
            UserConsent.purpose == purpose,
        )
        .order_by(UserConsent.recorded_at.desc())
        .first()
    )
    # No row at all means no consent was ever given. Absence is not consent.
    return bool(row and row.granted)


def current_state(
    db: Session,
    user_id: uuid.UUID,
    purpose: str = PURPOSE_PRODUCT_IMPROVEMENT,
) -> UserConsent | None:
    """The latest consent row for (user_id, purpose), or None if never set."""
    return (
        db.query(UserConsent)
        .filter(
            UserConsent.user_id == user_id,
            UserConsent.purpose == purpose,
        )
        .order_by(UserConsent.recorded_at.desc())
        .first()
    )


def history(
    db: Session,
    user_id: uuid.UUID,
    purpose: str = PURPOSE_PRODUCT_IMPROVEMENT,
) -> list[UserConsent]:
    """Full consent history for (user_id, purpose), newest first."""
    return (
        db.query(UserConsent)
        .filter(
            UserConsent.user_id == user_id,
            UserConsent.purpose == purpose,
        )
        .order_by(UserConsent.recorded_at.desc())
        .all()
    )


def grant(
    db: Session,
    user_id: uuid.UUID,
    source: str,
    policy_version: str = CURRENT_POLICY_VERSION,
    purpose: str = PURPOSE_PRODUCT_IMPROVEMENT,
) -> UserConsent:
    """Record a consent grant.

    Always appends a row, even if consent is already granted, so the history
    reflects that the user re-affirmed it (and against which policy version).
    """
    if source not in VALID_SOURCES:
        raise ConsentError(f"Invalid consent source: {source!r}")

    row = UserConsent(
        user_id=user_id,
        purpose=purpose,
        granted=True,
        policy_version=policy_version,
        source=source,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info("consent granted user=%s source=%s", user_id, source)
    return row


def withdraw(
    db: Session,
    user_id: uuid.UUID,
    source: str,
    purpose: str = PURPOSE_PRODUCT_IMPROVEMENT,
) -> UserConsent:
    """Record a withdrawal AND delete the user's Category B data.

    Both happen in one transaction: either the withdrawal is recorded and the
    data is gone, or neither happened. A withdrawal recorded without the delete
    would leave data we have promised not to hold.

    Note the deletion is scoped to Category B (usage_events and
    improvement_signals). The `user_consents` rows are deliberately NOT deleted
    - the withdrawal record is the audit evidence.
    """
    if source not in VALID_SOURCES:
        raise ConsentError(f"Invalid consent source: {source!r}")

    row = UserConsent(
        user_id=user_id,
        purpose=purpose,
        granted=False,
        policy_version=CURRENT_POLICY_VERSION,
        source=source,
    )
    db.add(row)

    deleted_events = (
        db.query(UsageEvent)
        .filter(UsageEvent.user_id == user_id)
        .delete(synchronize_session=False)
    )
    deleted_signals = (
        db.query(ImprovementSignal)
        .filter(ImprovementSignal.user_id == user_id)
        .delete(synchronize_session=False)
    )

    db.commit()
    db.refresh(row)
    logger.info(
        "consent withdrawn user=%s source=%s purged events=%d signals=%d",
        user_id,
        source,
        deleted_events,
        deleted_signals,
    )
    return row
