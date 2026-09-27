"""add duration_ms to usage_events

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-15

Friction instrumentation (Month 2, Week 2, Day 4): nullable duration_ms for
summarize/sync duration events. Forward-only, nullable, no default (existing
rows honestly have no duration), no new index (reads are filtered by the
already-indexed event_type + created_at).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "usage_events",
        sa.Column("duration_ms", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("usage_events", "duration_ms")
