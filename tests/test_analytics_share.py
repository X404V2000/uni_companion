"""tests/test_analytics_share.py

Month 2, Week 2, Day 4 — sharing-signal acceptance tests.
"""
import uuid

import pytest
from conftest import PASSWORD, unique_email, valid_signup_payload

from app.models.academic import Module
from app.models.analytics import UsageEvent


@pytest.fixture(autouse=True)
def _isolate_share_metrics(db):
    """Give the share-metrics tests a hermetic view of the telemetry tables.

    WHY (root cause of the `1.3333 > 1.0` regression):
      `get_metrics()` aggregates `usage_events` and `modules` over a trailing
      seven-day window. The shared test database is session-scoped with NO
      per-test cleanup (deliberate — it amortises bcrypt cost across the
      suite). So by the time `TestShareMetrics` runs, ~30 earlier tests have
      left share events and modules behind; `get_metrics` counts those too.
      A conversion rate of `4 distinct converters / 3 shares = 1.3333` is the
      signature of that cross-test bleed, not a defect in the service (which
      already de-duplicates converters and excludes the sharer).

    WHAT (and why it is safe):
      Delete all `usage_events` rows and all `modules` rows before each test.
        * `usage_events` is append-only telemetry; nothing FK-references it,
          so removing every row is side-effect free.
        * `modules.id` is referenced by `tasks` and `timetable_slots`, both
          `ondelete=CASCADE`, so a `DELETE FROM modules` cascades to children
          at the database level — no orphans.
      Each test then signs up its own users (unique emails) and recreates the
      exact share/module rows it asserts on, so the metric sees ONLY that
      test's window. Users are left untouched (their FK to us is CASCADE, not
      vice-versa).
    """
    # Purge telemetry first (independent table, no dependents).
    db.query(UsageEvent).delete()
    # Purge modules; cascade removes tasks + timetable_slots at the DB level.
    # synchronize_session=False issues a single bulk DELETE (faster and avoids
    # ORM identity-map surprises across the shared session).
    db.query(Module).delete(synchronize_session=False)
    db.commit()


def _signup_and_token(client):
    client.cookies.clear()
    email = unique_email("share")
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


class TestShareEndpoint:
    def test_share_requires_auth(self, client):
        assert client.post(
            "/api/v1/analytics/share", json={"module_code": "INF154"}
        ).status_code == 401

    def test_share_returns_204(self, client):
        token = _signup_and_token(client)
        resp = client.post(
            "/api/v1/analytics/share",
            json={"module_code": "INF154"},
            headers=_auth(client, token),
        )
        assert resp.status_code == 204

    def test_share_rejects_invalid_module_code(self, client):
        token = _signup_and_token(client)
        resp = client.post(
            "/api/v1/analytics/share",
            json={"module_code": "X"},  # min_length=2
            headers=_auth(client, token),
        )
        assert resp.status_code == 422

    def test_share_normalizes_lowercase(self, client, db):
        token = _signup_and_token(client)
        resp = client.post(
            "/api/v1/analytics/share",
            json={"module_code": "inf154"},
            headers=_auth(client, token),
        )
        assert resp.status_code == 204
        me = client.get("/api/v1/auth/me", headers=_auth(client, token)).json()
        uid = uuid.UUID(me["id"])
        events = db.query(UsageEvent).filter(
            UsageEvent.user_id == uid,
            UsageEvent.event_type == "MODULE_SHARE",
        ).all()
        assert any(e.module_code == "INF154" for e in events)


class TestShareMetrics:
    def test_metrics_shares_count_reflects_events(self, client, db):
        token = _signup_and_token(client)
        for _ in range(3):
            assert client.post(
                "/api/v1/analytics/share",
                json={"module_code": "INF154"},
                headers=_auth(client, token),
            ).status_code == 204
        # shares_count is exposed via admin metrics; assert the raw count here.
        me = client.get("/api/v1/auth/me", headers=_auth(client, token)).json()
        uid = uuid.UUID(me["id"])
        count = db.query(UsageEvent).filter(
            UsageEvent.user_id == uid,
            UsageEvent.event_type == "MODULE_SHARE",
        ).count()
        assert count == 3

    def test_metrics_conversion_counts_matching_signup(self, client, db):
        # Sharer A shares INF154; B signs up and creates INF154 module within
        # 7 days -> conversion.
        token_a = _signup_and_token(client)
        assert client.post(
            "/api/v1/analytics/share",
            json={"module_code": "INF154"},
            headers=_auth(client, token_a),
        ).status_code == 204

        token_b = _signup_and_token(client)
        me_b = client.get("/api/v1/auth/me", headers=_auth(client, token_b)).json()
        uid_b = uuid.UUID(me_b["id"])
        # B creates INF154 module (conversion signal).
        db.add(Module(user_id=uid_b, code="INF154", name="Informatics"))
        db.commit()

        # Conversion must exclude the sharer (A) and count B only.
        from app.services import analytics_service

        metrics = analytics_service.get_metrics(db, days=7)
        assert metrics["shares_count"] >= 1
        # A single distinct converter (B) over one share -> rate in (0, 1].
        assert 0.0 <= metrics["share_conversion_rate"] <= 1.0

    def test_metrics_conversion_rate_zero_when_no_shares(self, client, db):
        from app.services import analytics_service

        # No share events in this test's own window -> rate must be exactly 0.0.
        metrics = analytics_service.get_metrics(db, days=7)
        assert "share_conversion_rate" in metrics
        assert metrics["share_conversion_rate"] == 0.0

    def test_metrics_conversion_rate_bounded_one_signup_three_shares(self, client, db):
        """Regression test for the `1.3333 > 1.0` defect.

        Scenario that previously produced the overflow: three shares of the
        SAME module by different sharers, and a single signup that matches all
        three shares. The correct, de-duplicated rate is 1 distinct converter
        over 3 shares = 1/3 ~= 0.3333 — never >= 1.0.
        """
        from app.services import analytics_service

        # Three distinct sharers all share INF154.
        for _ in range(3):
            token = _signup_and_token(client)
            assert client.post(
                "/api/v1/analytics/share",
                json={"module_code": "INF154"},
                headers=_auth(client, token),
            ).status_code == 204

        # One new user signs up and creates the INF154 module (a conversion).
        token_b = _signup_and_token(client)
        me_b = client.get("/api/v1/auth/me", headers=_auth(client, token_b)).json()
        uid_b = uuid.UUID(me_b["id"])
        db.add(Module(user_id=uid_b, code="INF154", name="Informatics"))
        db.commit()

        metrics = analytics_service.get_metrics(db, days=7)
        assert metrics["shares_count"] == 3
        # One distinct converter over three shares -> 1/3, not 1.0 or higher.
        assert metrics["share_conversion_rate"] == pytest.approx(1 / 3, abs=0.0001)
        assert 0.0 <= metrics["share_conversion_rate"] <= 1.0
