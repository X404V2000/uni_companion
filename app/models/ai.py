"""app/models/ai.py

PURPOSE
-------
SQLAlchemy ORM models for the AI Summary Engine (Month 2, Week 1):

- `UserAIQuota`      — per-user, per-day free-tier credit ledger.
- `AISummaryCache`   — per-user SHA-256 result cache (keyed on the sanitized
                       content + module code) so identical repeat requests
                       never reach the LLM.

SECURITY / SCALE (deviations from the blueprint, deliberate):
- Quota is enforced ATOMICALLY at the database layer (see ai_service), not by
  read-then-increment, so concurrent requests cannot overshoot the daily cap.
- The cache is PER-USER (carries user_id and a composite unique index on
  (user_id, content_hash)): one student's generated summary is never served to
  another, and no cross-tenant hash sharing occurs (POPIA posture). This
  intentionally trades a little storage for isolation.
"""
import uuid
from datetime import UTC, date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class UserAIQuota(Base):
    __tablename__ = "user_ai_quotas"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    usage_date: Mapped[date] = mapped_column(
        Date, nullable=False, default=lambda: datetime.now(UTC).date()
    )
    summaries_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    daily_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    __table_args__ = (
        # One ledger row per (user, day). The unique constraint is the
        # backbone of the atomic upsert in ai_service.
        Index("ix_user_quota_date", "user_id", "usage_date", unique=True),
    )

    def __repr__(self) -> str:
        return (
            f"<UserAIQuota user={self.user_id} date={self.usage_date} "
            f"used={self.summaries_used}/{self.daily_limit}>"
        )


class AISummaryCache(Base):
    __tablename__ = "ai_summary_caches"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    module_code: Mapped[str] = mapped_column(String(20), nullable=False)
    summary_text: Mapped[str] = mapped_column(Text, nullable=False)
    tokens_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    __table_args__ = (
        # Per-user cache: identical (module, content) for the SAME user hits
        # once; different users never share an entry.
        Index("ix_ai_cache_user_hash", "user_id", "content_hash", unique=True),
        Index("ix_ai_cache_user_module", "user_id", "module_code"),
    )

    def __repr__(self) -> str:
        return f"<AISummaryCache user={self.user_id} module={self.module_code}>"


class BriefDocument(Base):
    """An uploaded "brief" (assignment brief, lecture notes, past paper...).

    RAG ingestion target: the raw text is chunked into `BriefChunk` rows so the
    student can ask questions about their own document.

    SECURITY: scoped per user. `source_name`/`content` are user content and are
    never returned to another account. ON DELETE CASCADE means a POPIA
    right-to-erasure hard purge removes the student's briefs and chunks too.
    """

    __tablename__ = "brief_documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Human label shown in the UI (typically the uploaded file name).
    source_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Full extracted text (kept so we can re-chunk later without the original).
    content: Mapped[str] = mapped_column(Text, nullable=False)
    char_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (
        # Listing a user's briefs, newest first, is the only read pattern.
        Index("ix_brief_user_created", "user_id", "created_at"),
    )


class BriefChunk(Base):
    """One retrieval unit of a brief (a slice of the parent document).

    Retrieval is keyword-scored today; `embedding` is reserved so semantic
    retrieval can be switched on via config without a schema change.
    """

    __tablename__ = "brief_chunks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    brief_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("brief_documents.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Denormalised owner id so every retrieval query can filter by user without
    # a join, making cross-tenant leakage impossible by construction.
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # 0-based position of this chunk within the document (for citations/order).
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    # Reserved for semantic retrieval; NULL while keyword-only (the default).
    embedding: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_chunk_brief_ordinal", "brief_id", "ordinal"),
        Index("ix_chunk_user", "user_id"),
    )
