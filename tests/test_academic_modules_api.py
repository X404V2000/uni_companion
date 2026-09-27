"""
tests/test_academic_modules_api.py

Endpoint tests for Week 3 Day 2 Module Management API:

- Code normalization (lowercase -> uppercase, trimmed).
- Duplicate code for same user -> 400 with exact message.
- Tenant isolation: user A only sees A's modules; user B delete A's -> 404.
- Authentication required (401 without a token).
"""
from conftest import PASSWORD, unique_email, valid_signup_payload


def _signup(client, email=None):
    email = email or unique_email("module")
    resp = client.post("/api/v1/auth/signup", json=valid_signup_payload(email))
    assert resp.status_code == 201, resp.text
    return email


def _login(client, email):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text


def _create_module(client, code="INF315", name="Systems Analysis"):
    return client.post(
        "/api/v1/academic/modules",
        json={"code": code, "name": name},
    )


class TestModuleCreate:
    def test_normalizes_code_and_creates(self, client):
        email = _signup(client)
        _login(client, email)
        resp = _create_module(client, code=" inf315 ", name="Systems")
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["code"] == "INF315"
        assert body["name"] == "Systems"

    def test_duplicate_code_same_user_400(self, client):
        email = _signup(client)
        _login(client, email)
        assert _create_module(client, code="COS132").status_code == 201
        dup = _create_module(client, code="cos132")  # normalized to COS132
        assert dup.status_code == 400
        assert "already exists" in dup.json().get("detail", "")

    def test_unauthenticated_401(self, client):
        assert client.get("/api/v1/academic/modules").status_code == 401
        assert client.post(
            "/api/v1/academic/modules", json={"code": "INF315", "name": "X"}
        ).status_code == 401


class TestTenantIsolation:
    def test_user_sees_only_own_modules(self, client):
        a = _signup(client)
        b = _signup(client)
        _login(client, a)
        _create_module(client, code="INF315", name="A module")
        # Switch to B (logout clears cookie; login as B)
        client.post("/api/v1/auth/logout")
        _login(client, b)
        resp = client.get("/api/v1/academic/modules")
        assert resp.status_code == 200
        codes = [m["code"] for m in resp.json()]
        assert "INF315" not in codes  # B must not see A's module

    def test_user_cannot_delete_others_module(self, client):
        a = _signup(client)
        b = _signup(client)
        _login(client, a)
        created = _create_module(client, code="INF315", name="A module")
        a_module_id = created.json()["id"]
        client.post("/api/v1/auth/logout")

        _login(client, b)
        resp = client.delete(f"/api/v1/academic/modules/{a_module_id}")
        assert resp.status_code == 404  # not found, no info leak

    def test_owner_can_delete_own_module(self, client):
        email = _signup(client)
        _login(client, email)
        created = _create_module(client, code="INF315", name="Mine")
        mid = created.json()["id"]
        resp = client.delete(f"/api/v1/academic/modules/{mid}")
        assert resp.status_code == 204
        # Gone from listing.
        assert client.get("/api/v1/academic/modules").json() == []
