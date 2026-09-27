"""
tests/test_account_deletion_endpoints.py

Security tests for Day 5 account deletion (POPIA right-to-delete baseline):
DELETE /api/v1/auth/account.

Soft-delete semantics under test:
- requires authentication + current password (re-authN)
- wrong password -> generic 401, account NOT deactivated
- success -> is_active=False, deleted_at set, hashed_password scrubbed, cookie cleared
- deactivated user can no longer authenticate (/me and login both 401)
"""
from datetime import datetime

from conftest import PASSWORD, unique_email, valid_signup_payload

from app.core.security import DUMMY_HASH
from app.models.user import User


def _signup(client, email=None):
    email = email or unique_email()
    resp = client.post("/api/v1/auth/signup", json=valid_signup_payload(email))
    assert resp.status_code == 201, resp.text
    return email, resp.json()


def _login(client, email, password=PASSWORD):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def _delete_account(client, password=PASSWORD):
    # NOTE: starlette's TestClient.delete() has no `json` kwarg; route via
    # request("DELETE", ...) which does support a JSON body.
    return client.request("DELETE", "/api/v1/auth/account", json={"password": password})


class TestAccountDeletion:
    def test_delete_requires_authentication(self, client):
        resp = _delete_account(client)
        assert resp.status_code == 401

    def test_delete_rejects_wrong_password_and_keeps_account(self, client, db):
        email, _ = _signup(client)
        assert _login(client, email).status_code == 200

        resp = _delete_account(client, password="WrongPassword_0001")
        assert resp.status_code == 401

        user = db.query(User).filter(User.email == email).one()
        assert user.is_active is True
        assert user.deleted_at is None
        assert user.hashed_password != DUMMY_HASH

    def test_delete_sets_inactive_tombstone_and_scrubs_credential(self, client, db):
        email, _ = _signup(client)
        assert _login(client, email).status_code == 200

        resp = _delete_account(client)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("status") == "deactivated"
        assert body.get("deleted_at")

        user = db.query(User).filter(User.email == email).one()
        assert user.is_active is False
        assert isinstance(user.deleted_at, datetime)
        # Credential scrubbed to the shared DUMMY_HASH, not the real bcrypt hash.
        assert user.hashed_password == DUMMY_HASH

    def test_deleted_user_cannot_reach_me(self, client):
        email, _ = _signup(client)
        assert _login(client, email).status_code == 200
        assert client.get("/api/v1/auth/me").status_code == 200

        _delete_account(client)
        # Token/cookie are now stale: /me must re-check is_active in DB.
        assert client.get("/api/v1/auth/me").status_code == 401

    def test_deleted_user_cannot_login_again(self, client):
        email, _ = _signup(client)
        assert _login(client, email).status_code == 200
        _delete_account(client)

        # Login after deactivation -> generic 401 (no enumeration).
        resp = _login(client, email)
        assert resp.status_code == 401
        assert resp.json().get("detail") == "Invalid email or password."

    def test_delete_clears_auth_cookie(self, client):
        email, _ = _signup(client)
        assert _login(client, email).status_code == 200

        resp = _delete_account(client)
        raw = "; ".join(resp.headers.get_list("set-cookie")).lower()
        assert "access_token=" in raw
        assert "max-age=0" in raw
