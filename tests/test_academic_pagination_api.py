"""
tests/test_academic_pagination_api.py

Week 3 Day 5 pagination + filtering tests:

- page/size bounds + total/pages metadata
- date-window filtering (from_date/to_date)
- compound AND filters (module_id + priority + is_completed)
- pagination respects tenant isolation
"""
from conftest import PASSWORD, unique_email, valid_signup_payload


def _signup(client, email=None):
    email = email or unique_email("page")
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
    return r.json()["id"]


def _make_task(client, module_id, title, priority="MEDIUM", task_type="ASSIGNMENT",
               due="2026-10-01T12:00:00Z"):
    r = client.post("/api/v1/academic/tasks", json={
        "module_id": module_id, "title": title, "priority": priority,
        "task_type": task_type, "due_date": due,
    })
    assert r.status_code == 201, r.text
    return r.json()


class TestPagination:
    def test_page_size_bounds_and_metadata(self, client):
        email = _signup(client)
        _login(client, email)
        mid = _make_module(client, email, "INF315")
        for i in range(7):
            _make_task(client, mid, f"Task {i}", due=f"2026-10-0{i+1}T12:00:00Z")

        r = client.get("/api/v1/academic/tasks", params={"page": 1, "size": 5})
        assert r.status_code == 200
        body = r.json()
        assert len(body["items"]) == 5
        assert body["total"] == 7
        assert body["page"] == 1
        assert body["size"] == 5
        assert body["pages"] == 2

        # Second page has the remaining 2.
        r2 = client.get("/api/v1/academic/tasks", params={"page": 2, "size": 5})
        assert len(r2.json()["items"]) == 2

    def test_size_upper_bound_enforced(self, client):
        email = _signup(client)
        _login(client, email)
        r = client.get("/api/v1/academic/tasks", params={"size": 999})
        assert r.status_code == 422  # le=100


class TestFiltering:
    def test_date_window(self, client):
        email = _signup(client)
        _login(client, email)
        mid = _make_module(client, email, "INF315")
        _make_task(client, mid, "Early", due="2026-09-01T12:00:00Z")
        _make_task(client, mid, "InRange", due="2026-09-15T12:00:00Z")
        _make_task(client, mid, "Late", due="2026-09-30T12:00:00Z")

        r = client.get("/api/v1/academic/tasks", params={
            "from_date": "2026-09-10T00:00:00Z",
            "to_date": "2026-09-20T00:00:00Z",
        })
        assert r.status_code == 200
        titles = [t["title"] for t in r.json()["items"]]
        assert titles == ["InRange"]

    def test_compound_filters(self, client):
        email = _signup(client)
        _login(client, email)
        mid = _make_module(client, email, "INF315")
        _make_task(client, mid, "High incomplete", priority="HIGH")
        _make_task(client, mid, "High done", priority="HIGH")
        _make_task(client, mid, "Low incomplete", priority="LOW")
        # Complete the "High done" task.
        all_tasks = client.get("/api/v1/academic/tasks").json()["items"]
        hd = next(t for t in all_tasks if t["title"] == "High done")
        client.patch(f"/api/v1/academic/tasks/{hd['id']}/complete",
                     json={"is_completed": True})

        r = client.get("/api/v1/academic/tasks", params={
            "module_id": mid, "priority": "HIGH", "is_completed": "false",
        })
        assert r.status_code == 200
        titles = [t["title"] for t in r.json()["items"]]
        # Only the HIGH, incomplete task remains (module_id + priority + not done).
        assert titles == ["High incomplete"]


class TestPaginationIsolation:
    def test_user_never_sees_other_users_tasks(self, client):
        a = _signup(client)
        b = _signup(client)
        _login(client, a)
        mid_a = _make_module(client, a, "INF315")
        _make_task(client, mid_a, "A's secret task")
        client.post("/api/v1/auth/logout")

        _login(client, b)
        r = client.get("/api/v1/academic/tasks")
        assert r.status_code == 200
        assert r.json()["items"] == []
        assert r.json()["total"] == 0
