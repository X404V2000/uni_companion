"""tests/test_consent_api.py

Month 2, Week 3, Day 3.5 — POPIA consent framework.

WHY THESE TESTS ARE DIFFERENT FROM THE REST OF THE SUITE
--------------------------------------------------------
Most tests here prove a feature works. These prove a legal obligation is
honoured, and the failure mode they guard against is not a crash - it is
quietly collecting data from someone who never agreed to it.

So they are written to fail on the ORIGIN of a leak, not just its symptom:
  * "no event written" is checked against the table, not the API response,
    because a 200 with nothing stored and a 200 with something stored look
    identical from outside.

The five marked MANDATORY are the ones that map directly to POPIA conditions
(lawful processing, minimality, and the right to withdraw).
"""
from __future__ import annotations

from conftest import PASSWORD, unique_email

from app.models.analytics import ImprovementSignal, UsageEvent, UserConsent
from app.models.user import User
from app.schemas.user import UserCreate
from app.services import analytics_service, consent_service, user_service

CONSENT_URL = "/api/v1/analytics/consent"
HISTORY_URL = "/api/v1/analytics/consent/history"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _user_and_token(db, client, prefix="consent"):
    email = unique_email(prefix)
    data = UserCreate(
        email=email,
        password=PASSWORD,
        full_name="Consent Tester",
        terms_version="1.0",
        privacy_version="1.0",
    )
    user = user_service.create_user(db, data)
    client.cookies.clear()
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"X-Auth-Mode": "api"},
    )
    assert resp.status_code == 200, resp.text
    return user, resp.json()["access_token"]


def _auth(client, token):
    client.cookies.clear()
    return {"Authorization": f"Bearer {token}"}


def _grant(client, token, source="settings"):
    return client.post(
        CONSENT_URL,
        json={"granted": True, "source": source},
        headers=_auth(client, token),
    )


def _withdraw(client, token, source="settings"):
    return client.post(
        CONSENT_URL,
        json={"granted": False, "source": source},
        headers=_auth(client, token),
    )


def _event_count(db, user_id) -> int:
    return db.query(UsageEvent).filter(UsageEvent.user_id == user_id).count()


# ---------------------------------------------------------------------------
# MANDATORY 1 — no collection without consent
# ---------------------------------------------------------------------------

class TestConsentGating:
    def test_record_event_skipped_without_consent(self, db):
        """MANDATORY: the recorder must write nothing when consent is absent.

        This is the core POPIA guarantee. It is asserted at the table, not at
        the API, because a swallowed event and a stored event are
        indistinguishable from a caller's point of view.
        """
        # Build a user directly; no HTTP needed for a service-level guarantee.
        email = unique_email("gate")
        data = UserCreate(
            email=email, password=PASSWORD, full_name="Gated",
            terms_version="1.0", privacy_version="1.0",
        )
        user = user_service.create_user(db, data)

        analytics_service.record_event(
            db, user.id, "DASHBOARD_VIEWED", has_consent=False
        )
        assert _event_count(db, user.id) == 0, (
            "an event was stored for a user who has not consented"
        )

    def test_record_event_writes_when_consented(self, db):
        """The positive control: gating must not break collection entirely."""
        email = unique_email("gate")
        data = UserCreate(
            email=email, password=PASSWORD, full_name="Gated",
            terms_version="1.0", privacy_version="1.0",
        )
        user = user_service.create_user(db, data)

        analytics_service.record_event(
            db, user.id, "DASHBOARD_VIEWED", has_consent=True
        )
        assert _event_count(db, user.id) == 1

    def test_record_event_defaults_to_no_write(self, db):
        """Calling without the flag must be SAFE, not convenient.

        A future caller who forgets the argument should silently record
        nothing. The opposite default would turn a missing keyword argument
        into a compliance breach.
        """
        email = unique_email("gate")
        data = UserCreate(
            email=email, password=PASSWORD, full_name="Gated",
            terms_version="1.0", privacy_version="1.0",
        )
        user = user_service.create_user(db, data)

        analytics_service.record_event(db, user.id, "DASHBOARD_VIEWED")
        assert _event_count(db, user.id) == 0

    def test_duration_events_also_gated(self, db):
        """Duration telemetry is Category B too - it must be gated as well.

        Exercised through the WRAPPER (`record_duration`), not `record_event`,
        because a wrapper that forgets to forward the flag would pass a test
        that only checks the inner function.
        """
        email = unique_email("gate")
        data = UserCreate(
            email=email, password=PASSWORD, full_name="Gated",
            terms_version="1.0", privacy_version="1.0",
        )
        user = user_service.create_user(db, data)

        analytics_service.record_duration(
            db, user.id, "SUMMARIZE_DURATION", 120, has_consent=False
        )
        assert _event_count(db, user.id) == 0

        analytics_service.record_duration(
            db, user.id, "SUMMARIZE_DURATION", 120, has_consent=True
        )
        assert _event_count(db, user.id) == 1
        # Proves the wrapper forwards the flag through to the write.
        del user


# ---------------------------------------------------------------------------
# MANDATORY 2 & 3 — withdrawal stops collection and deletes what exists
# ---------------------------------------------------------------------------

class TestWithdrawal:
    def test_withdrawal_stops_collection_immediately(self, client, db):
        """MANDATORY: after withdrawal, new events must not be stored."""
        user, token = _user_and_token(db, client)
        _grant(client, token)
        analytics_service.record_event(
            db, user.id, "DASHBOARD_VIEWED", has_consent=True
        )
        assert _event_count(db, user.id) == 1

        assert _withdraw(client, token).status_code == 200

        # The service no longer considers them consented...
        assert consent_service.has_consent(db, user.id) is False
        # ...and a new event is not stored.
        analytics_service.record_event(
            db, user.id, "DASHBOARD_VIEWED", has_consent=False
        )
        assert _event_count(db, user.id) == 0, (
            "an event survived the withdrawal, or the delete did not run"
        )

    def test_withdrawal_deletes_existing_category_b_data(self, client, db):
        """MANDATORY: withdrawal purges data already collected."""
        user, token = _user_and_token(db, client)
        _grant(client, token)

        for _ in range(3):
            analytics_service.record_event(
                db, user.id, "MATERIALS_SEARCHED", has_consent=True
            )
        analytics_service.record_signal(
            db, user.id, "summary", "a" * 64, "helpful"
        )
        assert _event_count(db, user.id) == 3
        assert (
            db.query(ImprovementSignal)
            .filter(ImprovementSignal.user_id == user.id)
            .count()
            == 1
        )

        assert _withdraw(client, token).status_code == 200

        assert _event_count(db, user.id) == 0, "usage events survived withdrawal"
        assert (
            db.query(ImprovementSignal)
            .filter(ImprovementSignal.user_id == user.id)
            .count()
            == 0
        ), "improvement signals survived withdrawal"

    def test_withdrawal_keeps_its_own_audit_row(self, client, db):
        """The withdrawal record must NOT be deleted by its own purge.

        The delete is deliberately scoped to Category B. If it were broad, the
        evidence that a withdrawal happened would be destroyed by the very
        operation that needs to be provable.
        """
        user, token = _user_and_token(db, client)
        _grant(client, token)
        _withdraw(client, token)

        rows = consent_service.history(db, user.id)
        assert len(rows) == 2, f"expected grant + withdrawal, got {len(rows)}"
        assert rows[0].granted is False  # newest first
        assert rows[1].granted is True


# ---------------------------------------------------------------------------
# MANDATORY 4 — cascade on account deletion
# ---------------------------------------------------------------------------

class TestCascadeOnAccountDeletion:
    def test_account_deletion_cascades_to_consent_and_signals(self, db):
        """MANDATORY: deleting a user removes their consent rows and signals.

        An audit trail that outlives the account it describes is itself a
        breach, so the FK cascade is a compliance requirement rather than a
        tidiness preference.
        """
        email = unique_email("cascade")
        data = UserCreate(
            email=email, password=PASSWORD, full_name="Cascade",
            terms_version="1.0", privacy_version="1.0",
        )
        user = user_service.create_user(db, data)
        uid = user.id

        consent_service.grant(db, uid, source="onboarding")
        analytics_service.record_signal(db, uid, "summary", "b" * 64, "helpful")
        assert db.query(UserConsent).filter(UserConsent.user_id == uid).count() == 1
        assert (
            db.query(ImprovementSignal)
            .filter(ImprovementSignal.user_id == uid)
            .count()
            == 1
        )

        db.query(User).filter(User.id == uid).delete()
        db.commit()

        assert db.query(UserConsent).filter(UserConsent.user_id == uid).count() == 0
        assert (
            db.query(ImprovementSignal)
            .filter(ImprovementSignal.user_id == uid)
            .count()
            == 0
        ), "signals outlived the account - the FK cascade is missing"


# ---------------------------------------------------------------------------
# MANDATORY 5 — history is preserved (the reason this is not a boolean)
# ---------------------------------------------------------------------------

class TestAuditability:
    def test_consent_history_is_preserved(self, client, db):
        """MANDATORY: grant -> withdraw -> grant leaves three rows.

        This is the test that a boolean column would fail. After the sequence
        the current state is `granted`, so a boolean would read `true` - and
        the withdrawal in the middle would be invisible.
        """
        user, token = _user_and_token(db, client)
        _grant(client, token, source="onboarding")
        _withdraw(client, token, source="settings")
        _grant(client, token, source="settings")

        rows = consent_service.history(db, user.id)
        assert len(rows) == 3
        assert [r.granted for r in rows] == [True, False, True]
        # Current state follows the latest row.
        assert consent_service.has_consent(db, user.id) is True

    def test_grant_and_withdraw_recorded_with_timestamps(self, client, db):
        user, token = _user_and_token(db, client)
        _grant(client, token)
        _withdraw(client, token)

        rows = consent_service.history(db, user.id)
        for row in rows:
            assert row.recorded_at is not None
        # Newest first, so the withdrawal must not predate the grant.
        assert rows[0].recorded_at >= rows[1].recorded_at

    def test_history_endpoint_exposes_the_audit_trail(self, client, db):
        _, token = _user_and_token(db, client)
        _grant(client, token, source="onboarding")
        _withdraw(client, token)

        resp = client.get(HISTORY_URL, headers=_auth(client, token))
        assert resp.status_code == 200, resp.text
        entries = resp.json()["entries"]
        assert len(entries) == 2
        assert entries[0]["granted"] is False
        assert entries[0]["source"] == "settings"
        assert entries[1]["source"] == "onboarding"
        assert entries[0]["recorded_at"] is not None


# ---------------------------------------------------------------------------
# Consent API behaviour
# ---------------------------------------------------------------------------

class TestConsentApi:
    def test_consent_default_is_off(self, client, db):
        """A brand-new account has not consented, and that must be explicit."""
        _, token = _user_and_token(db, client)
        resp = client.get(CONSENT_URL, headers=_auth(client, token))
        assert resp.status_code == 200
        assert resp.json()["granted"] is False

    def test_invalid_source_rejected(self, client, db):
        """`source` is a closed set, so an invented value must be refused."""
        _, token = _user_and_token(db, client)
        resp = client.post(
            CONSENT_URL,
            json={"granted": True, "source": "webhook"},
            headers=_auth(client, token),
        )
        assert resp.status_code == 422

    def test_consent_requires_auth(self, client, db):
        client.cookies.clear()
        assert client.get(CONSENT_URL).status_code == 401

    def test_get_consent_does_not_mutate(self, client, db):
        """Reading must not create a row - absence of a decision is not a
        decision, and GET must stay idempotent."""
        user, token = _user_and_token(db, client)
        client.get(CONSENT_URL, headers=_auth(client, token))
        client.get(CONSENT_URL, headers=_auth(client, token))
        assert db.query(UserConsent).filter(UserConsent.user_id == user.id).count() == 0


# ---------------------------------------------------------------------------
# The reason consent lives on the request, not inside the recorder
# ---------------------------------------------------------------------------

class TestConsentIsAmortised:
    def test_consent_resolution_is_one_query_per_request(self, db):
        """BUNDLE 11.1: resolving consent must not scale with event count.

        If consent were looked up inside `record_event`, the dashboard - which
        fires two events per load - would double its queries on the app's
        hottest endpoint. This asserts the resolver is a single indexed read,
        which is what makes caching it on the user object worthwhile.
        """
        email = unique_email("amort")
        data = UserCreate(
            email=email, password=PASSWORD, full_name="Amort",
            terms_version="1.0", privacy_version="1.0",
        )
        user = user_service.create_user(db, data)
        consent_service.grant(db, user.id, source="settings")

        # Capture the id FIRST. Reading `user.id` can itself emit a SELECT
        # (lazy refresh), so touching it inside the measurement window would
        # count a query that has nothing to do with consent resolution - which
        # is exactly the false failure this test produced on its first run.
        uid = user.id

        queries: list[str] = []
        from sqlalchemy import event as sa_event

        bind = db.get_bind()

        def _record(conn, cursor, statement, params, context, executemany):
            queries.append(statement)

        sa_event.listen(bind, "before_cursor_execute", _record)
        try:
            result = consent_service.has_consent(db, uid)
        finally:
            sa_event.remove(bind, "before_cursor_execute", _record)

        assert result is True
        selects = [q for q in queries if q.strip().upper().startswith("SELECT")]
        assert len(selects) == 1, (
            f"consent resolution issued {len(selects)} SELECTs. It must be a "
            f"single indexed lookup: {selects}"
        )
        # Belt and braces: assert the single query is against the consent
        # table, so a passing count cannot come from querying something else.
        assert "user_consents" in selects[0], selects[0]


# ---------------------------------------------------------------------------
# Minimality enforced by structure
# ---------------------------------------------------------------------------

class TestNoContentIsStorable:
    def test_signal_table_has_no_text_content_columns(self, db):
        """BUNDLE: minimality is enforced by the schema, not by discipline.

        If a future migration adds a `content`, `text` or `body` column, this
        fails - which is the point. The guarantee that we never store user
        content should be structural, because a rule that lives only in a
        reviewer's memory is not a guarantee.
        """
        from sqlalchemy import text

        for table in ("improvement_signals", "user_consents"):
            rows = db.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = :t"
                ),
                {"t": table},
            ).fetchall()
            names = {r[0].lower() for r in rows}
            forbidden = {
                "content", "text", "body", "notes", "input", "output",
                "summary", "message", "raw", "payload", "document",
            }
            overlap = names & forbidden
            assert not overlap, (
                f"{table} has content-bearing column(s) {sorted(overlap)}. "
                "This framework stores metadata only."
            )
            assert names, f"{table} not found - did the migration run?"

    def test_signal_stores_a_hash_not_content(self, db):
        """A long value in subject_hash must be rejected as over-length.

        The column is 64 chars (a SHA-256 hex digest). That bound is what makes
        it impossible to smuggle a paragraph of notes into the hash field.
        """
        email = unique_email("smuggle")
        data = UserCreate(
            email=email, password=PASSWORD, full_name="Smuggle",
            terms_version="1.0", privacy_version="1.0",
        )
        user = user_service.create_user(db, data)

        # record_signal is best-effort: it swallows storage failures so
        # telemetry can never break a user's request. So the assertion is on
        # the DATA, not on an exception. A value longer than the 64-char
        # column must not be persisted.
        analytics_service.record_signal(db, user.id, "summary", "x" * 500, "helpful")

        stored = (
            db.query(ImprovementSignal)
            .filter(ImprovementSignal.user_id == user.id)
            .all()
        )
        assert stored == [], (
            "an over-length value was stored in subject_hash; the 64-char bound "
            "is what prevents content being smuggled into a hash field"
        )
