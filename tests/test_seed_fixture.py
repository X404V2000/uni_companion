"""tests/test_seed_fixture.py

Proves the client fixture is idempotent (blueprint acceptance criterion #2),
and guards the two defects that made it unusable despite "working".

WHY THE EXTRA TESTS EXIST
-------------------------
The fixture ran for months without anyone logging in as it, which hid two bugs
that only appear when it is actually USED:

  1. FIXTURE_EMAIL used the reserved ".test" TLD. email-validator (used by the
     Pydantic signup/login schemas) rejects it, so the user existed in the
     database but every login was refused during validation. The fixture could
     never authenticate.

  2. Row ids were derived from the module code alone ("module:INF154"). Module
     codes are unique PER USER, so as soon as a second fixture user existed the
     insert collided on the primary key (UniqueViolation on modules_pkey).

Both are pinned below.
"""
import uuid

import pytest
from pydantic import BaseModel, EmailStr, ValidationError

from app.models.academic import AcademicTask, Module, TimetableSlot
from app.models.user import User
from scripts.seed_client_fixture import FIXTURE_EMAIL, seed


def test_seed_is_idempotent(db):
    """Running the fixture twice yields the same state, no duplicates.

    Uses the test-engine session directly (no HTTP), so it never touches
    rate-limiter state, sends a welcome email, or writes the dev database.
    """
    seed(db)
    first = db.query(User).filter(User.email == FIXTURE_EMAIL).one()
    first_modules = db.query(Module).filter(Module.user_id == first.id).count()
    first_tasks = db.query(AcademicTask).filter(AcademicTask.user_id == first.id).count()
    first_slots = db.query(TimetableSlot).filter(TimetableSlot.user_id == first.id).count()

    seed(db)
    second = db.query(User).filter(User.email == FIXTURE_EMAIL).one()
    assert second.id == first.id
    assert db.query(Module).filter(Module.user_id == second.id).count() == first_modules
    assert db.query(AcademicTask).filter(AcademicTask.user_id == second.id).count() == first_tasks
    assert db.query(TimetableSlot).filter(TimetableSlot.user_id == second.id).count() == first_slots


def test_seed_refuses_remote_db(monkeypatch):
    """The local-only guard must refuse a remote DATABASE_URL."""
    import scripts.seed_client_fixture as mod

    class _FakeSettings:
        database_url = "postgresql+psycopg://u:p@ep-remote.example.com/db"

    monkeypatch.setattr("app.core.config.settings", _FakeSettings(), raising=False)
    try:
        mod._assert_local_db()
    except SystemExit as exc:
        assert "REFUSE" in str(exc)
    else:
        raise AssertionError("expected SystemExit for a remote DATABASE_URL")


def test_guard_allowlist_is_local_only():
    """The allow-list contains only local/docker hosts (no remote hosts)."""
    import scripts.seed_client_fixture as mod

    assert set(mod._LOCAL_DB_HOSTS) == {"localhost", "127.0.0.1", "db"}


# ---------------------------------------------------------------------------
# The fixture email must be usable through the real API validation
# ---------------------------------------------------------------------------

class _EmailProbe(BaseModel):
    """Mirrors the EmailStr validation the signup/login schemas apply."""

    email: EmailStr


def test_fixture_email_passes_api_validation():
    """If this fails, the fixture user can never sign in via the API."""
    _EmailProbe(email=FIXTURE_EMAIL)


def test_fixture_email_is_not_a_reserved_test_tld():
    """`.test` is reserved AND rejected by email-validator."""
    assert not FIXTURE_EMAIL.endswith(".test"), (
        "the .test TLD is rejected by email-validator, so the fixture user "
        "could never log in"
    )


def test_the_old_broken_address_really_does_fail():
    """Documents why the address was changed, so nobody reverts it."""
    with pytest.raises(ValidationError):
        _EmailProbe(email="client.dev@varsitycompanion.test")


def test_fixture_password_meets_the_signup_minimum():
    import scripts.seed_client_fixture as mod

    assert len(mod.FIXTURE_PASSWORD) >= 8


# ---------------------------------------------------------------------------
# Derived ids must be stable AND user-scoped
# ---------------------------------------------------------------------------

def test_ids_are_deterministic():
    """Same label -> same id, which is what keeps re-seeding idempotent."""
    import scripts.seed_client_fixture as mod

    assert mod._id("module:INF154") == mod._id("module:INF154")


def test_ids_are_uuid5():
    import scripts.seed_client_fixture as mod

    derived = mod._id("task:INF154:1")
    assert isinstance(derived, uuid.UUID)
    assert derived.version == 5


def test_ids_are_scoped_to_the_fixture_user(monkeypatch):
    """A different user must not derive the SAME module id.

    This is the regression that produced a UniqueViolation on modules_pkey:
    module codes are unique per user, so ids built from the code alone collide
    as soon as two users share a code.
    """
    import scripts.seed_client_fixture as mod

    first = mod._id("module:INF154")
    monkeypatch.setattr(mod, "FIXTURE_EMAIL", "someone.else@example.com")
    second = mod._id("module:INF154")

    assert first != second


def test_distinct_labels_produce_distinct_ids():
    import scripts.seed_client_fixture as mod

    labels = ["module:INF154", "task:INF154:1", "slot:INF154:2", "material:INF154:0"]
    assert len({mod._id(label) for label in labels}) == len(labels)
