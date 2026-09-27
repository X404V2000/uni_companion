"""tests/test_analytics_api.py

Month 2, Week 2, Day 3 — Product Validation Instrumentation acceptance tests.

Covers:
1. Feedback: 1-5 rating validation, comment sanitization, auth required.
2. Metrics: admin/student gating (403 for STUDENT), shape correctness.
3. Event recording: core-loop endpoints append usage_events (best-effort).
"""
import uuid

from conftest import PASSWORD, unique_email, valid_signup_payload

from app.core.roles import UserRole
from app.models.analytics import Feedback, UsageEvent
from app.schemas.user import UserCreate
from app.services import user_service


def _signup_and_token(client):
    client.cookies.clear()
    email = unique_email("an")
    signup = client.post("/api/v1/auth/signup", json=valid_signup_payload(email))
    assert signup.status_code == 201, signup.text
    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"X-Auth-Mode": "api"},
    )
    assert login.status_code == 200, login.text
    return email, login.json()["access_token"]


def _create_with_role(db, role: UserRole):
    email = unique_email("anadmin")
    data = UserCreate(
        email=email,
        password=PASSWORD,
        full_name="Analytics Admin",
        terms_version="1.0",
        privacy_version="1.0",
    )
    user_service.create_user(db, data, role=role)
    return email


def _auth(client, token):
    client.cookies.clear()
    return {"Authorization": f"Bearer {token}"}


class TestFeedback:
    def test_submit_valid_feedback(self, client):
        _, token = _signup_and_token(client)
        resp = client.post(
            "/api/v1/analytics/feedback",
            json={"rating": 5, "comment": "Great!"},
            headers=_auth(client, token),
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["rating"] == 5

    def test_rating_out_of_bounds_422(self, client):
        _, token = _signup_and_token(client)
        resp = client.post(
            "/api/v1/analytics/feedback",
            json={"rating": 6},
            headers=_auth(client, token),
        )
        assert resp.status_code == 422

    def test_comment_sanitized(self, client, db):
        _, token = _signup_and_token(client)
        resp = client.post(
            "/api/v1/analytics/feedback",
            json={"rating": 3, "comment": "<script>alert(1)</script>"},
            headers=_auth(client, token),
        )
        assert resp.status_code == 201
        assert "<script>" not in resp.json()["comment"]

    def test_requires_auth(self, client):
        assert client.post("/api/v1/analytics/feedback", json={"rating": 3}).status_code == 401


class TestMetrics:
    def test_student_forbidden(self, client):
        _, token = _signup_and_token(client)
        resp = client.get("/api/v1/admin/metrics", headers=_auth(client, token))
        assert resp.status_code == 403

    def test_admin_can_read_metrics(self, client, db):
        email = _create_with_role(db, UserRole.ADMIN)
        client.cookies.clear()
        login = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": PASSWORD},
            headers={"X-Auth-Mode": "api"},
        )
        assert login.status_code == 200, login.text
        resp = client.get(
            "/api/v1/admin/metrics",
            headers=_auth(client, login.json()["access_token"]),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        for key in (
            "active_users", "total_summaries", "cache_hit_rate",
            "total_materials_searches", "total_sync_pushes",
            "total_dashboard_views", "estimated_cost_zar",
        ):
            assert key in body


class TestEventRecording:
    def test_dashboard_view_recorded(self, client, db):
        _, token = _signup_and_token(client)
        assert client.get(
            "/api/v1/academic/dashboard", headers=_auth(client, token)
        ).status_code == 200
        me = client.get("/api/v1/auth/me", headers=_auth(client, token)).json()
        uid = uuid.UUID(me["id"])
        events = db.query(UsageEvent).filter(UsageEvent.user_id == uid).all()
        assert any(e.event_type == "DASHBOARD_VIEWED" for e in events)


class TestFeedbackModel:
    def test_feedback_row_persisted(self, client, db):
        _, token = _signup_and_token(client)
        resp = client.post(
            "/api/v1/analytics/feedback",
            json={"rating": 4},
            headers=_auth(client, token),
        )
        assert resp.status_code == 201
        fb_id = uuid.UUID(resp.json()["id"])
        assert db.query(Feedback).filter(Feedback.id == fb_id).one().rating == 4
