"""
tests/test_academic_tasks_api.py

Task endpoint tests (Week 3 Day 4):

- enum validation (invalid task_type/priority -> 422)
- module ownership (foreign module -> 404)
- completion toggle (completed_at set on complete, None on uncomplete)
- tenant isolation (list scoped; cross-user patch -> 404)
- auth required (401)
"""
from conftest import PASSWORD, unique_email, valid_signup_payload


def _signup(client, email=None):
    email = email or unique_email("task")
    r = client.post("/api/v1/auth/signup", json=valid_signup_payload(email))
    assert r.status_code == 201, r.text
    return email


def _login(client, email):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text


def _make_module(client, email, code="INF315"):
    _login(client, email)
    r = client.post("/api/v1/academic/modules", json={"code": code, "name": "Mod"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _make_task(client, module_id, **overrides):
    payload = {
        "module_id": module_id,
        "title": "Assignment 1",
        "task_type": "ASSIGNMENT",
        "due_date": "2026-10-01T12:00:00Z",
        "priority": "MEDIUM",
    }
    payload.update(overrides)
    return client.post("/api/v1/academic/tasks", json=payload)


class TestTaskValidation:
    def test_invalid_enum_422(self, client):
        email = _signup(client)
        _login(client, email)
        mid = _make_module(client, email)
        assert _make_task(client, mid, task_type="PROJECT").status_code == 422
        assert _make_task(client, mid, priority="URGENT").status_code == 422

    def test_unauthenticated_401(self, client):
        assert client.get("/api/v1/academic/tasks").status_code == 401


class TestTaskTenantAndLifecycle:
    def test_foreign_module_404(self, client):
        a = _signup(client)
        b = _signup(client)
        mid_a = _make_module(client, a, code="INF315")
        _login(client, b)
        r = _make_task(client, mid_a)
        assert r.status_code == 404

    def test_completion_toggle(self, client):
        email = _signup(client)
        _login(client, email)
        mid = _make_module(client, email)
        created = _make_task(client, mid)
        assert created.status_code == 201
        tid = created.json()["id"]
        assert created.json()["is_completed"] is False
        assert created.json()["completed_at"] is None

        # Complete
        done = client.patch(f"/api/v1/academic/tasks/{tid}/complete",
                            json={"is_completed": True})
        assert done.status_code == 200
        assert done.json()["is_completed"] is True
        assert done.json()["completed_at"] is not None

        # Un-complete
        undone = client.patch(f"/api/v1/academic/tasks/{tid}/complete",
                              json={"is_completed": False})
        assert undone.status_code == 200
        assert undone.json()["is_completed"] is False
        assert undone.json()["completed_at"] is None

    def test_list_scoped_to_user(self, client):
        a = _signup(client)
        b = _signup(client)
        _login(client, a)
        mid_a = _make_module(client, a, code="INF315")
        _make_task(client, mid_a)
        client.post("/api/v1/auth/logout")
        _login(client, b)
        resp = client.get("/api/v1/academic/tasks")
        assert resp.status_code == 200
        assert resp.json()["items"] == []  # B has no tasks

    def test_cross_user_patch_404(self, client):
        a = _signup(client)
        b = _signup(client)
        _login(client, a)
        mid_a = _make_module(client, a, code="INF315")
        created = _make_task(client, mid_a)
        tid = created.json()["id"]
        client.post("/api/v1/auth/logout")

        _login(client, b)
        r = client.patch(f"/api/v1/academic/tasks/{tid}/complete",
                         json={"is_completed": True})
        assert r.status_code == 404
