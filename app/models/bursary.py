"""app/models/bursary.py

PURPOSE
-------
SQLAlchemy model for bursaries: funding a South African student can apply for.

WHY THIS IS A SHARED TABLE, NOT PER-USER
----------------------------------------
A bursary is a fact about the world (NSFAS exists and closes on a date), not
something a student owns. Every student reads the same rows; nothing here is
scoped to a `user_id`. Matching happens at read time in
`bursary_service.py`, against the student's own profile - which means a bursary
added once is available to every student immediately, and a closed one can be
retired once rather than per account.

WHY EVERY LINK IS THE OFFICIAL PAGE
-----------------------------------
We store a short description and a URL. We do not copy the bursary's content,
because terms change and a stale copy is worse than no copy: a student reads a
deadline from us, misses the real one, and we caused it. The URL points at the
source of truth, so the student always sees the current words. A "wrong deadline
here costs a student a year" is the rule this table is designed around.

WHY THE MATCHING FIELDS ARE NULLABLE
------------------------------------
Most bursaries are open to everyone. A NULL means "no restriction", which is a
different statement from an empty list ("open to nobody"). Making the common
case the NULL case means seeding is simple and a missing field can never
silently exclude every student.
"""
import uuid
from datetime import UTC, date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

# Allowed study levels. Kept in sync with the schema Literal, the same way
# RESOURCE_TYPES is kept in sync in material.py.
LEVELS = ("undergraduate", "postgraduate")

# Institution kinds a bursary can be restricted to.
INSTITUTION_KINDS = ("university", "university_of_technology", "tvet")


class Bursary(Base):
    __tablename__ = "bursaries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # --- identity -----------------------------------------------------------
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    # The OFFICIAL application page. Not a link to our copy of anything.
    url: Mapped[str] = mapped_column(String(512), nullable=False)

    # --- matching rules (NULL = no restriction) -----------------------------
    # Lower-case search terms, e.g. ["computing", "engineering"].
    fields_of_study: Mapped[list | None] = mapped_column(JSON, nullable=True)
    levels: Mapped[list | None] = mapped_column(JSON, nullable=True)
    institutions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    min_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    citizen_only: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # --- dates --------------------------------------------------------------
    # Both nullable: some bursaries never publish a closing date, and inventing
    # one is exactly the failure this table exists to avoid.
    application_opens: Mapped[date | None] = mapped_column(Date, nullable=True)
    application_closes: Mapped[date | None] = mapped_column(Date, nullable=True)

    # --- lifecycle ----------------------------------------------------------
    # Soft retirement. A bursary that stopped running is marked inactive rather
    # than deleted, so historical references stay intact.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    __table_args__ = (
        # The match query filters on both of these every time it runs.
        Index("ix_bursaries_active_closes", "is_active", "application_closes"),
        # The seed script upserts on (name, provider), so this must be unique -
        # it is what makes re-running the seed idempotent instead of creating
        # duplicates every time.
        Index(
            "uq_bursaries_name_provider",
            "name",
            "provider",
            unique=True,
        ),
    )

    def __repr__(self) -> str:
        return f"<Bursary {self.name!r} provider={self.provider!r}>"
