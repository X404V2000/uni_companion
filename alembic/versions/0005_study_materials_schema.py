"""study materials schema

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-12

Creates the study_materials table for the retrieval-first materials search
engine, with a composite index on (module_code, resource_type, is_approved)
so module-scoped listing is O(log N).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "study_materials",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("module_code", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("url", sa.String(length=512), nullable=False),
        sa.Column("resource_type", sa.String(length=30), nullable=False),
        sa.Column("quality_resolution", sa.String(length=10), nullable=False),
        sa.Column("is_approved", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_materials_module_type",
        "study_materials",
        ["module_code", "resource_type", "is_approved"],
    )


def downgrade() -> None:
    op.drop_index("ix_materials_module_type", table_name="study_materials")
    op.drop_table("study_materials")
