"""add updated_at to timetable_slots

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-12

The offline sync engine (Month 2, Week 1, Day 3) needs an updated_at column on
timetable_slots for last-write-wins conflict resolution. Backfills existing
rows from created_at so no NOT NULL violation occurs.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "timetable_slots",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Backfill existing rows before enforcing NOT NULL.
    op.execute("UPDATE timetable_slots SET updated_at = created_at")
    op.alter_column("timetable_slots", "updated_at", nullable=False)


def downgrade() -> None:
    op.drop_column("timetable_slots", "updated_at")
