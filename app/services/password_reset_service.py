"""app/services/password_reset_service.py

PURPOSE
-------
Issue, validate and consume password-reset tokens.

SECURITY MODEL, STATED PLAINLY
------------------------------
1. **256 bits of randomness.** `secrets.token_urlsafe(32)`. Not guessable, so
   there is no rate-limit race to lose and no lockout to add.
2. **Only the hash is stored.** A database leak yields no usable tokens.
3. **Single use.** Consuming marks the row used; a second attempt is refused and
   logged, which is how a stolen token gets noticed.
4. **Expiry.** 30 minutes by default. Long enough to send on WhatsApp, short
   enough that a screenshot is not a permanent key.
5. **Issuing revokes prior tokens.** Starting recovery twice must not leave the
   first link live - otherwise "I asked again" silently doubles the attack
   surface.
6. **Constant-ish work on unknown tokens.** Validation looks up by hash, which
   is the same cost whether or not the user exists.

WHAT THIS DOES NOT DO
---------------------
It does not tell anyone whether an account exists. The admin issues a token for a
known account; the public endpoint only validates a token the caller already
holds. There is no "does this email exist" path to enumerate.

WHY AN ADMIN ISSUES THE TOKEN
-----------------------------
Email is not configured and must not be a dependency for recovery. A human hands
the token over directly. The same table and the same `validate`/`consume` path
will serve an emailed flow later - only delivery changes.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.models.password_reset import PasswordResetToken
from app.models.user import User

logger = logging.getLogger(__name__)

# 32 bytes = 256 bits, matching the refresh-token strength.
_TOKEN_BYTES = 32

# Long enough to relay to a student by message; short enough to be safe.
TOKEN_LIFETIME_MINUTES = 30


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def issue_token(
    db: Session, user: User, created_by: uuid.UUID | None = None
) -> str:
    """Create a fresh reset token and return the RAW value, exactly once.

    The caller must hand this to the student immediately; it is not recoverable
    afterwards because only its hash is stored.
    """
    now = datetime.now(UTC)

    # Revoke anything already outstanding for this account. Recovery restarts
    # from zero rather than stacking live links.
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used_at.is_(None),
    ).delete(synchronize_session=False)

    raw = secrets.token_urlsafe(_TOKEN_BYTES)
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_token(raw),
            expires_at=now + timedelta(minutes=TOKEN_LIFETIME_MINUTES),
            created_by=created_by,
        )
    )
    db.commit()
    logger.info("password reset token issued for user %s", user.id)
    return raw


def validate_token(db: Session, raw_token: str) -> PasswordResetToken | None:
    """Return the live token row, or None if missing/expired/used.

    Deliberately does not distinguish the three failures to the caller - the API
    returns one message either way, so a guesser learns nothing about WHY it
    failed.
    """
    if not raw_token:
        return None
    row = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token_hash == _hash_token(raw_token))
        .first()
    )
    if row is None:
        return None
    if row.used_at is not None:
        # A replay. Worth a log line: either the student double-clicked or
        # someone else has the token.
        logger.warning("password reset token reused for user %s", row.user_id)
        return None
    now = datetime.now(UTC)
    expires_at = row.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at < now:
        return None
    return row


def consume(db: Session, token_row: PasswordResetToken, new_password_hash: str) -> User:
    """Set the new password and mark the token used, in one transaction.

    The password change and the single-use mark must land together: a crash
    between them would either leave the old password working or leave the token
    reusable.
    """
    user = db.query(User).filter(User.id == token_row.user_id).first()
    if user is None:
        raise ValueError("token references a user that no longer exists")

    user.hashed_password = new_password_hash
    token_row.used_at = datetime.now(UTC)
    db.commit()
    logger.info("password reset completed for user %s", user.id)
    return user
