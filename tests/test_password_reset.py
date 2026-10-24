"""tests/test_password_reset.py

PURPOSE
-------
A reset token is a credential to an account. These tests exist to prove the six
security properties, not merely that the happy path works:

  1. a valid token can be issued and consumed
  2. a token is SINGLE USE - the second attempt fails
  3. an EXPIRED token is refused
  4. only the HASH is stored - the raw value never touches the database
  5. issuing again REVOKES the previous token
  6. a garbage or empty token is refused without raising

If any of these regress, an attacker gets an account or a student stays locked
out. Both are worse than the feature being absent.
"""
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.core.security import verify_password
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.services import password_reset_service as svc


def _user(db, email=None):
    u = User(
        id=uuid.uuid4(),
        email=email or f"reset+{uuid.uuid4().hex[:10]}@example.com",
        full_name="Reset Test",
        hashed_password=svc_hash("OldPassword123!"),
        university="University of Cape Town",
        field_of_study="Computer Science",
        year_of_study=2,
        # Consent is NOT NULL: an account cannot exist without accepting the
        # terms it was created under (POPIA audit trail).
        terms_version="1.0",
        privacy_version="1.0",
    )
    db.add(u)
    db.commit()
    return u


def svc_hash(plain: str) -> str:
    from app.core.security import hash_password

    return hash_password(plain)


def test_issue_and_consume(db):
    user = _user(db)
    raw = svc.issue_token(db, user)
    assert isinstance(raw, str) and len(raw) >= 32

    row = svc.validate_token(db, raw)
    assert row is not None

    svc.consume(db, row, svc_hash("BrandNewPass123!"))
    db.refresh(user)
    assert verify_password("BrandNewPass123!", user.hashed_password)


def test_token_is_single_use(db):
    user = _user(db)
    raw = svc.issue_token(db, user)
    row = svc.validate_token(db, raw)
    svc.consume(db, row, svc_hash("BrandNewPass123!"))

    # The same token must never validate again.
    assert svc.validate_token(db, raw) is None


def test_expired_token_is_refused(db):
    user = _user(db)
    raw = svc.issue_token(db, user)

    # Force expiry in the past.
    row = db.query(PasswordResetToken).filter_by(user_id=user.id).first()
    row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db.commit()

    assert svc.validate_token(db, raw) is None


def test_raw_token_is_never_stored(db):
    user = _user(db)
    raw = svc.issue_token(db, user)
    row = db.query(PasswordResetToken).filter_by(user_id=user.id).first()

    assert row.token_hash != raw
    assert raw not in (row.token_hash or "")
    # SHA-256 hex is 64 chars; a leaked hash is not usable as a token.
    assert len(row.token_hash) == 64


def test_issuing_again_revokes_the_previous_token(db):
    user = _user(db)
    first = svc.issue_token(db, user)
    second = svc.issue_token(db, user)

    assert first != second
    # The old link must stop working, otherwise "I asked again" doubles the
    # number of live keys to the account.
    assert svc.validate_token(db, first) is None
    assert svc.validate_token(db, second) is not None


@pytest.mark.parametrize("bad", ["", "   ", "not-a-token", "x" * 500])
def test_garbage_tokens_are_refused(db, bad):
    assert svc.validate_token(db, bad) is None


def test_unknown_but_wellformed_token_is_refused(db):
    import secrets

    assert svc.validate_token(db, secrets.token_urlsafe(32)) is None


def test_reset_does_not_touch_a_different_user(db):
    """A token must only ever open the account it was issued for."""
    victim = _user(db)
    other = _user(db)
    raw = svc.issue_token(db, victim)

    row = svc.validate_token(db, raw)
    svc.consume(db, row, svc_hash("OnlyVictimPass1!"))

    db.refresh(other)
    assert verify_password("OldPassword123!", other.hashed_password)
