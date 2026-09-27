"""add updated_at and created_by_user_id to study_materials

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-16

Admin materials curation (Month 2, Week 3, Day 1): adds audit columns.
- updated_at: NOT NULL, backfilled from created_at (three-step dance so no
  lingering column default).
- created_by_user_id: nullable FK -> users.id with ON DELETE SET NULL (materials
  are global content; hard-purging the creator must NOT delete the material).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add updated_at as NULL (existing rows have no value yet).
    op.add_column(
        "study_materials",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    # 2. Backfill from created_at (single atomic UPDATE).
    op.execute(
        "UPDATE study_materials SET updated_at = created_at WHERE updated_at IS NULL"
    )
    # 3. Enforce NOT NULL now that every row has a value.
    op.alter_column("study_materials", "updated_at", nullable=False)

    # 4. Nullable creator FK with SET NULL.
    op.add_column(
        "study_materials",
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_materials_created_by_user",
        "study_materials",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_materials_created_by_user", "study_materials", type_="foreignkey")
    op.drop_column("study_materials", "created_by_user_id")
    op.drop_column("study_materials", "updated_at")
