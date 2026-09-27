"""
models/user.py

PURPOSE
-------
Defines the User table, the single most important table in the whole
app, since almost everything else (deadlines, resources, opportunities)
will eventually reference a user by ID.

This file ONLY defines the database SHAPE (columns, types). It does NOT
contain signup/login logic, that's Wednsday and Thursday's work. Today
is purely "what does a user record look like in Postgres."
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.roles import UserRole, role_check_constraint
from app.db.session import Base


class User(Base):
    """
    Represents one row in the "users" table. Every attribute below with
    a 'mapped_column(...)' becomes an actual column in Postgres.
    """

    ## The actual table name in Postgres. Explicit rather than relying on
    ## SQLAlchemy's auto-naming, so it's always obvious what to look for
    ## if you ever inspect the database directly.
    __tablename__ = "users"

    ## Table-level constraints:
    ## - role CHECK: only known UserRole values may be stored.
    __table_args__ = (role_check_constraint("role"),)

    ##-----------------------------------------------------------------------
    ## PRIMARY KEY, using a UUID instead of simple auto-incrementing
    ## integer (1, 2, 3...) is a deliberate security choice: sequential
    ## integer IDs let anyone guess how many users you have, and let an
    ## attacker enumarate user IDs (e.g., trying /users/1, /users/2, ...).
    ## A UUID is unguessable, which closes that off entirely.
    ##-----------------------------------------------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
            UUID(as_uuid=True),
            primary_key=True,
            default=uuid.uuid4, ##Generated automatically for every new user.
        )

    ##-----------------------------------------------------------------------
    ## CORE IDENTITY FIELDS
    ##-----------------------------------------------------------------------
    email: Mapped[str] = mapped_column(
            String(255),
            unique=True,    ## The database itself refuses two users with the
                            ## same email, a second layer of defense beyond
                            ## whatever we check in application code later.
            index=True,     ## Makes looks by email (e.g., during login) fast.
            nullable=False,
        )

    ## We NEVER store a plaintext password. This column holds the output
    ## of bcrypt hashing (built Wednesday), a one-way scambled version
    ## that can be verified but not reversed back into the real password.
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)

    full_name: Mapped[str] = mapped_column(String(255), nullable=False)

    ##-----------------------------------------------------------------------
    ## ACADEMIC PROFILE FIELDS, nullable becuase a user might complete
    ## signup before filling in their full academic details. These power
    ## the opportunity-matching feature later (field of study + year).
    ##-----------------------------------------------------------------------
    university: Mapped[str | None] = mapped_column(String(255), nullable=True)
    field_of_study: Mapped[str | None] = mapped_column(String(255), nullable=True)
    year_of_study: Mapped[int | None] = mapped_column(Integer, nullable=True)

    ##-----------------------------------------------------------------------
    ## LEGAL CONSENT FIELDS (Terms + Privacy Policy per SETUP_DAY3 spec)
    ##
    ## We store SEPARATE version strings for terms and privacy policy.
    ## This lets us answer "did this user agree to the CURRENT version?"
    ## for each document independently.
    ##
    ## SECURITY & COMPLIANCE NOTES:
    ## - Both fields are NOT NULL: a user CANNOT sign up without
    ##   agreeing to BOTH documents.
    ## - We store version strings (e.g. "1.0") NOT full URLs. The actual
    ##   legal URLs live in frontend config / env vars and can change
    ##   without schema changes.
    ## - accepted_at gives us a timestamp for audit trail purposes.
    ##-----------------------------------------------------------------------
    terms_version: Mapped[str] = mapped_column(String(20), nullable=False)
    privacy_version: Mapped[str] = mapped_column(String(20), nullable=False)

    ## Recorded at the moment consent is captured (signup).
    accepted_at: Mapped[datetime] = mapped_column(
            DateTime(timezone=True),
            default=lambda: datetime.now(UTC),
            nullable=False,
        )

    ##-----------------------------------------------------------------------
    ## ACCOUNT STATE + AUDIT TIMESTAMP
    ##-----------------------------------------------------------------------
    ## Lets us deactivate an aacount (e.g., suspected fraud, under review)
    ## WITHOUT deleting it, important because immediate delection could
    ## destroy evidence needed for the fruad/security work planned for
    ## Week 2. Deletion (POPIA right-to-erasure) is a separate, deliberate
    ## action, built Friday
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    ## WEEK 2 DAY 3 (RBAC): authorization tier.
    ## Stored as a plain VARCHAR enforced by a CHECK constraint (never a
    ## Postgres native ENUM) so future role additions are additive. The
    ## server-side default backfills existing rows to STUDENT on migration.
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default=UserRole.STUDENT.value,
        default=UserRole.STUDENT.value,
        index=False,
    )

    ## DAY 5 (POPIA right-to-delete baseline):
    ## Timestamp marking a SOFT-DELETE tombstone. NULL means "never deleted".
    ## Deleting an account sets this + is_active=False immediately (revocable
    ## in the DB, but invisible to authentication). A scheduled hard-purge
    ## (Week 2) performs the actual row removal for true POPIA erasure.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    ## 'default=' sets this ONLY when the row is first created.
    ## 'lambda: datetime.now(timezone.utc)' rather than 'datetime.utcnow'
    ## because utcnow() is deprecated in modern Python and doesn't attach
    ## timezone info, which can cause subtle bugs when comparing dates
    ## later.
    created_at: Mapped[datetime] = mapped_column(
            DateTime(timezone=True),
            default=lambda: datetime.now(UTC),
            nullable=False,
        )

    ## 'onupdate=' means SQLAlchemy automatically refreshes this value
    ## every time the row is updates, you never have to remember to set
    ## it manually in application code.
    updated_at: Mapped[datetime] = mapped_column(
            DateTime(timezone=True),
            default=lambda: datetime.now(UTC),
            onupdate=lambda: datetime.now(UTC),
            nullable=False,
        )

    def __repr__(self) -> str:
        """
        Controls what shows up if you print a User object or view one
        in a debugger. Deliberately excludes hashed_password, even
        though it's already hashed, there's no reason for it to ever
        appear in a log or console output.
        """
        return f"<User id={self.id} email={self.email}>"
