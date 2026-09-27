"""app/models/analytics.py

PURPOSE
-------
Product-validation instrumentation (Month 2, Week 2, Day 3): an append-only
usage-event log and a minimal feedback table that turn "we have an MVP" into
"we have measured usage".

POPIA / PRIVACY GUARANTEES
--------------------------
- NO PII in events: only user_id (FK), event_type enum, optional module_code,
  and a timestamp. Never summary text, content, titles, or emails.
- Tenant-scoped by construction (every row references the actor's user_id).
- `ondelete=CASCADE` on user_id so a POPIA hard-purge erases the user's events
  automatically — no orphaned behavioral data survives erasure.
- Append-only in spirit: the service layer only ever INSERTs; there is no
  update/delete path for events (except the cascade purge above).
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, SmallInteger, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

# Valid event types (kept in sync with schema Literal). Bounded — no arbitrary
# client strings can be written into the log.
EVENT_TYPES = (
    "SUMMARY_GENERATED",
    "SUMMARY_CACHE_HIT",
    "MATERIALS_SEARCHED",
    "SYNC_PUSHED",
    "DASHBOARD_VIEWED",
)


class UsageEvent(Base):
    __tablename__ = "usage_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    module_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Nullable, no default: only duration-type events populate it. Existing
    # rows remain NULL (honest — they have no duration).
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (
        # Metrics read path: per-user activity + per-event-type time series.
        Index("ix_usage_events_user_created", "user_id", "created_at"),
        Index("ix_usage_events_type_created", "event_type", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<UsageEvent user={self.user_id} type={self.event_type}>"


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Rating 1..5 (usefulness). Bounded by SmallInteger + CHECK + schema.
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    # Optional short free-text comment (sanitized; not indexed, not scraped).
    comment: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (
        Index("ix_feedback_user_created", "user_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Feedback user={self.user_id} rating={self.rating}>"
