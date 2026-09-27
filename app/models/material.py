"""app/models/material.py

PURPOSE
-------
SQLAlchemy model for curated study materials (Month 2, Week 1, Day 2).

A "material" is a vetted, module-scoped study resource (pre-seeded YouTube
tutorials, open journals, PDFs, articles) surfaced by the retrieval-first
materials search engine. Materials are NOT owned by a single user (they are
shared, curator-approved resources), so there is no user_id FK here — instead
the API scopes reads by `module_code` + `is_approved`.

SCALE NOTE
----------
The composite index (module_code, resource_type, is_approved) makes the
primary "list materials for module X" query O(log N). Keyword search is kept
module-scoped (ILIKE within a module) so it never degrades to a full-table
scan — see material_service.py.
"""
import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

# Allowed resource types (kept in sync with the schema Literal).
RESOURCE_TYPES = ("YOUTUBE", "JOURNAL", "PDF", "ARTICLE")


class StudyMaterial(Base):
    __tablename__ = "study_materials"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    module_code: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    url: Mapped[str] = mapped_column(String(512), nullable=False)
    resource_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="YOUTUBE"
    )  # YOUTUBE, JOURNAL, PDF, ARTICLE
    quality_resolution: Mapped[str] = mapped_column(
        String(10), nullable=False, default="360p"
    )  # low-data flag
    is_approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
    # Nullable: fixture-seeded materials have no creator. ON DELETE SET NULL so
    # a POPIA hard-purge of the creator does NOT delete the material (materials
    # are global, non-PII content owned by the system, not the person).
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    __table_args__ = (
        Index("ix_materials_module_type", "module_code", "resource_type", "is_approved"),
        # Duplicate detection during bulk import filters on (module_code, url).
        # Without this, every row in an R-row import costs an O(N) scan, so the
        # whole import is O(R*N). With it the lookup is O(log N). Deliberately
        # NON-unique: the duplicate rule stays in the import layer until real
        # usage shows a DB constraint is safe. Created by migration 0011.
        Index("ix_materials_module_url", "module_code", "url"),
    )

    def __repr__(self) -> str:
        return f"<StudyMaterial id={self.id} module={self.module_code} type={self.resource_type}>"
