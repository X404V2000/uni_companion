"""tests/test_study_plan_api.py

PURPOSE
-------
GET /api/v1/study-plan through FastAPI against a real database: auth, tenant
scoping, and that the plan reflects only the caller's own tasks.
"""
import uuid
from datetime import UTC, datetime, timedelta

from conftest import PASSWORD, unique_email, valid_signup_payload

from app.models.academic import AcademicTask, Module


def _signup_and_token(client):
    client.cookies.clear()
    email = unique_email("plan")
    assert client.post("/api/v1/auth/signup", json=valid_signup_payload(email)).status_code == 201
    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"X-Auth-Mode": "api"},
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    # The login body carries user metadata but not reliably an id; /auth/me is
    # the documented source of the caller's identity.
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    return token, me.json()["id"]


def _auth(client, token):
    client.cookies.clear()
    return {"Authorization": f"Bearer {token}"}


def _module(db, user_id, code="COS132"):
    m = Module(id=uuid.uuid4(), user_id=user_id, code=code, name="Imperative Programming")
    db.add(m)
    db.commit()
    return m


def _task(db, user_id, module_id, title, days=2, weight=40, completed=False, ttype="ASSIGNMENT"):
    t = AcademicTask(
        id=uuid.uuid4(),
        user_id=user_id,
        module_id=module_id,
        title=title,
        task_type=ttype,
        due_date=datetime.now(UTC) + timedelta(days=days),
        weight_percentage=weight,
        is_completed=completed,
    )
    db.add(t)
    db.commit()
    return t


def test_requires_authentication(client):
    client.cookies.clear()
    assert client.get("/api/v1/study-plan").status_code == 401


def test_plan_totals_the_callers_tasks(client, db):
    token, user_id = _signup_and_token(client)
    uid = uuid.UUID(user_id)
    mod = _module(db, uid)
    _task(db, uid, mod.id, "Practical 3", days=2)
    _task(db, uid, mod.id, "Quiz 1", days=4, weight=10, ttype="QUIZ")

    resp = client.get("/api/v1/study-plan", headers=_auth(client, token))
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["task_count"] == 2
    assert body["total_hours"] > 0
    assert len(body["focus"]) == 2
    assert body["focus"][0]["module_code"] == "COS132"
    assert body["assumption_note"]


def test_completed_tasks_are_not_counted(client, db):
    token, user_id = _signup_and_token(client)
    uid = uuid.UUID(user_id)
    mod = _module(db, uid)
    _task(db, uid, mod.id, "done already", days=2, completed=True)
    _task(db, uid, mod.id, "still open", days=2)

    body = client.get("/api/v1/study-plan", headers=_auth(client, token)).json()
    assert body["task_count"] == 1
    assert body["focus"][0]["title"] == "still open"


def test_tasks_outside_the_week_are_excluded(client, db):
    token, user_id = _signup_and_token(client)
    uid = uuid.UUID(user_id)
    mod = _module(db, uid)
    _task(db, uid, mod.id, "soon", days=3)
    _task(db, uid, mod.id, "next month", days=30)

    body = client.get("/api/v1/study-plan", headers=_auth(client, token)).json()
    assert body["task_count"] == 1


def test_other_students_tasks_are_not_included(client, db):
    """Tenant isolation: a second account's deadlines must not appear."""
    token_a, user_a = _signup_and_token(client)
    _token_b, user_b = _signup_and_token(client)
    mod_b = _module(db, uuid.UUID(user_b), "MAM201")
    _task(db, uuid.UUID(user_b), mod_b.id, "someone else's exam", days=2)

    body = client.get("/api/v1/study-plan", headers=_auth(client, token_a)).json()
    assert all("someone else" not in f["title"] for f in body["focus"])
    assert body["task_count"] == 0


def test_empty_plan_returns_zeros_not_an_error(client):
    token, _uid = _signup_and_token(client)
    body = client.get("/api/v1/study-plan", headers=_auth(client, token)).json()
    assert body["task_count"] == 0
    assert body["total_hours"] == 0
    assert body["focus"] == []
