"""Refresh tokens: revocable long-lived sessions

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-03

WHY THIS EXISTS
---------------
Students were logged out every 15 minutes. `jwt_access_token_expire_minutes` is 15
and `jwt_refresh_token_expire_days` was configured but referenced nowhere in `app/` -
someone intended a refresh mechanism and it was never built, so every session ended
with a forced password re-entry four times an hour.

The access token cannot simply be made longer: it is a stateless JWT and cannot be
revoked, so a longer life would mean a lost phone keeps a valid session with no way
to kill it. That is the wrong posture for a POPIA-sensitive app holding a student's
email, module list and academic schedule.

The fix is a second credential that CAN be revoked, which requires server-side state.
This migration creates that state.

WHY THE TOKEN IS OPAQUE
-----------------------
A JWT refresh token would inherit the problem it exists to solve - no revocation.
An opaque random string, stored as a SHA-256 hash, can be revoked, expired, and
replay-detected. Only the hash is stored, so a database leak yields no usable
sessions.

WHY `replaced_by` EXISTS
------------------------
Every refresh consumes the presented token and issues a new one; this column records
the succession, forming a chain. If a consumed token is presented again it has been
replayed - stolen, or a client double-fired - and the service revokes the entire
chain rather than guessing which holder is legitimate. Without this column, a stolen
refresh token would be silently usable for its full lifetime.

WHY ON DELETE CASCADE MATTERS
-----------------------------
A refresh token is a live credential for an account. The POPIA guarantee is that
deleting an account removes that student's data; a session surviving its own account
deletion would be a hole in that guarantee, not merely untidy.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "refresh_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # SHA-256 hex digest of the opaque token. Unique because the lookup on every
        # refresh is by hash, and a collision would hand one user another's session.
        sa.Column("token_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        # Forward pointer in the rotation chain. SET NULL rather than CASCADE so a
        # pruned descendant cannot delete the ancestor that would still be needed to
        # recognise a replay of it.
        sa.Column(
            "replaced_by",
            UUID(as_uuid=True),
            sa.ForeignKey("refresh_tokens.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("device_hint", sa.String(length=120), nullable=True),
    )

    # Every refresh looks up by hash; without this index it is a sequential scan of
    # a table that grows with every login.
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"])

    # Sign-out-all-devices and the cascade on account deletion both filter by
    # user_id. The composite covers the far more common "live tokens for this user"
    # query, which is what logout and reuse detection actually ask for.
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index(
        "ix_refresh_tokens_user_active", "refresh_tokens", ["user_id", "revoked_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_user_active", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_token_hash", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
