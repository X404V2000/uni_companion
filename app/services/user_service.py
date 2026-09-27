"""
app/services/user_service.py

PURPOSE
-------
Business-logic layer for user operations, decoupled from HTTP concerns.

Week-2 refactor (architect feedback): route handlers in app/api/v1/auth.py
previously performed DB queries, password hashing, and token issuance inline.
That logic now lives here so endpoints only serialise schemas, enforce rate
limits, and translate domain outcomes into HTTP status responses.

DESIGN
------
- Functions accept a SQLAlchemy `Session` (dependency-injected) and operate
  purely on models/domain objects — never on `Request`/`Response`.
- Expected failure modes are communicated via domain exceptions defined below
  (not FastAPI HTTPException), so this layer is reusable outside HTTP too.
- Timing-attack defences (DUMMY_HASH) and POPIA soft-delete semantics live
  here, keeping security logic auditable in one place.
"""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.email import send_welcome_email
from app.core.roles import UserRole
from app.core.security import (
    DUMMY_HASH,
    create_access_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import LoginRequest
from app.schemas.user import UserCreate


# ---------------------------------------------------------------------------
# Domain errors (mapped to HTTP by the router layer)
# ---------------------------------------------------------------------------
class UserServiceError(Exception):
    """Base class for expected user-service failures."""


class DuplicateEmailError(UserServiceError):
    """A user with this email already exists."""


class InvalidCredentialsError(UserServiceError):
    """Wrong email/password, or an inactive account (never distinguishable)."""


# ---------------------------------------------------------------------------
# Operations
# ---------------------------------------------------------------------------
def create_user(
    db: Session,
    data: UserCreate,
    role: UserRole = UserRole.STUDENT,
    background_tasks=None,
) -> User:
    """Hashes the password and persists a new user with POPIA consent.

    `role` defaults to STUDENT for public signup; out-of-band bootstrap
    scripts (e.g. scripts/create_admin.py) may pass an elevated role.

    `background_tasks` (FastAPI BackgroundTasks) may be provided by the HTTP
    layer; when set, a welcome email is scheduled to run AFTER the response
    is returned — never inline, so email latency/failure cannot delay or
    roll back registration.

    Raises DuplicateEmailError if the email is already taken (including the
    race case caught by the database UNIQUE constraint).
    """
    # Uniform rejection message is applied at the route; the service only
    # signals the outcome. Ensure we never distinguish "exists" vs. race by
    # collapsing both to DuplicateEmailError.
    if db.query(User).filter(User.email == data.email).first():
        raise DuplicateEmailError()

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        university=data.university,
        field_of_study=data.field_of_study,
        year_of_study=data.year_of_study,
        terms_version=data.terms_version,
        privacy_version=data.privacy_version,
        accepted_at=datetime.now(UTC),
        role=role.value,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateEmailError() from exc
    db.refresh(user)

    # Schedule the welcome email only after a successful COMMIT, so a failed
    # insert never dispatches an outbound message.
    if background_tasks is not None:
        background_tasks.add_task(
            send_welcome_email,
            to_email=user.email,
            full_name=user.full_name,
        )

    return user


def authenticate_user(db: Session, data: LoginRequest) -> User:
    """Authenticate credentials and return the active user.

    SECURITY:
    - Unknown emails still run a bcrypt comparison against DUMMY_HASH so
      response timing cannot reveal account existence.
    - Corrupt/non-bcrypt stored hashes are compared against DUMMY_HASH too,
      so a damaged row behaves exactly like a wrong password.
    - Inactive (deleted/deactivated) accounts are rejected with the same
      error as wrong credentials — no enumeration.
    """
    user = db.query(User).filter(User.email == data.email).first()

    if user is None:
        verify_password(data.password, DUMMY_HASH)
        raise InvalidCredentialsError()

    stored_hash = user.hashed_password
    if not (isinstance(stored_hash, str) and stored_hash.startswith("$2")):
        stored_hash = DUMMY_HASH

    if not verify_password(data.password, stored_hash):
        raise InvalidCredentialsError()

    if not user.is_active:
        raise InvalidCredentialsError()

    return user


def issue_access_token(user: User) -> str:
    """Issue a short-lived JWT for the given user (sub = user id only)."""
    return create_access_token(subject=str(user.id))


def deactivate_user(db: Session, user: User, password: str) -> None:
    """Soft-delete `user` after re-authenticating with `password`.

    - Wrong password -> InvalidCredentialsError (route maps to 401).
    - On success: is_active=False, deleted_at=now(utc), credential scrubbed
      to DUMMY_HASH so the tombstone no longer holds a usable bcrypt hash.
    """
    if not verify_password(password, user.hashed_password):
        raise InvalidCredentialsError()

    user.is_active = False
    user.deleted_at = datetime.now(UTC)
    user.hashed_password = DUMMY_HASH
    db.add(user)
    db.commit()
