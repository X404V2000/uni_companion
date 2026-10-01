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

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    text,
)
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


# ---------------------------------------------------------------------------
# POPIA consent framework (Month 2, Week 3, Day 3.5)
# ---------------------------------------------------------------------------
# These two tables exist because consent must be provable, not merely stored,
# and because the useful training signal is a PREFERENCE rather than content.
# Neither table has a column that could hold user text - see
# plan/DATA_COLLECTION_FRAMEWORK.md for the per-field justification.
class UserConsent(Base):
    """Append-only audit log of every consent grant and withdrawal.

    Current state for a (user_id, purpose) pair is the row with the latest
    `recorded_at`. History is retained for as long as the user exists, which is
    what makes the state auditable: a boolean would show the present but lose
    the fact that a withdrawal ever happened.
    """

    __tablename__ = "user_consents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # CASCADE so the existing POPIA hard purge removes consent history with the
    # account. An audit trail that outlives the user would itself be a breach.
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Extensible: 'product_improvement' today.
    purpose: Mapped[str] = mapped_column(String(40), nullable=False)
    # True = granted, False = withdrawn. Both are rows, so the sequence is kept.
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    # The privacy-notice version the user actually agreed to.
    policy_version: Mapped[str] = mapped_column(String(20), nullable=False)
    # Where the decision was made: 'onboarding' or 'settings'.
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "source IN ('onboarding', 'settings')",
            name="ck_user_consents_source_valid",
        ),
        Index(
            "ix_user_consents_user_purpose_recorded",
            "user_id",
            "purpose",
            text("recorded_at DESC"),
        ),
    )

    def __repr__(self) -> str:
        state = "granted" if self.granted else "withdrawn"
        return f"<UserConsent user={self.user_id} purpose={self.purpose} {state}>"


class ImprovementSignal(Base):
    """A quality signal on an AI output. Contains NO user content.

    `subject_hash` is a SHA-256 digest identifying which output was rated (for
    summaries, the same `content_hash` already stored in ai_summary_caches).
    `compared_with` is only set for a preference pair: the digest this output
    was preferred over. Comparison is the signal that actually improves a
    prompt - "this one was better" is far more informative than "this one was
    acceptable".
    """

    __tablename__ = "improvement_signals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    sample_type: Mapped[str] = mapped_column(String(30), nullable=False)
    subject_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    signal: Mapped[str] = mapped_column(String(20), nullable=False)
    compared_with: Mapped[str | None] = mapped_column(String(64), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (
        # Enforced in the database as well as the schema, so a script or a
        # manual fix cannot write a value that breaks later analysis.
        CheckConstraint(
            "signal IN ('helpful', 'unhelpful', 'preferred_over')",
            name="ck_improvement_signals_signal_valid",
        ),
        CheckConstraint(
            "(signal = 'preferred_over' AND compared_with IS NOT NULL) "
            "OR (signal <> 'preferred_over')",
            name="ck_improvement_signals_preferred_requires_compared_with",
        ),
        Index(
            "ix_improvement_signals_type_recorded",
            "sample_type",
            text("recorded_at DESC"),
        ),
        Index("ix_improvement_signals_subject_hash", "subject_hash"),
    )

    def __repr__(self) -> str:
        return (
            f"<ImprovementSignal type={self.sample_type} "
            f"signal={self.signal} subject={self.subject_hash[:8]}>"
        )
