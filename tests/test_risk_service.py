"""tests/test_risk_service.py

Tests for at-risk detection.

The rules are deterministic heuristics, so every boundary is asserted exactly:
overdue, <24h, <=3d, <=7d, high weight, critical priority, exams, plus the
aggregate signals (heavy week, clustering, no-progress). Determinism is the
point — the dashboard must never flip its verdict between two identical reads.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from app.services import risk_service


class _Task:
    """Minimal stand-in for AcademicTask (only the fields the rules read)."""

    def __init__(
        self,
        hours: float,
        *,
        priority="MEDIUM",
        ttype="ASSIGNMENT",
        weight=None,
        now: datetime | None = None,
    ):
        # Anchor to an explicit clock so a boundary like "exactly 72h" is
        # exact. Using datetime.now() here would make the due date slightly
        # closer than requested (time elapses between the two now() calls) and
        # flip the band intermittently.
        base = now or NOW
        self.due_date = base + timedelta(hours=hours)
        self.priority = priority
        self.task_type = ttype
        self.weight_percentage = weight


# One fixed reference instant shared by every boundary assertion below.
NOW = datetime.now(UTC)


def _level(hours, **kw):
    return risk_service._risk_for_task(_Task(hours, now=NOW, **kw), NOW)[0]


def _reason(hours, **kw):
    return risk_service._risk_for_task(_Task(hours, now=NOW, **kw), NOW)[1]


# ---------------------------------------------------------------------------
# Per-task rule boundaries
# ---------------------------------------------------------------------------

def test_overdue_is_critical():
    assert _level(-1) == "CRITICAL"
    assert "overdue" in _reason(-1).lower()


def test_due_within_24h_is_critical():
    assert _level(23) == "CRITICAL"
    # Just past 24h drops to the next band.
    assert _level(25) == "HIGH"


def test_due_within_3_days_is_high():
    assert _level(72) == "HIGH"


def test_critical_priority_within_7_days_is_high():
    assert _level(120, priority="CRITICAL") == "HIGH"
    assert "critical priority" in _reason(120, priority="CRITICAL").lower()


def test_high_weight_within_7_days_is_high():
    assert _level(120, weight=30) == "HIGH"
    assert "30%" in _reason(120, weight=30)


def test_low_weight_within_7_days_is_medium():
    assert _level(120, weight=5) == "MEDIUM"


def test_exam_within_7_days_is_high():
    assert _level(120, ttype="EXAM") == "HIGH"
    assert _level(120, ttype="TEST") == "HIGH"


def test_far_future_task_is_not_flagged():
    assert _level(24 * 20) is None


def test_risk_is_deterministic():
    """Same input -> same verdict, so the UI never flickers."""
    t = _Task(30, now=NOW)
    first = risk_service._risk_for_task(t, NOW)
    second = risk_service._risk_for_task(t, NOW)
    assert first == second


def test_severity_ordering_is_stable():
    """CRITICAL must sort before HIGH before MEDIUM."""
    order = risk_service._SEVERITY
    assert order["CRITICAL"] < order["HIGH"] < order["MEDIUM"] < order["LOW"]


# ---------------------------------------------------------------------------
# Aggregate signals (via the API, which exercises real DB rows)
# ---------------------------------------------------------------------------

def _token(client, email: str) -> dict:
    client.post(
        "/api/v1/auth/signup",
        json={
            "email": email,
            "password": "MyPassword2026",
            "full_name": "Risk Tester",
            "terms_version": "1.0",
            "privacy_version": "1.0",
        },
    )
    tok = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "MyPassword2026"},
        headers={"x-auth-mode": "api"},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def _module(client, headers, code=None):
    """Create a module and return its id.

    Module codes are unique PER USER, and the shared test database accumulates
    rows across runs, so the caller-supplied code is suffixed with a fresh
    token to keep each run independent.
    """
    suffix = uuid.uuid4().hex[:6].upper()
    code = f"{(code or 'RIS')[:8]}{suffix}"
    resp = client.post(
        "/api/v1/academic/modules",
        json={"code": code, "name": f"Risk Testing {code}"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _task(client, headers, module_id, title, hours, **extra):
    payload = {
        "module_id": module_id,
        "title": title,
        "task_type": extra.get("task_type", "ASSIGNMENT"),
        "due_date": (datetime.now(UTC) + timedelta(hours=hours)).isoformat(),
        "priority": extra.get("priority", "MEDIUM"),
    }
    if extra.get("weight") is not None:
        payload["weight_percentage"] = extra["weight"]
    return client.post(
        "/api/v1/academic/tasks", json=payload, headers=headers
    )


def test_at_risk_endpoint_requires_auth(client):
    assert client.get("/api/v1/academic/at-risk").status_code == 401


def test_empty_state_is_clean(client):
    headers = _token(client, "risk.empty@example.com")
    body = client.get("/api/v1/academic/at-risk", headers=headers).json()
    assert body["tasks"] == []
    assert body["counts"]["total"] == 0
    # A student with no tasks must NOT be told they have "no progress".
    assert all(s["kind"] != "NO_PROGRESS" for s in body["signals"])


def test_flags_and_signals_end_to_end(client):
    headers = _token(client, "risk.full@example.com")
    mod = _module(client, headers)

    assert _task(client, headers, mod, "Overdue report", -30).status_code == 201
    assert _task(client, headers, mod, "Due very soon", 6, priority="HIGH").status_code == 201
    assert _task(client, headers, mod, "Big exam", 120, task_type="EXAM", weight=45).status_code == 201
    assert _task(client, headers, mod, "Cluster A", 100).status_code == 201
    assert _task(client, headers, mod, "Cluster B", 100).status_code == 201
    assert _task(client, headers, mod, "Cluster C", 100).status_code == 201

    body = client.get("/api/v1/academic/at-risk", headers=headers).json()

    assert body["counts"]["total"] >= 6
    assert body["counts"]["critical"] >= 2  # overdue + <24h
    kinds = {s["kind"] for s in body["signals"]}
    assert "HEAVY_WEEK" in kinds
    assert "CLUSTERED" in kinds
    assert "NO_PROGRESS" in kinds  # nothing completed yet

    # Most urgent first: the overdue task leads.
    assert body["tasks"][0]["level"] == "CRITICAL"
    assert "overdue" in body["tasks"][0]["reason"].lower()


def test_completing_a_task_clears_it(client):
    headers = _token(client, "risk.done@example.com")
    mod = _module(client, headers, code="RIS102")
    created = _task(client, headers, mod, "Will complete", 5).json()

    before = client.get("/api/v1/academic/at-risk", headers=headers).json()
    assert any(t["task_id"] == created["id"] for t in before["tasks"])

    # The real endpoint is PATCH with an explicit status body.
    resp = client.patch(
        f"/api/v1/academic/tasks/{created['id']}/complete",
        json={"is_completed": True},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    after = client.get("/api/v1/academic/at-risk", headers=headers).json()
    assert all(t["task_id"] != created["id"] for t in after["tasks"])


def test_tenant_isolation(client):
    """One student's deadlines must never appear in another's risk list."""
    a = _token(client, "risk.a@example.com")
    b = _token(client, "risk.b@example.com")
    mod_b = _module(client, b, code="RIS103")
    _task(client, b, mod_b, "B private overdue", -10)

    a_body = client.get("/api/v1/academic/at-risk", headers=a).json()
    assert a_body["tasks"] == [], "must not leak another student's tasks"


def test_horizon_is_clamped(client):
    headers = _token(client, "risk.horizon@example.com")
    # Absurd values must be clamped, never crash or scan unbounded.
    assert client.get("/api/v1/academic/at-risk?days=0", headers=headers).status_code == 200
    assert client.get("/api/v1/academic/at-risk?days=9999", headers=headers).status_code == 200
