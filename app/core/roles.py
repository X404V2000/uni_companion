"""
app/core/roles.py

PURPOSE
-------
Defines the user role hierarchy for role-based access control (Week 2, Day 3).

DESIGN (per architect decision):
- Python `enum.Enum` with STRING values so storage is a plain VARCHAR
  backed by a CHECK constraint (never a Postgres native ENUM type). This
  keeps Alembic migrations additive/non-blocking on Neon when roles are
  later expanded.
"""
from enum import Enum

from sqlalchemy import CheckConstraint


class UserRole(str, Enum):
    """Authorization tiers. Value = the string persisted in `users.role`."""

    STUDENT = "student"
    ADMIN = "admin"
    SUPERUSER = "superuser"


# All allowed role strings, used to build the DB CHECK constraint.
ALLOWED_ROLE_VALUES = tuple(role.value for role in UserRole)


def role_check_constraint(column_name: str = "role") -> CheckConstraint:
    """Build a CHECK constraint restricting a role column to known values."""
    in_clause = ", ".join(f"'{v}'" for v in ALLOWED_ROLE_VALUES)
    return CheckConstraint(
        f"{column_name} IN ({in_clause})",
        name="ck_users_role_valid",
    )
