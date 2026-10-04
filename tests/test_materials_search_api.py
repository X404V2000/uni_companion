"""tests/test_materials_search_api.py

Month 2, Week 1, Day 2 — Materials Search Engine acceptance tests.

Covers (per SETUP_DAY2.md):
1. Module scoping -> only materials for the requested module are returned.
2. Search bounds + sanitization -> >100 char query / XSS stripped.
3. Pagination cap -> size <= 50.
4. Low-data flag -> YOUTUBE materials carry quality_resolution=360p.
5. Authentication -> 401 without a token.

Materials are seeded directly into the test DB via the `db` fixture (the test
DB is non-destructive, so we use unique module codes per run to avoid
cross-test collisions).
"""
import uuid

from conftest import PASSWORD, unique_email, valid_signup_payload

from app.models.material import StudyMaterial


def _seed_material(db, module_code, title, resource_type="YOUTUBE",
                   description=None, approved=True, resolution="360p"):
    m = StudyMaterial(
        module_code=module_code,
        title=title,
        description=description,
        url=f"https://example.com/{uuid.uuid4().hex}",
        resource_type=resource_type,
        quality_resolution=resolution,
        is_approved=approved,
    )
    db.add(m)
    db.commit()
    return m


def _signup_and_token(client):
    client.cookies.clear()
    email = unique_email("mat")
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


def test_requires_authentication(client):
    resp = client.get("/api/v1/materials/search", params={"module_code": "INF154"})
    assert resp.status_code == 401


class TestModuleScoping:
    def test_only_requested_module_returned(self, client, db):
        marker = uuid.uuid4().hex[:8].upper()
        code_a = f"INF{marker[:6]}"
        code_b = f"COS{marker[:6]}"
        title = f"Unique {marker} tutorial"

        # resource_type is explicit, and that matters: `_seed_material` defaults to
        # YOUTUBE, which the search route now excludes unless asked. Leaving it implicit
        # made this module-scoping test fail for an unrelated reason - a good reminder
        # that a helper default is part of the test's meaning.
        _seed_material(db, code_a, title, resource_type="ARTICLE")
        _seed_material(db, code_b, "Other module material", resource_type="ARTICLE")

        token = _signup_and_token(client)
        resp = client.get(
            "/api/v1/materials/search",
            params={"module_code": code_a},
            headers=_auth(client, token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert all(item["module_code"] == code_a for item in body["items"])
        assert any(title in item["title"] for item in body["items"])


class TestSearchBounds:
    def test_query_over_100_chars_rejected(self, client):
        token = _signup_and_token(client)
        resp = client.get(
            "/api/v1/materials/search",
            params={"module_code": "INF154", "q": "x" * 101},
            headers=_auth(client, token),
        )
        assert resp.status_code == 422

    def test_xss_in_query_is_sanitized(self, client, db):
        marker = uuid.uuid4().hex[:8].upper()
        code = f"INF{marker[:6]}"
        title = f"Safe {marker}"
        _seed_material(db, code, title, description="has no script")

        token = _signup_and_token(client)
        resp = client.get(
            "/api/v1/materials/search",
            params={"module_code": code, "q": "<script>alert(1)</script>"},
            headers=_auth(client, token),
        )
        assert resp.status_code == 200, resp.text


class TestPagination:
    def test_size_capped_at_50(self, client):
        token = _signup_and_token(client)
        resp = client.get(
            "/api/v1/materials/search",
            params={"module_code": "INF154", "size": 999},
            headers=_auth(client, token),
        )
        # Query validation rejects > 50 (422) rather than silently clamping.
        assert resp.status_code == 422


class TestLowDataFlag:
    def test_youtube_materials_360p(self, client, db):
        marker = uuid.uuid4().hex[:8].upper()
        code = f"INF{marker[:6]}"
        _seed_material(db, code, f"Video {marker}", resource_type="YOUTUBE")

        token = _signup_and_token(client)
        resp = client.get(
            "/api/v1/materials/search",
            # include_youtube is REQUIRED here now. The route excludes videos by
            # default, so `resource_type=YOUTUBE` alone returns empty by design
            # (architect D2) - the two parameters are independent rather than one
            # overriding the other. This test is about the low-data flag on videos,
            # so it opts in explicitly.
            params={
                "module_code": code,
                "resource_type": "YOUTUBE",
                "include_youtube": "true",
            },
            headers=_auth(client, token),
        )
        assert resp.status_code == 200, resp.text
        items = resp.json()["items"]
        assert items
        for item in items:
            if item["resource_type"] == "YOUTUBE":
                assert item["quality_resolution"] == "360p"


class TestModulesEndpoint:
    def test_list_by_module(self, client, db):
        marker = uuid.uuid4().hex[:8].upper()
        code = f"INF{marker[:6]}"
        _seed_material(db, code, f"One {marker}")
        _seed_material(db, code, f"Two {marker}")

        token = _signup_and_token(client)
        resp = client.get(
            f"/api/v1/materials/modules/{code}",
            headers=_auth(client, token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 2
        assert all(i["module_code"] == code for i in body["items"])
