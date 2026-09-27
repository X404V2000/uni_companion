"""
tests/test_security_units.py

Pure unit tests for the password + JWT primitives (no database needed).

These verify the low-level crypto building blocks that all auth endpoints
depend on, so a failure here blocks the whole auth system.
"""
from datetime import timedelta

import jwt
import pytest
from pydantic import ValidationError

from app.core.config import settings
from app.core.legal import CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION
from app.core.security import (
    DUMMY_HASH,
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.schemas.auth import LoginRequest
from app.schemas.user import UserCreate

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

class TestPasswordHashing:
    def test_hash_and_verify_roundtrip(self):
        hashed = hash_password("S3cure!password")
        assert hashed != "S3cure!password"          # never plaintext
        assert verify_password("S3cure!password", hashed) is True

    def test_wrong_password_fails(self):
        hashed = hash_password("S3cure!password")
        assert verify_password("wrong-password", hashed) is False

    def test_hashes_are_unique_per_call(self):
        # bcrypt uses a random salt per call -> same password, different hash
        a = hash_password("same-pass")
        b = hash_password("same-pass")
        assert a != b
        assert verify_password("same-pass", a) is True
        assert verify_password("same-pass", b) is True

    def test_verify_rejects_malformed_hash_fail_closed(self):
        # Malformed stored hash must fail closed (returns False), not crash.
        assert verify_password("anything", "not-a-valid-hash$$$") is False

    def test_dummy_hash_is_a_real_bcrypt_hash(self):
        # DUMMY_HASH must be valid so unknown-email logins run a real,
        # equally expensive bcrypt comparison (timing-attack defense).
        assert DUMMY_HASH.startswith("$2")
        assert verify_password(
            "timing-attack-defense-placeholder", DUMMY_HASH
        ) is True


# ---------------------------------------------------------------------------
# JWT creation / decoding
# ---------------------------------------------------------------------------

class TestJWT:
    def test_create_then_decode_roundtrip(self):
        token = create_access_token(subject="user-123")
        payload = decode_token(token)
        assert payload["sub"] == "user-123"
        # token carries only sub/exp/iat — never email or other PII
        assert "email" not in payload
        assert "full_name" not in payload
        assert "exp" in payload and "iat" in payload

    def test_default_expiration_matches_settings(self):
        token = create_access_token(subject="user-123")
        payload = decode_token(token)
        # exp/iat decode as integer epoch-seconds; delta should be ~ the
        # configured lifetime.
        lifetime_seconds = payload["exp"] - payload["iat"]
        assert lifetime_seconds == pytest.approx(
            settings.jwt_access_token_expire_minutes * 60, abs=5
        )

    def test_custom_expires_delta(self):
        token = create_access_token(
            subject="user-123", expires_delta=timedelta(minutes=1)
        )
        payload = decode_token(token)
        lifetime_seconds = payload["exp"] - payload["iat"]
        assert abs(lifetime_seconds - 60) <= 2

    def test_expired_token_rejected(self):
        token = create_access_token(
            subject="user-123", expires_delta=timedelta(seconds=-10)
        )
        with pytest.raises(jwt.ExpiredSignatureError):
            decode_token(token)

    def test_tampered_token_rejected(self):
        token = create_access_token(subject="user-123")
        tampered = token[:-4] + ("AAAA" if not token.endswith("AAAA") else "BBBB")
        with pytest.raises(jwt.InvalidTokenError):
            decode_token(tampered)

    def test_garbage_token_rejected(self):
        with pytest.raises(jwt.InvalidTokenError):
            decode_token("definitely.not.a.jwt")

    def test_foreign_key_token_rejected(self):
        # A token signed with a different secret must be invalid.
        forged = jwt.encode(
            {"sub": "attacker", "exp": 9999999999},
            "attacker-private-secret",
            algorithm="HS256",
        )
        with pytest.raises(jwt.InvalidSignatureError):
            decode_token(forged)


# ---------------------------------------------------------------------------
# Schema-layer bcrypt 72-byte enforcement
# ---------------------------------------------------------------------------

def _signup_payload(password: str, email: str = "new@example.com") -> dict:
    return {
        "email": email,
        "password": password,
        "full_name": "Byte Limit Tester",
        "terms_version": CURRENT_TERMS_VERSION,
        "privacy_version": CURRENT_PRIVACY_VERSION,
    }


class TestPasswordByteBoundary:
    def test_exactly_72_byte_ascii_is_accepted(self):
        pw = "a" * 72
        assert len(pw.encode("utf-8")) == 72
        assert UserCreate(**_signup_payload(pw)).password == pw

    def test_over_72_byte_ascii_is_rejected(self):
        with pytest.raises(ValidationError):
            UserCreate(**_signup_payload("a" * 73))

    def test_multibyte_password_counted_in_bytes_not_characters(self):
        # 18 x 4-byte emoji = exactly 72 BYTES (but only 18 characters),
        # so it must still be accepted — byte count is what matters.
        pw = "\U0001f600" * 18
        assert len(pw) == 18 and len(pw.encode("utf-8")) == 72
        assert UserCreate(**_signup_payload(pw)).password == pw

    def test_short_but_over_byte_limit_multibyte_rejected(self):
        # 25 emoji = 100 bytes yet only 25 characters: characters look fine,
        # but bytes exceed bcrypt's limit -> the schema must reject.
        pw = "\U0001f600" * 25
        with pytest.raises(ValidationError):
            UserCreate(**_signup_payload(pw))

    def test_verify_password_handles_multibyte_at_byte_limit(self):
        pw = "\U0001f600" * 18  # exactly 72 bytes
        hashed = hash_password(pw)
        assert verify_password(pw, hashed) is True

    def test_login_request_rejects_over_byte_limit_password(self):
        with pytest.raises(ValidationError):
            LoginRequest(email="someone@example.com", password="a" * 73)
