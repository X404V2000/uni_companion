"""add composite index on study_materials(module_code, url)

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-27

WHY THIS REVISION IS NUMBERED 0011, NOT 0010
--------------------------------------------
The Day 3 specification assumed 0010 was free (it was written against head
0009). By the time it was implemented, 0010 had been taken by the RAG brief
tables, so the same change lands here as 0011. The index itself is exactly as
specified; only the revision number and its parent differ.

RATIONALE
---------
The bulk-import duplicate check filters on (module_code, url). Without a
composite index that is an O(N) sequential scan per row, making an R-row import
O(R*N). This index makes each lookup O(log N).

It is deliberately NOT unique. The duplicate rule lives in the application
import layer, where it can report which rows were duplicates and let an operator
choose `on_duplicate`. A unique constraint would instead raise a database error
that the import could not explain, and it would also forbid legitimate cases
such as two entries for the same module and URL distinguished by type while that
question is still open.
"""
from collections.abc import Sequence

from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_materials_module_url",
        "study_materials",
        ["module_code", "url"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_materials_module_url", table_name="study_materials")
