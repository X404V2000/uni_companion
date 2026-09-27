"""brief documents + chunks (RAG ingestion tables)

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-25

Adds the storage for "Chat with your brief" (RAG over a student's own uploaded
document).

- brief_documents: one row per uploaded brief (owner, label, full text, size).
- brief_chunks:    deterministic slices of the parent text used for retrieval.

Both tables are strictly per-user:
  * brief_documents.user_id -> users.id ON DELETE CASCADE, so a POPIA
    right-to-erasure hard purge removes the student's briefs and chunks.
  * brief_chunks denormalises user_id (also CASCADE) so retrieval can filter by
    owner without a join — cross-tenant leakage is impossible by construction.

`brief_chunks.embedding` is NULLable and reserved: retrieval is keyword-scored
today, and semantic (embedding) retrieval can be enabled later without a schema
change.

Concurrency note: plain CREATE TABLE/INDEX here is safe (no live traffic and
these are brand-new tables). For future changes to LARGE existing tables, use
CREATE INDEX CONCURRENTLY.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "brief_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_name", sa.String(length=255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("char_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_brief_user_created", "brief_documents", ["user_id", "created_at"]
    )

    op.create_table(
        "brief_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("brief_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("chunk_text", sa.Text(), nullable=False),
        sa.Column("embedding", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["brief_id"], ["brief_documents.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chunk_brief_ordinal", "brief_chunks", ["brief_id", "ordinal"])
    op.create_index("ix_chunk_user", "brief_chunks", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_chunk_user", table_name="brief_chunks")
    op.drop_index("ix_chunk_brief_ordinal", table_name="brief_chunks")
    op.drop_table("brief_chunks")
    op.drop_index("ix_brief_user_created", table_name="brief_documents")
    op.drop_table("brief_documents")
