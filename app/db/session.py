"""
db/session.py

PURPOSE
-------
Sets up the connection between our FastAPI app and the Neon PostgreSQL
database, using SQLAlchemy, and provides the tools the rest of the app
needs to talk to it safely.

KEY CONCEPTS (for someone new to SQLAlchemy)
--------------------------------------------
-   Engine: the object that actually knows "HOW" to talk to the database,
    manages the connection pool, holds the URL, speaks the Postgres
    protocol via pyscopg
-   Session: a single "conversation" with the database. I can open one, do
    some work (queries, insert, updates), then close it. Sessions are "NOT"
    shared across unrelated requests, each request gets its own.
-   Base: a special parent class. Every database table we define later
    (User, etc.) will inherit from Base. This is how SQLAlchemy knows which
    Python classes correspond to which database tables.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings


def _normalize_database_url(raw_url: str) -> str:
    """Return a database URL guaranteed to use the psycopg v3 driver.

    WHY (root-cause defence): SQLAlchemy maps the bare `postgresql://` scheme
    to the LEGACY `psycopg2` dialect. This project ships `psycopg` (v3), not
    `psycopg2`, so a legacy URL — e.g. an env var left at its historical value
    or a CI config that is slow to migrate — would raise
    `ModuleNotFoundError: No module named 'psycopg2'` the moment the engine is
    built. Rewriting the scheme to the explicit `postgresql+psycopg://` form
    selects the correct dialect and keeps every environment working even if a
    caller forgets the `+psycopg` suffix.

    WHEN: on every import, before `create_engine` consumes the URL.

    HOW: a single, surgical string prefix replacement. URLs already using the
    explicit scheme (or another dialect entirely, e.g. `sqlite://`) are left
    untouched, so this is safe and side-effect free.
    """
    if raw_url.startswith("postgresql://"):
        return raw_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return raw_url


## The engine is created ONCE, when this module is first imported, and
## reused for the app's entire lifetime. Creating a new engine per
## request it would be wasteful, connections are pooled and reused.
##
## pool_pre_ping=True: SQLAlchemy tests each connection before handing
## it out. Neon's free tier suspends idle conncetions after inactivity;
## without this setting, the FIRST request after a quiet period would
## fail with a confusion "connection closed" error instead of silently
## reconnecting.
engine = create_engine(
        _normalize_database_url(settings.database_url),
        pool_pre_ping=True,     # Test connection before using it (handles Neon idle suspension)
        # pool_size lowered from 5 to 2 on 2026-10-26 after Neon reported 80.8%
        # of compute used. Held-open connections are not free on Neon: every idle
        # connection in the pool keeps the compute endpoint busy, so a warm API
        # process held 5 of them awake indefinitely. The app serves one student
        # at a time; two connections are ample, and overflow still covers a burst.
        pool_size=2,            # Keep 2 connections ready in the pool
        max_overflow=3,         # Allow up to 3 additional temporary connections during bursts
        pool_timeout=30,        # If pool is exhausted, wait up to 30s before timing out
        # Recycle sooner. A connection idle for 30 minutes was being held while
        # Neon wanted to scale down; 5 minutes lets the compute endpoint rest
        # between quiet periods instead of being pinned by a stale socket.
        pool_recycle=300,       # Recycle connections after 5 min to prevent stale connections
    )

## SessionLocal is a Factory, not a session itself. Calling SessionLocal()
## produces a new, independent database session each time.
SessionLocal = sessionmaker(
        autocommit=False,   ## We commit changes explicitly ourselves, this
                            ## prevents half-finished writes from being saved
                            ## accidentally.
        autoflush=False,    ## We control when pending changes are sent to the
                            ## database, rather than SQLAlchemy guessing when.
        bind=engine,
    )

## Base is the parent class every database model (User, etc.) will
## inherit from in later days. SQLAlchemy uses this to discover which
## Python classes map to which database tables.
Base = declarative_base()

def get_db():
    """
    A FastAPI "dependency", a function FastAPI calls automatically for
    any endpoint that requests a database session (see main.py for an
    example of this in use).

    This yield-then-close pattern below guarantees a database session is
    "ALWAYS" closed after a request finishes, even if that request raised
    an error partway through. Without the try/finally here, a bug in one
    endpoint could slowly leak open connections until the app runs out
    of them and starts failing for every user.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
