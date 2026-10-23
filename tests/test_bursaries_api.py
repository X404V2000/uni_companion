"""tests/test_bursaries_api.py

PURPOSE
-------
End-to-end proof that GET /api/v1/bursaries/matches returns what it should for a
real student against a real database.

The unit tests in test_bursary_matching.py prove the rules. This file proves the
wiring: authentication, serialisation, and that the exclusions survive the trip
through FastAPI.
"""
import uuid
from datetime import UTC, date, datetime, timedelta

from conftest import PASSWORD, unique_email, valid_signup_payload

from app.models.bursary import Bursary


def _signup_and_token(client):
    client.cookies.clear()
    email = unique_email("bursary")
    signup = client.post("/api/v1/auth/signup", json=valid_signup_payload(email))
    assert signup.status_code == 201, signup.text
    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"X-Auth-Mode": "api"},
    )
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def _auth(client, token):
    client.cookies.clear()
    return {"Authorization": f"Bearer {token}"}


def _bursary(db, **kw):
    defaults = dict(
        name=f"Fund {uuid.uuid4().hex[:6]}",
        provider="Test Provider",
        description="A test fund.",
        url="https://example.org/apply",
        is_active=True,
    )
    defaults.update(kw)
    b = Bursary(**defaults)
    db.add(b)
    db.commit()
    return b


def test_requires_authentication(client):
    client.cookies.clear()
    resp = client.get("/api/v1/bursaries/matches")
    assert resp.status_code == 401


def test_returns_an_eligible_open_bursary(client, db):
    token = _signup_and_token(client)
    b = _bursary(db, application_closes=date.today() + timedelta(days=90))

    resp = client.get("/api/v1/bursaries/matches", headers=_auth(client, token))
    assert resp.status_code == 200, resp.text

    ids = [item["id"] for item in resp.json()["items"]]
    assert str(b.id) in ids


def test_excludes_closed_bursary(client, db):
    """The single most important behaviour of this feature."""
    token = _signup_and_token(client)
    closed = _bursary(db, application_closes=date.today() - timedelta(days=1))

    resp = client.get("/api/v1/bursaries/matches", headers=_auth(client, token))
    ids = [item["id"] for item in resp.json()["items"]]
    assert str(closed.id) not in ids


def test_excludes_inactive_bursary(client, db):
    token = _signup_and_token(client)
    retired = _bursary(db, is_active=False)

    resp = client.get("/api/v1/bursaries/matches", headers=_auth(client, token))
    ids = [item["id"] for item in resp.json()["items"]]
    assert str(retired.id) not in ids


def test_payload_carries_reasons_and_days_left(client, db):
    """The response must be self-explanatory: no bare list of names."""
    token = _signup_and_token(client)
    _bursary(
        db,
        fields_of_study=["computing"],
        application_closes=date.today() + timedelta(days=12),
    )

    resp = client.get("/api/v1/bursaries/matches", headers=_auth(client, token))
    items = resp.json()["items"]
    assert items, "expected at least one match"

    top = next(i for i in items if i["days_left"] == 12)
    assert top["match_reasons"], "match_reasons must never be empty"
    assert any("Closes in 12 days" in r for r in top["match_reasons"])
    assert top["score"] > 0


def test_detail_endpoint_scores_for_the_caller(client, db):
    token = _signup_and_token(client)
    b = _bursary(db, fields_of_study=["computing"])

    resp = client.get(f"/api/v1/bursaries/{b.id}", headers=_auth(client, token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Same scoring as the list view - the detail must not read as "0 matches"
    # for a bursary the student reached by matching it.
    assert body["score"] > 0
    assert body["match_reasons"]


def test_detail_404_for_unknown_id(client):
    token = _signup_and_token(client)
    resp = client.get(f"/api/v1/bursaries/{uuid.uuid4()}", headers=_auth(client, token))
    assert resp.status_code == 404


def test_no_write_surface(client, db):
    """The router is read-only by design; prove it cannot be used to modify data."""
    token = _signup_and_token(client)
    b = _bursary(db, created_at=datetime.now(UTC))
    original = b.name

    resp = client.post(
        f"/api/v1/bursaries/{b.id}", json={"name": "Hijacked"}, headers=_auth(client, token)
    )
    assert resp.status_code in (404, 405), f"unexpected write surface: {resp.status_code}"

    db.refresh(b)
    assert b.name == original
