"""
tests/conftest.py

Shared fixtures for the Day 4 automated security test suite.

DESIGN / ISOLATION
------------------
Tests run against a DEDICATED PostgreSQL database on the same Neon project
(`varsity_companion_test`), NEVER the real dev/production database. The
fixtures:

  * derive the test DB URL from the app's configured DATABASE_URL,
    switching the db name AND connecting through the direct (non-pooler)
    endpoint;
  * SAFETY GUARD: refuse to run unless the target database really is the
    dedicated `*_test` database (so a config typo can never point tests at
    a real/production database);
  * create missing tables ONLY via `create_all` — tests NEVER drop anything
    (no drop_all on startup or teardown);
  * override FastAPI's `get_db` dependency so every endpoint talks only to
    the test database;
  * reset slowapi's in-memory rate-limit counters before each test so rate
    limit tests never bleed into unrelated tests.

The app's own lifespan handler is NOT executed (we don't enter the TestClient
as a context manager), so the real development engine is never touched.
"""
import os
import uuid
from urllib.parse import urlparse, urlunparse

# ---------------------------------------------------------------------------
# Test-environment defaults. MUST run before `app.core.config` is imported.
# ---------------------------------------------------------------------------
# WHY: Settings requires JWT_SECRET_KEY, and in a normal checkout that value
# lives in a local `.env` file, which is deliberately gitignored. So a FRESH
# CLONE could not run the suite at all - collection failed with
# "jwt_secret_key: Field required" and pytest exited 4 with zero tests run.
# CI worked only because the workflow sets the variable explicitly, which hid
# the problem from anyone working locally.
#
# setdefault (not assignment) so a developer's real .env, or CI's value, always
# wins. These are obviously-fake test values; a weak-secret guard rejects
# placeholder strings, so the value is long and clearly non-production.
os.environ.setdefault(
    "JWT_SECRET_KEY", "pytest-only-non-secret-key-min-32-characters-long"
)
# Point at a throwaway local database by default; the dedicated test-database
# guard below still refuses to run against anything not named *_test.
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://app_user:app_password@127.0.0.1:5544/varsity_companion_test",
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.rate_limiter import limiter
from app.db.session import get_db
from app.main import app

TEST_DB_NAME = "varsity_companion_test"
# Any database name we run tests against MUST end with this marker. This is
# the safety net preventing tests from ever mutating a real production DB.
TEST_DB_SUFFIX = "_test"

# Password hashing is slow on purpose (bcrypt work factor 12). Keep the
# whole suite reasonable by amortising across sessions only when safe.
PASSWORD = "SecurePass_12345"


def _test_database_url() -> str:
    """Build a connection string to the dedicated test DB.

    Resolution order:
      1. An explicit TEST_DATABASE_URL env var, if set (used by CI, where the
         Postgres service container URL differs from the local Neon setup).
      2. Otherwise, derive from the app's DATABASE_URL (local dev: the Neon
         project), swapping the database name and using the direct endpoint.

    EITHER WAY the final database name MUST end with the TEST_DB_SUFFIX
    marker, so a misconfigured env var can never point the suite at a real
    or production database.
    """
    explicit = os.getenv("TEST_DATABASE_URL")
    if explicit:
        url = explicit
        name = urlparse(url).path.lstrip("/")
        if not name.endswith(TEST_DB_SUFFIX):
            raise RuntimeError(
                f"Refusing to run tests: TEST_DATABASE_URL points at database "
                f"'{name}', which does not end with '{TEST_DB_SUFFIX}'."
            )
        return url

    p = urlparse(settings.database_url)
    # Fail loudly if we'd ever point away from our controlled *_test database.
    if not TEST_DB_NAME.endswith(TEST_DB_SUFFIX):
        raise RuntimeError(
            f"Refusing to run tests: TEST_DB_NAME '{TEST_DB_NAME}' does not end "
            f"with '{TEST_DB_SUFFIX}'."
        )

    host = p.hostname or ""
    if "-pooler." in host:
        host = host.replace("-pooler.", ".")

    userinfo = ""
    if p.username:
        userinfo = p.username
        if p.password:
            userinfo += ":" + p.password
        userinfo += "@"

    # Include the PORT. Omitting it silently redirected the suite to the
    # default 5432 instead of the configured 5544 (the Docker Postgres),
    # producing 275 connection-refused errors that looked like a broken
    # environment rather than a bug in this function.
    netloc = userinfo + host
    if p.port:
        netloc += f":{p.port}"
    return urlunparse(
        (p.scheme, netloc, "/" + TEST_DB_NAME, p.params, p.query, p.fragment)
    )


@pytest.fixture(scope="session")
def test_engine():
    """Engine bound to the dedicated test DB, schema applied via Alembic.

    NON-DESTRUCTIVE by design:
    - Alembic `upgrade head` only creates/mutates what is not yet applied
      (tracked in `alembic_version`), preserving existing rows/schema.
    - The synthetic error path (create_all + raw ALTER) is gone: migrations
      are the single source of truth for schema, mirroring production.
    """
    url = _test_database_url()
    engine = create_engine(
        url,
        pool_pre_ping=True,
        pool_size=2,
        max_overflow=2,
    )
    # Apply migrations idempotently against the isolated test DB.
    _upgrade_test_db(url)

    yield engine
    # Teardown only releases resources — no data is removed.
    engine.dispose()


def _upgrade_test_db(url: str) -> None:
    """Run `alembic upgrade head` against the given (test) database URL."""
    from alembic import command
    from alembic.config import Config

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)
    cfg.set_main_option("script_location", "alembic")
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session")
def _session_factory(test_engine):
    maker = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)
    return maker


@pytest.fixture()
def db(_session_factory):
    """Yields a fresh DB session on the test engine for direct row access."""
    session = _session_factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(_session_factory):
    """
    FastAPI TestClient with all DB traffic isolated to the test database.

    Also clears slowapi's in-memory counters before every test.
    """
    # Isolate rate-limit state per test.
    storage = getattr(limiter, "_storage", None)
    if storage is not None:
        try:
            storage.reset()
        except Exception:  # noqa: S110 - best-effort; backend may lack reset()
            pass

    def _override_get_db():
        """Replacement `get_db`: one fresh session per request."""
        session = _session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override_get_db

    # NOTE: intentionally NOT entering `with TestClient(...)` so FastAPI's
    # lifespan handler (which runs create_all on the DEV engine) is skipped.
    client = TestClient(app)

    yield client

    app.dependency_overrides.pop(get_db, None)


def unique_email(prefix: str = "student") -> str:
    """Deterministic-ish unique email for isolated signups per test."""
    return f"{prefix}+{uuid.uuid4().hex[:12]}@example.com"


def valid_signup_payload(email: str, password: str = PASSWORD) -> dict:
    """A signup payload that passes every Day 3 schema validation rule."""
    return {
        "email": email,
        "password": password,
        "full_name": "Test Student",
        "university": "Test University",
        "field_of_study": "Computer Science",
        "year_of_study": 2,
        "terms_version": "1.0",
        "privacy_version": "1.0",
    }
