"""Bursaries: funding a student can apply for

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-23

WHY THIS EXISTS
---------------
User 11's complaint was "the manual labour of having to add files and all". The
materials feature answered half of it - finding study resources automatically.
The other half is finding MONEY, which a South African student has to do by
hand, across a dozen incompatible websites, usually in January when it is too
late.

A missed NSFAS deadline does not block a student for one night. It blocks them
for a year. That is the case this table exists to prevent, and it is why bursary
closing dates are surfaced in the same planner as assignment deadlines.

WHY IT IS ADDITIVE AND ONLY ADDITIVE
------------------------------------
Every column here is on a NEW table. No existing table is altered, so:
  - `alembic upgrade head` cannot fail because of existing data;
  - `alembic downgrade 0013` returns the schema to exactly its previous state;
  - if the feature is cancelled on Sunday, this migration is deleted and
    nothing else needs touching.

WHY (is_active, application_closes) IS INDEXED
----------------------------------------------
The matching query always filters `is_active = true` and orders by the closing
date. That is the only read path, so it is the only index worth its write cost.

WHY (name, provider) IS UNIQUE
------------------------------
The seed script upserts on that pair. Uniqueness is what makes re-running the
seed idempotent instead of creating a duplicate NSFAS every time it runs - the
same reason `study_materials` has a unique (module_code, url) index.

WHY THE MATCHING COLUMNS ARE JSON AND NULLABLE
----------------------------------------------
NULL means "no restriction" - most bursaries are open to any student. That is
different from an empty list, which would read as "open to nobody". JSON was
chosen over ARRAY because it needs no postgres-specific import and Python lists
round-trip without special handling in the seed script.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "bursaries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("provider", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("url", sa.String(length=512), nullable=False),
        sa.Column("fields_of_study", sa.JSON(), nullable=True),
        sa.Column("levels", sa.JSON(), nullable=True),
        sa.Column("institutions", sa.JSON(), nullable=True),
        sa.Column("min_year", sa.Integer(), nullable=True),
        sa.Column("max_year", sa.Integer(), nullable=True),
        sa.Column(
            "citizen_only", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("application_opens", sa.Date(), nullable=True),
        sa.Column("application_closes", sa.Date(), nullable=True),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # The only read path: active bursaries, soonest closing first.
    op.create_index(
        "ix_bursaries_active_closes",
        "bursaries",
        ["is_active", "application_closes"],
    )
    # Makes the seed script's upsert idempotent.
    op.create_index(
        "uq_bursaries_name_provider",
        "bursaries",
        ["name", "provider"],
        unique=True,
    )


def downgrade() -> None:
    # Dropping the table drops its indexes with it.
    op.drop_table("bursaries")
