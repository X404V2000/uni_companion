"""
tests/test_week3_security.py

Adversarial regression tests for the Week 3 Academic Tracker surface:

1. Invalid enum filters (priority/task_type) -> 422 (not silently ignored).
2. Pagination bounds: size out of range -> 422; huge page clamps safely.
3. Mass-assignment: academic create bodies cannot set user_id / id.
4. Cross-tenant IDOR: user B cannot read/delete/patch user A's academic rows.
"""
from conftest import PASSWORD, unique_email, valid_signup_payload


def _signup(client, email=None):
    email = email or unique_email("w3sec")
    r = client.post("/api/v1/auth/signup", json=valid_signup_payload(email))
    assert r.status_code == 201, r.text
    return email


def _login(client, email):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text


def _make_module(client, email, code):
    _login(client, email)
    r = client.post("/api/v1/academic/modules", json={"code": code, "name": "Mod"})
    assert r.status_code == 201, r.text
    return r.json()


class TestFilterEnumValidation:
    def test_invalid_priority_filter_422(self, client):
        email = _signup(client)
        _login(client, email)
        r = client.get("/api/v1/academic/tasks", params={"priority": "NUCLEAR"})
        assert r.status_code == 422

    def test_invalid_task_type_filter_422(self, client):
        email = _signup(client)
        _login(client, email)
        r = client.get("/api/v1/academic/tasks", params={"task_type": "HACK"})
        assert r.status_code == 422


class TestPaginationBounds:
    def test_size_over_100_rejected(self, client):
        email = _signup(client)
        _login(client, email)
        r = client.get("/api/v1/academic/tasks", params={"size": 999})
        assert r.status_code == 422

    def test_page_zero_rejected(self, client):
        email = _signup(client)
        _login(client, email)
        r = client.get("/api/v1/academic/tasks", params={"page": 0})
        assert r.status_code == 422


class TestMassAssignment:
    def test_module_create_ignores_user_id_and_id(self, client, db):
        email = _signup(client)
        _login(client, email)
        r = client.post("/api/v1/academic/modules", json={
            "code": "MAA01",
            "name": "Mass",
            "user_id": "00000000-0000-0000-0000-000000000000",
            "id": "11111111-1111-1111-1111-111111111111",
        })
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["user_id"] != "00000000-0000-0000-0000-000000000000"
        assert body["id"] != "11111111-1111-1111-1111-111111111111"

    def test_task_create_ignores_user_id(self, client):
        email = _signup(client)
        _login(client, email)
        mid = _make_module(client, email, "INF315")["id"]
        r = client.post("/api/v1/academic/tasks", json={
            "module_id": mid,
            "title": "XSS task",
            "due_date": "2026-10-01T12:00:00Z",
            "user_id": "00000000-0000-0000-0000-000000000000",
            "is_completed": True,
        })
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["user_id"] != "00000000-0000-0000-0000-000000000000"
        # is_completed not settable on create -> stays False.
        assert body["is_completed"] is False


class TestCrossTenantIdor:
    def test_user_b_cannot_delete_user_a_module(self, client):
        a = _signup(client)
        b = _signup(client)
        ma = _make_module(client, a, "INF315")
        client.post("/api/v1/auth/logout")
        _login(client, b)
        r = client.delete(f"/api/v1/academic/modules/{ma['id']}")
        assert r.status_code == 404

    def test_user_b_cannot_patch_user_a_task(self, client):
        a = _signup(client)
        b = _signup(client)
        _login(client, a)
        ma = _make_module(client, a, "INF315")
        task = client.post("/api/v1/academic/tasks", json={
            "module_id": ma["id"], "title": "A's task",
            "due_date": "2026-10-01T12:00:00Z",
        }).json()
        client.post("/api/v1/auth/logout")

        _login(client, b)
        r = client.patch(
            f"/api/v1/academic/tasks/{task['id']}/complete",
            json={"is_completed": True},
        )
        assert r.status_code == 404

    def test_user_b_cannot_use_user_a_module_in_slot(self, client):
        a = _signup(client)
        b = _signup(client)
        ma = _make_module(client, a, "INF315")
        client.post("/api/v1/auth/logout")
        _login(client, b)
        r = client.post("/api/v1/academic/timetable", json={
            "module_id": ma["id"],
            "day_of_week": 1,
            "start_time": "09:00",
            "end_time": "10:00",
        })
        assert r.status_code == 404
