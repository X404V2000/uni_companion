"""ai summary engine tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-12

Creates the Month 2 Week 1 AI summary engine tables:

- user_ai_quotas      per-user, per-day free-tier credit ledger.
- ai_summary_caches   per-user SHA-256 result cache (unique on
                      (user_id, content_hash)).

Both carry user_id FK -> users.id ON DELETE CASCADE, plus composite indexes
for the fast O(log N) paths used by ai_service.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- user_ai_quotas ---
    op.create_table(
        "user_ai_quotas",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("usage_date", sa.Date(), nullable=False),
        sa.Column("summaries_used", sa.Integer(), nullable=False),
        sa.Column("daily_limit", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_user_quota_date", "user_ai_quotas", ["user_id", "usage_date"], unique=True
    )

    # --- ai_summary_caches ---
    op.create_table(
        "ai_summary_caches",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("module_code", sa.String(length=20), nullable=False),
        sa.Column("summary_text", sa.Text(), nullable=False),
        sa.Column("tokens_used", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ai_cache_user_hash", "ai_summary_caches", ["user_id", "content_hash"],
        unique=True,
    )
    op.create_index(
        "ix_ai_cache_user_module", "ai_summary_caches", ["user_id", "module_code"],
    )


def downgrade() -> None:
    op.drop_index("ix_ai_cache_user_module", table_name="ai_summary_caches")
    op.drop_index("ix_ai_cache_user_hash", table_name="ai_summary_caches")
    op.drop_table("ai_summary_caches")
    op.drop_index("ix_user_quota_date", table_name="user_ai_quotas")
    op.drop_table("user_ai_quotas")
