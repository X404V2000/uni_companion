"""
tests/test_security_hardening.py

Adversarial regression tests closing common auth/API holes:

1. Mass-assignment: signup body cannot set privileged fields (role,
   is_active, hashed_password, deleted_at, id).
2. Correlation-ID injection: a CRLF/control-char X-Correlation-ID cannot
   forge extra log lines or inject response headers.
3. Password byte-limit boundary: exactly 72 bytes accepted, >72 rejected.
4. Email normalization/validation: control chars and HTML rejected.
5. Algorithm confusion at the JWT layer (alg=none / wrong key).
"""
import base64
import json

import pytest
from conftest import unique_email, valid_signup_payload

from app.core.security import decode_token
from app.models.user import User


class TestMassAssignment:
    def test_signup_ignores_privileged_fields(self, client, db):
        email = unique_email()
        payload = valid_signup_payload(email)
        payload.update({
            "role": "superuser",
            "is_active": False,
            "hashed_password": "attacker-set",
            "deleted_at": "2020-01-01T00:00:00Z",
            "id": "00000000-0000-0000-0000-000000000000",
        })
        resp = client.post("/api/v1/auth/signup", json=payload)
        # Pydantic whitelist: extra fields are ignored, not rejected.
        # Signup should still succeed as a normal STUDENT (role ignored).
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["role"] == "student"           # NOT superuser
        assert body["is_active"] is True           # NOT False
        assert body["id"] != "00000000-0000-0000-0000-000000000000"

        row = db.query(User).filter(User.email == email).one()
        assert row.role == "student"
        assert row.is_active is True
        assert row.deleted_at is None
        assert row.hashed_password != "attacker-set"


class TestCorrelationIdInjection:
    def test_crlf_correlation_id_does_not_inject(self, client):
        email = unique_email()
        evil = "x\r\nInjected-Header: evil"
        resp = client.post(
            "/api/v1/auth/signup",
            json=valid_signup_payload(email),
            headers={"X-Correlation-ID": evil},
        )
        assert resp.status_code == 201
        # Starlette sanitizes header values; a raw CRLF must not survive.
        echoed = resp.headers.get("x-correlation-id", "")
        assert "\r" not in echoed and "\n" not in echoed
        # No injected header present on the response.
        assert "injected-header" not in resp.headers


class TestPasswordByteBoundary:
    def test_72_bytes_ok_73_rejected(self, client):
        email = unique_email()
        p72 = "a" * 72   # exactly at bcrypt limit
        p73 = "b" * 73   # one byte over
        base = valid_signup_payload(email)
        base["password"] = p72
        r1 = client.post("/api/v1/auth/signup", json=base)
        assert r1.status_code == 201, r1.text

        email2 = unique_email()
        base2 = valid_signup_payload(email2)
        base2["password"] = p73
        r2 = client.post("/api/v1/auth/signup", json=base2)
        assert r2.status_code == 422


class TestEmailValidation:
    def test_control_chars_and_html_rejected(self, client):
        # Invalid emails must be rejected (422) and never persisted.
        for bad in ("a\x00b@example.com", "<script>@example.com", "a b@example.com"):
            payload = valid_signup_payload(bad)
            r = client.post("/api/v1/auth/signup", json=payload)
            assert r.status_code == 422
            # Response is JSON (never rendered as HTML by a browser).
            assert "text/html" not in r.headers.get("content-type", "")


class TestJwtAlgorithmPinning:
    def test_alg_none_rejected(self):
        def b64(d):
            return base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()

        tok = b64({"alg": "none", "typ": "JWT"}) + "." + b64({"sub": "x", "exp": 9999999999}) + "."
        try:
            decode_token(tok)
            raise AssertionError("alg=none token was accepted")
        except Exception as exc:
            assert type(exc).__name__ == "InvalidAlgorithmError"

    def test_wrong_key_rejected(self):
        import jwt as pyjwt

        forged = pyjwt.encode({"sub": "x", "exp": 9999999999}, "wrong-key", algorithm="HS256")
        # A token signed with the wrong key MUST be rejected with a JWT error.
        with pytest.raises(pyjwt.PyJWTError):
            decode_token(forged)
