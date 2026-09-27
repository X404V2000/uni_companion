"""
app/services/purge_service.py

PURPOSE
-------
True physical erasure of soft-deleted accounts past the POPIA retention
window (Week 2, Day 5).

The Week-1 tombstone (is_active=False, deleted_at=now, credential scrubbed)
preserves evidence during the retention window; once `deleted_at` is older
than `popia_retention_days`, residual PII (email, full_name) is permanently
removed here.

DESIGN (consistent with app/services/user_service.py):
- Module-level function, framework-agnostic, takes an injected Session.
- Deterministic cutoff computed from settings unless explicitly overridden
  (useful for tests).
- Deletes candidates in a single transaction; returns the number erased.
- Logs only aggregate counts (no PII).
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User

logger = logging.getLogger(__name__)


def purge_expired_users(db: Session, retention_days: int | None = None) -> int:
    """Hard-delete soft-deleted users older than the retention window.

    Returns the number of rows permanently removed.
    """
    days = retention_days if retention_days is not None else settings.popia_retention_days
    cutoff = datetime.now(UTC) - timedelta(days=days)

    # NOTE: deleted_at and created_at/updated_at are timezone-aware; comparing
    # naive vs aware datetimes raises, so cutoff is timezone-aware here.
    expired_users = (
        db.query(User)
        .filter(User.is_active.is_(False))
        .filter(User.deleted_at.isnot(None))
        .filter(User.deleted_at <= cutoff)
        .all()
    )

    count = len(expired_users)
    if count == 0:
        logger.info("POPIA purge check completed: 0 candidates found.")
        return 0

    for user in expired_users:
        db.delete(user)
    db.commit()

    logger.info("POPIA hard-purge completed: %s record(s) permanently erased.", count)
    return count
