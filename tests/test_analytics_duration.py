"""tests/test_analytics_duration.py

Month 2, Week 2, Day 4 — friction (duration) acceptance tests. Locks the
percentile convention (nearest-rank, rounded index) with hand-computed values.
"""
import uuid

from conftest import PASSWORD, unique_email

from app.core.roles import UserRole
from app.models.analytics import UsageEvent
from app.schemas.user import UserCreate
from app.services import analytics_service, user_service


def _make_user(db) -> uuid.UUID:
    data = UserCreate(
        email=unique_email("dur"),
        password=PASSWORD,
        full_name="Duration Tester",
        terms_version="1.0",
        privacy_version="1.0",
    )
    return user_service.create_user(db, data, role=UserRole.STUDENT).id


class TestDurationRecording:
    def test_record_duration_stores_value(self, db):
        """Duration telemetry is Category B, so it requires consent (Day 3.5)."""
        uid = _make_user(db)
        analytics_service.record_duration(
            db, uid, "SUMMARIZE_DURATION", 1234, has_consent=True
        )
        row = db.query(UsageEvent).filter(
            UsageEvent.user_id == uid,
            UsageEvent.event_type == "SUMMARIZE_DURATION",
        ).one()
        assert row.duration_ms == 1234

    def test_duration_out_of_bounds_silently_dropped(self, db):
        uid = _make_user(db)
        analytics_service.record_duration(db, uid, "SUMMARIZE_DURATION", -1)
        analytics_service.record_duration(db, uid, "SUMMARIZE_DURATION", 600_001)
        rows = db.query(UsageEvent).filter(UsageEvent.user_id == uid).all()
        assert rows == []

    def test_record_duration_rejects_unknown_event_type(self, db):
        uid = _make_user(db)
        analytics_service.record_duration(db, uid, "NOT_A_REAL_EVENT", 100)
        assert db.query(UsageEvent).filter(UsageEvent.user_id == uid).count() == 0


class TestPercentiles:
    def test_p50_p95_hand_computed(self):
        # durations [100, 200, 300, 400]
        # nearest-rank p50 -> index round(0.5*3)=2 -> 300
        # nearest-rank p95 -> index round(0.95*3)=3 -> 400
        assert analytics_service._percentile([100, 200, 300, 400], 0.50) == 300.0
        assert analytics_service._percentile([100, 200, 300, 400], 0.95) == 400.0

    def test_percentile_none_when_no_samples(self):
        assert analytics_service._percentile([], 0.50) is None
        assert analytics_service._percentile([], 0.95) is None

    def test_p95_never_less_than_p50(self):
        values = [50, 90, 10, 200, 30, 500]
        p50 = analytics_service._percentile(values, 0.50)
        p95 = analytics_service._percentile(values, 0.95)
        assert p50 is not None and p95 is not None
        assert p95 >= p50


class TestGuard:
    def test_event_types_enum_is_single_source_of_truth(self):
        """Every event type the service references must be a registered enum
        member (prevents silent metric drift from typos)."""
        from app.core.event_types import ALL_EVENT_TYPE_VALUES

        referenced = {
            "SUMMARY_GENERATED",
            "SUMMARY_CACHE_HIT",
            "MATERIALS_SEARCHED",
            "SYNC_PUSHED",
            "DASHBOARD_VIEWED",
            "MODULE_SHARE",
            "SUMMARIZE_DURATION",
            "SYNC_PUSH_DURATION",
        }
        assert referenced <= set(ALL_EVENT_TYPE_VALUES)

    def test_persisted_event_types_match_enum(self):
        """Locks the contract between what's stored in the DB and the EventType
        enum. A future enum refactor must not silently orphan existing rows
        (the Day 4 casing catch — data on disk is UPPERCASE, prose is not)."""
        from app.core.event_types import EventType

        enum_values = {e.value for e in EventType}
        for v in enum_values:
            assert v == v.upper(), f"EventType {v!r} is not uppercase"
        for v in enum_values:
            assert EventType(v).value == v
