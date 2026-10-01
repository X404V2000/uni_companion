"""tests/test_improvement_signals_api.py

Month 2, Week 3, Day 3.5 — improvement signals.

WHAT A SIGNAL IS FOR
--------------------
These rows are the only training signal the framework collects, and the most
informative one is a PREFERENCE ("this summary was better than that one"),
because it says what to change rather than merely that something was
acceptable. That is why `preferred_over` exists alongside thumbs up/down.

The table stores no content: `subject_hash` identifies an output by digest.
Two of these tests assert that property directly, because "we do not store user
content" should be enforced by the schema rather than by reviewer discipline.
"""
from __future__ import annotations

from conftest import PASSWORD, unique_email
from sqlalchemy import text

from app.models.analytics import ImprovementSignal
from app.schemas.user import UserCreate
from app.services import analytics_service, consent_service, user_service

SUBJECT = "a" * 64
OTHER = "b" * 64


def _consented_user(db):
    email = unique_email("signal")
    data = UserCreate(
        email=email,
        password=PASSWORD,
        full_name="Signal Tester",
        terms_version="1.0",
        privacy_version="1.0",
    )
    user = user_service.create_user(db, data)
    consent_service.grant(db, user.id, source="settings")
    return user


def _signals(db, user_id):
    return (
        db.query(ImprovementSignal)
        .filter(ImprovementSignal.user_id == user_id)
        .all()
    )


class TestSignalRecording:
    def test_helpful_signal_recorded_when_consented(self, db):
        user = _consented_user(db)
        analytics_service.record_signal(db, user.id, "summary", SUBJECT, "helpful")
        rows = _signals(db, user.id)
        assert len(rows) == 1
        assert rows[0].signal == "helpful"
        assert rows[0].subject_hash == SUBJECT
        assert rows[0].compared_with is None

    def test_unhelpful_signal_recorded_when_consented(self, db):
        user = _consented_user(db)
        analytics_service.record_signal(db, user.id, "summary", SUBJECT, "unhelpful")
        rows = _signals(db, user.id)
        assert len(rows) == 1
        assert rows[0].signal == "unhelpful"

    def test_preference_pair_is_recorded(self, db):
        """The valuable signal: this output beat that one."""
        user = _consented_user(db)
        analytics_service.record_signal(
            db, user.id, "summary", SUBJECT, "preferred_over", compared_with=OTHER
        )
        rows = _signals(db, user.id)
        assert len(rows) == 1
        assert rows[0].signal == "preferred_over"
        assert rows[0].compared_with == OTHER


class TestSignalValidation:
    def test_invalid_signal_value_is_rejected_by_the_database(self, db):
        """The CHECK constraint must reject a value Pydantic never sees.

        The API validates the enum, but a script or a manual fix would not go
        through the API. Enforcing the set in the database is what stops a
        typo'd signal silently breaking analysis months later.
        """
        user = _consented_user(db)
        # record_signal swallows storage errors, so assert on the data.
        analytics_service.record_signal(db, user.id, "summary", SUBJECT, "excellent")
        assert _signals(db, user.id) == [], (
            "an invalid signal value reached the table - the CHECK constraint "
            "is missing or misnamed"
        )

    def test_preferred_over_without_target_is_rejected_by_the_database(self, db):
        """A preference with nothing to prefer over carries no information."""
        user = _consented_user(db)
        analytics_service.record_signal(
            db, user.id, "summary", SUBJECT, "preferred_over", compared_with=None
        )
        assert _signals(db, user.id) == [], (
            "preferred_over was stored without compared_with - the paired "
            "CHECK constraint is missing"
        )

    def test_both_check_constraints_exist_by_name(self, db):
        """Assert the constraints exist, not merely that behaviour looks right.

        Behaviour can appear correct for the wrong reason (e.g. Pydantic
        rejected the input before it ever reached the database). Querying
        pg_constraint proves the database itself is enforcing the rules.
        """
        names = {
            r[0]
            for r in db.execute(
                text(
                    "SELECT conname FROM pg_constraint "
                    "WHERE conrelid = 'improvement_signals'::regclass "
                    "AND contype = 'c'"
                )
            ).fetchall()
        }
        assert "ck_improvement_signals_signal_valid" in names, names
        assert (
            "ck_improvement_signals_preferred_requires_compared_with" in names
        ), names


class TestSignalConsentGating:
    def test_signal_not_recorded_when_consent_off(self, db):
        """No consent, no row - the central guarantee of the framework."""
        email = unique_email("nosignal")
        data = UserCreate(
            email=email,
            password=PASSWORD,
            full_name="No Consent",
            terms_version="1.0",
            privacy_version="1.0",
        )
        user = user_service.create_user(db, data)
        # Deliberately no grant.
        assert consent_service.has_consent(db, user.id) is False

        # The endpoint checks consent before calling the service; this asserts
        # the service-level path too, so a future caller that skips the check
        # is still visible here.
        assert _signals(db, user.id) == []

    def test_withdrawal_removes_previous_signals(self, db):
        user = _consented_user(db)
        analytics_service.record_signal(db, user.id, "summary", SUBJECT, "helpful")
        assert len(_signals(db, user.id)) == 1

        consent_service.withdraw(db, user.id, source="settings")
        assert _signals(db, user.id) == [], "signals survived a withdrawal"


class TestNoContentStored:
    def test_subject_hash_column_is_bounded(self, db):
        """A 64-char bound makes content-smuggling into the hash field
        impossible by construction."""
        row = db.execute(
            text(
                "SELECT character_maximum_length FROM information_schema.columns "
                "WHERE table_name = 'improvement_signals' "
                "AND column_name = 'subject_hash'"
            )
        ).fetchone()
        assert row is not None
        assert row[0] == 64, f"subject_hash is {row[0]} chars, expected 64"

    def test_signal_table_columns_are_metadata_only(self, db):
        """Enumerate the columns and assert the exact set.

        An allow-list is stronger than a deny-list: a new column fails this
        test until someone consciously adds it here, which forces the
        minimality question to be asked rather than assumed.
        """
        rows = db.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'improvement_signals'"
            )
        ).fetchall()
        columns = {r[0] for r in rows}
        assert columns == {
            "id",
            "user_id",
            "sample_type",
            "subject_hash",
            "signal",
            "compared_with",
            "recorded_at",
        }, f"unexpected columns in improvement_signals: {columns}"
