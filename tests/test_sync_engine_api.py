"""tests/test_sync_engine_api.py

Month 2, Week 1, Day 3 — Offline Sync engine acceptance tests.

Covers (per SETUP_DAY3.md, widened to tasks+modules+timetable):
1. Delta pull accuracy — since=TIMESTAMP returns only records changed after.
2. Last-Write-Wins — older incoming updates are ignored.
3. Batch boundary — >100 items -> 422.
4. Tenant isolation — cross-user id/module pushes are rejected (403).
5. Auth — 401 without a token.
"""
import uuid
from datetime import UTC, datetime, timedelta

from conftest import PASSWORD, unique_email, valid_signup_payload


def _utc(**kw):
    base = datetime(2026, 1, 1, tzinfo=UTC)
    return base + timedelta(**kw)


def _signup_and_token(client):
    client.cookies.clear()
    email = unique_email("sync")
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


def _push(client, token, **payload):
    return client.post("/api/v1/sync/push", json=payload, headers=_auth(client, token))


def _pull(client, token, since=None):
    params = {"since": since.isoformat()} if since else {}
    return client.get("/api/v1/sync/pull", params=params, headers=_auth(client, token))


def _module_item(mid=None, code="INF154", name="Informatics", updated=None):
    return {
        "id": str(mid or uuid.uuid4()),
        "code": code,
        "name": name,
        "color_code": "#2563eb",
        "updated_at": (updated or _utc(hours=1)).isoformat(),
    }


def _task_item(mid, module_id, title="Do homework", updated=None):
    return {
        "id": str(mid),
        "module_id": str(module_id),
        "title": title,
        "task_type": "ASSIGNMENT",
        "due_date": _utc(days=7).isoformat(),
        "priority": "HIGH",
        "is_completed": False,
        "updated_at": (updated or _utc(hours=1)).isoformat(),
    }


class TestAuth:
    def test_requires_token(self, client):
        assert client.post("/api/v1/sync/push", json={"tasks": []}).status_code == 401
        assert client.get("/api/v1/sync/pull").status_code == 401


class TestDeltaPull:
    def test_since_returns_only_newer(self, client, db):
        token = _signup_and_token(client)
        module_id = uuid.uuid4()

        # Seed a module older than the cutoff.
        old = _module_item(mid=module_id, updated=_utc(hours=-5))
        assert _push(client, token, modules=[old]).status_code == 200

        since = _utc(hours=-2)
        r = _pull(client, token, since=since)
        assert r.status_code == 200, r.text
        body = r.json()
        # The module updated -5h is BEFORE -2h -> excluded.
        assert all(m["id"] != str(module_id) for m in body["modules"])

        # A newer module IS returned.
        new_id = uuid.uuid4()
        new = _module_item(mid=new_id, code="COS132", updated=_utc(hours=1))
        assert _push(client, token, modules=[new]).status_code == 200
        r2 = _pull(client, token, since=since)
        assert any(m["id"] == str(new_id) for m in r2.json()["modules"])


class TestLWW:
    def test_older_write_ignored(self, client, db):
        token = _signup_and_token(client)
        module_id = uuid.uuid4()
        newer = _utc(hours=5)

        # Push a module with a future updated_at.
        assert _push(client, token, modules=[_module_item(mid=module_id, updated=newer)]).status_code == 200

        # Push an OLDER updated_at for same id -> must be ignored.
        stale = _module_item(mid=module_id, name="HACKED", updated=_utc(hours=-1))
        r = _push(client, token, modules=[stale])
        assert r.status_code == 200
        assert r.json()["ignored_changes"] == 1

        pull = _pull(client, token)
        mods = {m["id"]: m for m in pull.json()["modules"]}
        assert mods[str(module_id)]["name"] != "HACKED"


class TestBatchBoundary:
    def test_pushing_101_tasks_rejected(self, client):
        # 101 tasks exceed the 10KB request-body middleware, so the edge
        # returns 413 before Pydantic's list max_length=100 fires. Either way
        # the oversized batch is rejected.
        token = _signup_and_token(client)
        tasks = [_task_item(uuid.uuid4(), uuid.uuid4()) for _ in range(101)]
        r = _push(client, token, tasks=tasks)
        assert r.status_code in (413, 422)


class TestTenantIsolation:
    def test_cross_user_task_id_rejected(self, client, db):
        token_a = _signup_and_token(client)
        token_b = _signup_and_token(client)
        module_id = uuid.uuid4()
        task_id = uuid.uuid4()

        # A owns module + task.
        assert _push(client, token_a, modules=[_module_item(mid=module_id)]).status_code == 200
        assert _push(client, token_b, modules=[_module_item(mid=uuid.uuid4(), code="MATH")]).status_code == 200
        assert _push(client, token_a, tasks=[_task_item(task_id, module_id)]).status_code == 200

        # B tries to push a task with A's task id -> 403 (never clobber).
        evil = _task_item(task_id, module_id, title="OVERWRITE", updated=_utc(hours=9))
        r = _push(client, token_b, tasks=[evil])
        assert r.status_code == 403

    def test_cross_user_module_reference_rejected(self, client, db):
        token_a = _signup_and_token(client)
        token_b = _signup_and_token(client)
        module_id = uuid.uuid4()

        assert _push(client, token_a, modules=[_module_item(mid=module_id)]).status_code == 200

        # B pushes a task referencing A's module -> 403 (FK smuggling blocked).
        r = _push(client, token_b, tasks=[_task_item(uuid.uuid4(), module_id)])
        assert r.status_code == 403


class TestWideSync:
    def test_timetable_sync_roundtrip(self, client, db):
        token = _signup_and_token(client)
        module_id = uuid.uuid4()
        slot_id = uuid.uuid4()

        slot = {
            "id": str(slot_id),
            "module_id": str(module_id),
            "day_of_week": 3,
            "start_time": "09:00:00",
            "end_time": "10:00:00",
            "venue": "Room 4",
            "updated_at": _utc(hours=2).isoformat(),
        }
        assert _push(client, token, modules=[_module_item(mid=module_id)]).status_code == 200
        assert _push(client, token, timetable_slots=[slot]).status_code == 200

        pull = _pull(client, token)
        assert pull.status_code == 200
        body = pull.json()
        assert any(s["id"] == str(slot_id) for s in body["timetable_slots"])


class TestClockSkimGuard:
    def test_far_future_updated_at_is_clamped(self, client, db):
        """A malicious far-future updated_at must not lock a record forever.

        The sync schema clamps updated_at to now + 5 min, so a year-9999
        timestamp is coerced to ~now; it can win the CURRENT LWW round but a
        later legitimate edit (with a real, slightly-newer timestamp) still
        wins afterwards — the record is never permanently locked.
        """
        token = _signup_and_token(client)
        module_id = uuid.uuid4()
        far_future = datetime(9999, 1, 1, tzinfo=UTC)

        r = _push(
            client,
            token,
            modules=[_module_item(mid=module_id, updated=far_future)],
        )
        assert r.status_code == 200
        # The coerced timestamp is close to now, NOT 9999.
        pull = _pull(client, token)
        mod = next(m for m in pull.json()["modules"] if m["id"] == str(module_id))
        stored = datetime.fromisoformat(mod["updated_at"])
        assert abs((stored - datetime.now(UTC)).total_seconds()) < 600

    def test_absurd_due_date_rejected(self, client):
        token = _signup_and_token(client)
        module_id = uuid.uuid4()
        # Seed the module first so only due_date validation is exercised.
        assert _push(client, token, modules=[_module_item(mid=module_id)]).status_code == 200
        evil = _task_item(uuid.uuid4(), module_id)
        evil["due_date"] = datetime(9999, 1, 1, tzinfo=UTC).isoformat()
        r = _push(client, token, tasks=[evil])
        assert r.status_code == 422
