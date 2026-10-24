"""Password reset tokens: single-use credential for account recovery

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-24

WHY THIS EXISTS
---------------
There was no password recovery. A student who forgot their password could not
recover the account and had to create a new one, losing their modules and
deadlines. For an app sold on "you will not be blocked the night a deadline is
due", being locked out permanently is the worst failure it can have - and a
silent one, since the student just leaves.

WHY ADDITIVE
------------
New table only. No existing table is altered, so `upgrade head` cannot fail on
existing data and `downgrade 0014` removes it cleanly.

WHY token_hash IS UNIQUE AND INDEXED
------------------------------------
Every validation is a lookup by hash. Uniqueness guarantees no collision between
two live tokens, and the index makes validation O(log n) rather than a scan.

WHY ON DELETE CASCADE
---------------------
A reset token is a live credential. If the account goes, the credential must go
with it - the same POPIA reasoning as refresh_tokens.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "uq_password_reset_token_hash", "password_reset_tokens", ["token_hash"], unique=True
    )
    op.create_index(
        "ix_password_reset_user", "password_reset_tokens", ["user_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_table("password_reset_tokens")
