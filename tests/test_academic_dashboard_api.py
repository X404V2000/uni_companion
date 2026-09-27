"""tests/test_academic_dashboard_api.py

Month 2, Week 1, Day 4 — unified academic dashboard acceptance tests.

Covers (per SETUP_DAY4.md):
1. Aggregation returns today's slots, urgent tasks (<=5), ai_quota, modules.
2. Task bounds: no more than 5 urgent tasks.
3. Tenant isolation: every component only for the authenticated user.
4. Auth: 401 without a token.
"""
import uuid
from datetime import UTC, datetime, time, timedelta

from conftest import PASSWORD, unique_email, valid_signup_payload

from app.models.academic import AcademicTask, Module, TimetableSlot


def _signup_and_token(client):
    client.cookies.clear()
    email = unique_email("dash")
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


def _make_module(db, user_id, code="INF154"):
    m = Module(user_id=user_id, code=code, name="Informatics", color_code="#2563eb")
    db.add(m)
    db.commit()
    return m


def _make_task(db, user_id, module_id, title, due_hours=24):
    t = AcademicTask(
        user_id=user_id,
        module_id=module_id,
        title=title,
        task_type="ASSIGNMENT",
        due_date=datetime.now(UTC) + timedelta(hours=due_hours),
        priority="HIGH",
        is_completed=False,
    )
    db.add(t)
    db.commit()
    return t


def _make_slot(db, user_id, module_id, day_of_week, start="09:00"):
    s = TimetableSlot(
        user_id=user_id,
        module_id=module_id,
        day_of_week=day_of_week,
        start_time=time.fromisoformat(start),
        end_time=time.fromisoformat("10:00"),
    )
    db.add(s)
    db.commit()
    return s


def test_requires_authentication(client):
    assert client.get("/api/v1/academic/dashboard").status_code == 401


class TestAggregation:
    def test_returns_snapshot(self, client, db):
        token = _signup_and_token(client)
        # The token sub identifies the user, but we need their id for seeding;
        # fetch it via /me.
        me = client.get("/api/v1/auth/me", headers=_auth(client, token)).json()
        uid = uuid.UUID(me["id"])

        mod = _make_module(db, uid)
        today_dow = datetime.now(UTC).weekday() + 1  # 1=Mon..7=Sun
        _make_slot(db, uid, mod.id, today_dow)
        _make_task(db, uid, mod.id, "Urgent homework", due_hours=1)

        r = client.get("/api/v1/academic/dashboard", headers=_auth(client, token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "today_slots" in body and "urgent_tasks" in body
        assert "ai_quota" in body and "modules_count" in body
        assert body["modules_count"] == 1
        assert len(body["today_slots"]) == 1
        assert any(t["title"] == "Urgent homework" for t in body["urgent_tasks"])


class TestTaskBounds:
    def test_urgent_tasks_capped_at_5(self, client, db):
        token = _signup_and_token(client)
        me = client.get("/api/v1/auth/me", headers=_auth(client, token)).json()
        uid = uuid.UUID(me["id"])
        mod = _make_module(db, uid)

        for i in range(8):
            _make_task(db, uid, mod.id, f"Task {i}", due_hours=i + 1)

        r = client.get("/api/v1/academic/dashboard", headers=_auth(client, token))
        assert r.status_code == 200
        assert len(r.json()["urgent_tasks"]) == 5


class TestTenantIsolation:
    def test_data_scoped_to_user(self, client, db):
        token_a = _signup_and_token(client)
        token_b = _signup_and_token(client)
        me_a = client.get("/api/v1/auth/me", headers=_auth(client, token_a)).json()
        me_b = client.get("/api/v1/auth/me", headers=_auth(client, token_b)).json()
        uid_a = uuid.UUID(me_a["id"])
        uid_b = uuid.UUID(me_b["id"])

        _make_module(db, uid_a, "INF154")
        mod_b = _make_module(db, uid_b, "COS132")
        _make_task(db, uid_b, mod_b.id, "B's private task")

        # A's dashboard must NOT contain B's task or module.
        r = client.get("/api/v1/academic/dashboard", headers=_auth(client, token_a))
        assert r.status_code == 200
        body = r.json()
        assert all(t["title"] != "B's private task" for t in body["urgent_tasks"])
        assert body["modules_count"] == 1  # only A's INF154
