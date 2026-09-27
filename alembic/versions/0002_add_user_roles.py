"""add user roles

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-07

Adds a `role` VARCHAR column with server-side default 'student' and a CHECK
constraint limiting values to student/admin/superuser (Week 2 Day 3 RBAC).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ROLE_VALUES = ("student", "admin", "superuser")
CK_NAME = "ck_users_role_valid"


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "role",
            sa.String(length=20),
            nullable=False,
            server_default="student",
        ),
    )
    op.create_check_constraint(
        CK_NAME,
        "users",
        "role IN ('student', 'admin', 'superuser')",
    )


def downgrade() -> None:
    op.drop_constraint(CK_NAME, "users", type_="check")
    op.drop_column("users", "role")
