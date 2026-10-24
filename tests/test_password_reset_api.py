"""tests/test_password_reset_api.py

PURPOSE
-------
Prove the HTTP boundary, especially the one that matters: A STUDENT MUST NOT BE
ABLE TO ISSUE A RESET TOKEN FOR ANOTHER ACCOUNT. If that gate is ever loosened,
any signed-in user can take over any other account in two requests.
"""
import uuid

from conftest import PASSWORD, unique_email, valid_signup_payload

from app.models.user import User


def _signup(client, prefix="pwreset"):
    client.cookies.clear()
    email = unique_email(prefix)
    assert client.post("/api/v1/auth/signup", json=valid_signup_payload(email)).status_code == 201
    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"X-Auth-Mode": "api"},
    )
    assert login.status_code == 200, login.text
    return email, login.json()["access_token"]


def _auth(client, token):
    client.cookies.clear()
    return {"Authorization": f"Bearer {token}"}


def _make_admin(db, email):
    user = db.query(User).filter(User.email == email).first()
    user.role = "admin"
    db.commit()
    return user


def test_student_cannot_issue_a_token(client, db):
    """The security boundary. A plain student must be refused."""
    _victim_email, _token = _signup(client, "victim")
    attacker_email, attacker_token = _signup(client, "attacker")

    resp = client.post(
        "/api/v1/password-reset/issue",
        json={"email": _victim_email},
        headers=_auth(client, attacker_token),
    )
    assert resp.status_code == 403, resp.text
    # And definitely no token leaked in the body.
    assert "token" not in resp.json()


def test_anonymous_cannot_issue_a_token(client):
    client.cookies.clear()
    resp = client.post("/api/v1/password-reset/issue", json={"email": "x@example.com"})
    assert resp.status_code == 401


def test_admin_issues_and_student_completes(client, db):
    email, _token = _signup(client, "recover")
    _make_admin(db, email)
    admin_login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"X-Auth-Mode": "api"},
    )
    admin_headers = _auth(client, admin_login.json()["access_token"])

    # A second student who actually needs recovery.
    student_email, _st = _signup(client, "locked")

    issued = client.post(
        "/api/v1/password-reset/issue",
        json={"email": student_email},
        headers=admin_headers,
    )
    assert issued.status_code == 201, issued.text
    raw = issued.json()["token"]
    assert issued.json()["expires_in_minutes"] == 30

    # Complete the reset unauthenticated - they are locked out.
    client.cookies.clear()
    done = client.post(
        "/api/v1/password-reset/complete",
        json={"token": raw, "new_password": "FreshPassword99!"},
    )
    assert done.status_code == 200, done.text

    # The new password works and the old one does not.
    client.cookies.clear()
    good = client.post(
        "/api/v1/auth/login",
        json={"email": student_email, "password": "FreshPassword99!"},
        headers={"X-Auth-Mode": "api"},
    )
    assert good.status_code == 200, good.text
    client.cookies.clear()
    bad = client.post(
        "/api/v1/auth/login",
        json={"email": student_email, "password": PASSWORD},
        headers={"X-Auth-Mode": "api"},
    )
    assert bad.status_code == 401


def test_complete_rejects_a_reused_token(client, db):
    email, _ = _signup(client, "reuse")
    _make_admin(db, email)
    admin_headers = _auth(
        client,
        client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": PASSWORD},
            headers={"X-Auth-Mode": "api"},
        ).json()["access_token"],
    )
    student_email, _ = _signup(client, "reuse2")
    raw = client.post(
        "/api/v1/password-reset/issue", json={"email": student_email}, headers=admin_headers
    ).json()["token"]

    client.cookies.clear()
    first = client.post(
        "/api/v1/password-reset/complete",
        json={"token": raw, "new_password": "FirstPassword1!"},
    )
    assert first.status_code == 200

    client.cookies.clear()
    second = client.post(
        "/api/v1/password-reset/complete",
        json={"token": raw, "new_password": "SecondPassword2!"},
    )
    assert second.status_code == 400
    assert "not valid" in second.json()["detail"]


def test_complete_rejects_garbage_and_short_passwords(client):
    client.cookies.clear()
    assert (
        client.post(
            "/api/v1/password-reset/complete",
            json={"token": "nonsense", "new_password": "ValidPassword1!"},
        ).status_code
        == 400
    )
    # Too short is a validation error, not a reset.
    assert (
        client.post(
            "/api/v1/password-reset/complete",
            json={"token": "nonsense", "new_password": "short"},
        ).status_code
        == 422
    )


def test_issue_404s_for_unknown_account(client, db):
    email, _ = _signup(client, "admin404")
    _make_admin(db, email)
    admin_headers = _auth(
        client,
        client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": PASSWORD},
            headers={"X-Auth-Mode": "api"},
        ).json()["access_token"],
    )
    resp = client.post(
        "/api/v1/password-reset/issue",
        json={"email": f"nobody{uuid.uuid4().hex[:6]}@example.com"},
        headers=admin_headers,
    )
    assert resp.status_code == 404
