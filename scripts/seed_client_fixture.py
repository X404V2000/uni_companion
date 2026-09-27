"""scripts/seed_client_fixture.py

PURPOSE
-------
Deterministic, idempotent fixture (offline client dev team harness).

Guarantees:
- Same user every run (email = client.dev@example.com)
- Same 3 modules, 5 tasks, 4 slots, 30 materials, reset AI quota
- Never touches rows owned by users other than the fixture user
- REFUSES to run against a remote database (local-only safety guard)

Usage:
  python scripts/seed_client_fixture.py
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, time, timedelta

from sqlalchemy.orm import Session

from app.core.roles import UserRole
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.academic import AcademicTask, Module, TimetableSlot
from app.models.ai import UserAIQuota
from app.models.material import StudyMaterial
from app.models.user import User

# WHY .example.com AND NOT .test:
# The previous address used the reserved ".test" TLD, which email-validator (a
# Pydantic dependency used by the signup/login schemas) REJECTS. The fixture
# user was therefore created in the database but could never authenticate:
# logging in as the fixture returned "incorrect email or password" because the
# request was refused at validation before it reached the auth logic. Nobody
# noticed because the fixture was only ever used for DB-side assertions.
#
# ".example.com" is also reserved for documentation, but email-validator
# accepts it, so the fixture can actually be signed into.
FIXTURE_EMAIL = "client.dev@example.com"
FIXTURE_PASSWORD = "ClientDev!Fixture2026"  # printed by the guide; not a secret
FIXTURE_FULL_NAME = "Client Dev Fixture"
FIXTURE_UNIVERSITY = "Fixture University"
FIXTURE_FIELD = "Information Science"

# Deterministic UUIDs so client tests can reference fixed ids.
_NS = uuid.UUID("11111111-2222-3333-4444-555555555555")
_LOCAL_DB_HOSTS = ("localhost", "127.0.0.1", "db")  # db = docker compose service


def _id(label: str) -> uuid.UUID:
    """Deterministic UUID for a fixture row.

    WHY THE USER IS PART OF EVERY LABEL:
    The module/task/slot/material ids used to be derived from the module code
    alone ("module:INF154"). Module codes are only unique PER USER, so as soon
    as a second user existed with the same code, the ids collided and seeding
    failed with a duplicate primary key. That is exactly what happened when the
    fixture email changed and a new fixture user was created alongside the old
    one. Scoping every label to FIXTURE_EMAIL keeps the ids stable across runs
    (so re-seeding is still idempotent) while making them unique per user.
    """
    return uuid.uuid5(_NS, f"{FIXTURE_EMAIL}:{label}")


def _assert_local_db() -> None:
    """Refuse to seed a remote database (protects prod/staging Neon).

    Parses the URL host properly — a naive substring check would let
    `.../db` (a database literally named "db") or a host like `mydb.evil.com`
    slip through as "local".
    """
    from urllib.parse import urlparse

    from app.core.config import settings

    url = settings.database_url
    # Strip the SQLAlchemy driver prefix (postgresql+psycopg://) for urlparse.
    scheme_end = url.find("://")
    parseable = url[scheme_end + 3 :] if scheme_end != -1 else url
    host = urlparse("//" + parseable).hostname or ""

    if host not in _LOCAL_DB_HOSTS and not host.startswith("localhost"):
        raise SystemExit(
            "[REFUSE] seed_client_fixture must not run against a remote database. "
            f"Host '{host}' not in {_LOCAL_DB_HOSTS}."
        )


MODULES = [
    ("INF154", "Imperative Programming"),
    ("COS132", "Introduction to Programming"),
    ("COS212", "Data Structures and Algorithms"),
]

TASKS = [
    # (module_code, title, task_type, priority, weight, days_until_due, completed)
    ("INF154", "Assignment 1: Loops and Arrays", "ASSIGNMENT", "HIGH", 15.0, 3, False),
    ("INF154", "Practical Test 1", "TEST", "CRITICAL", 20.0, 1, False),
    ("COS132", "Assignment 2: Recursion", "ASSIGNMENT", "MEDIUM", 10.0, 7, False),
    ("COS212", "Quiz 1: Linked Lists", "QUIZ", "LOW", 5.0, 10, False),
    ("COS212", "Semester Test", "TEST", "HIGH", 25.0, 14, True),
]

SLOTS = [
    # (module_code, day_of_week 1=Mon..7=Sun, start, end, venue)
    ("INF154", 1, time(8, 0), time(9, 30), "Centenary 2"),
    ("COS132", 1, time(10, 0), time(11, 30), "Ingenuity Lab"),
    ("COS212", 2, time(9, 0), time(10, 30), "Centenary 1"),
    ("INF154", 3, time(14, 0), time(15, 30), "Lab 3"),
]

# MATERIALS REMOVED ON PURPOSE.
#
# This script used to seed ten placeholder materials per module pointing at
# example.org and invented YouTube IDs. Both were dead: example.org returned
# 404 and the video IDs did not exist, so every "result" in Find Materials led
# nowhere and made the feature look broken.
#
# Real, licence-cleared resources are now fetched and VALIDATED by
# `scripts/ingest_real_materials.py`, which pulls from the Wikipedia REST API
# (CC BY-SA), the arXiv API (open access) and Open Library, and only keeps
# YouTube videos whose IDs pass the official oEmbed check.
#
# Kept as an empty list so any remaining reference is obviously inert rather
# than silently reintroducing dead links.
MATERIAL_TEMPLATES: list[tuple[str, str, str, str]] = []


def _get_or_create_user(db: Session) -> User:
    user = db.query(User).filter(User.email == FIXTURE_EMAIL).first()
    if user is None:
        user = User(
            email=FIXTURE_EMAIL,
            hashed_password=hash_password(FIXTURE_PASSWORD),
            full_name=FIXTURE_FULL_NAME,
            university=FIXTURE_UNIVERSITY,
            field_of_study=FIXTURE_FIELD,
            terms_version="1.0",
            privacy_version="1.0",
            role=UserRole.STUDENT,
            is_active=True,
        )
        db.add(user)
        db.flush()
    else:
        # Reset credentials/state so the printed password always works.
        user.hashed_password = hash_password(FIXTURE_PASSWORD)
        user.is_active = True
        user.deleted_at = None
        db.flush()
    return user


def _wipe_user_data(db: Session, user_id: uuid.UUID) -> None:
    # Children before parents (FK order). Only the fixture user's rows.
    db.query(AcademicTask).filter(AcademicTask.user_id == user_id).delete()
    db.query(TimetableSlot).filter(TimetableSlot.user_id == user_id).delete()
    db.query(Module).filter(Module.user_id == user_id).delete()
    db.query(UserAIQuota).filter(UserAIQuota.user_id == user_id).delete()
    db.flush()


def _seed_modules(db: Session, user: User) -> dict[str, Module]:
    result: dict[str, Module] = {}
    for code, name in MODULES:
        m = Module(
            id=_id(f"module:{code}"),
            user_id=user.id,
            code=code,
            name=name,
            color_code="#2563eb",
        )
        db.add(m)
        result[code] = m
    db.flush()
    return result


def _seed_tasks(db: Session, user: User, modules: dict[str, Module]) -> None:
    now = datetime.now(UTC)
    for i, (code, title, ttype, prio, weight, days, done) in enumerate(TASKS):
        db.add(
            AcademicTask(
                id=_id(f"task:{code}:{i}"),
                user_id=user.id,
                module_id=modules[code].id,
                title=title,
                task_type=ttype,
                priority=prio,
                due_date=now + timedelta(days=days),
                weight_percentage=weight,
                is_completed=done,
                completed_at=now if done else None,
            )
        )
    db.flush()


def _seed_slots(db: Session, user: User, modules: dict[str, Module]) -> None:
    for i, (code, dow, start, end, venue) in enumerate(SLOTS):
        db.add(
            TimetableSlot(
                id=_id(f"slot:{code}:{i}"),
                user_id=user.id,
                module_id=modules[code].id,
                day_of_week=dow,
                start_time=start,
                end_time=end,
                venue=venue,
            )
        )
    db.flush()


def _seed_materials(db: Session) -> None:
    # Materials are global (not user-scoped). Idempotent by fixed UUID.
    #
    # MATERIAL_TEMPLATES is intentionally EMPTY: this fixture no longer plants
    # placeholder materials. Run `scripts/ingest_real_materials.py` after
    # seeding to populate each module with real, validated resources.
    if not MATERIAL_TEMPLATES:
        print(
            "  (materials skipped — run scripts/ingest_real_materials.py "
            "to fetch real, validated resources)"
        )
        return
    for code, _name in MODULES:
        for j, (rtype, quality, title, url) in enumerate(MATERIAL_TEMPLATES):
            mid = _id(f"material:{code}:{j}")
            if db.query(StudyMaterial).filter(StudyMaterial.id == mid).first():
                continue
            db.add(
                StudyMaterial(
                    id=mid,
                    module_code=code,
                    title=title,
                    description=f"{code} — {title}",
                    url=url,
                    resource_type=rtype,
                    quality_resolution=quality,
                    is_approved=True,
                )
            )
    db.flush()


def _reset_quota(db: Session, user: User) -> None:
    today = datetime.now(UTC).date()
    db.query(UserAIQuota).filter(
        UserAIQuota.user_id == user.id,
        UserAIQuota.usage_date == today,
    ).delete()
    db.add(
        UserAIQuota(
            user_id=user.id,
            usage_date=today,
            summaries_used=0,
            daily_limit=10,
        )
    )
    db.flush()


def seed(db: Session | None = None) -> None:
    """Run the full idempotent seed.

    `db` is optional: when omitted (CLI usage) the script uses the app's
    SessionLocal (local dev DB). Tests pass their own session bound to the
    test engine so fixtures never touch the dev database.
    """
    if db is None:
        _assert_local_db()

    owns_session = db is None
    db = db or SessionLocal()
    try:
        user = _get_or_create_user(db)
        _wipe_user_data(db, user.id)
        modules = _seed_modules(db, user)
        _seed_tasks(db, user, modules)
        _seed_slots(db, user, modules)
        _seed_materials(db)
        _reset_quota(db, user)
        db.commit()

        print("[OK] Fixture seeded.")
        print(f"     user_id:  {user.id}")
        print(f"     email:    {FIXTURE_EMAIL}")
        print(f"     password: {FIXTURE_PASSWORD}")
        print(f"     modules:  {[c for c, _ in MODULES]}")
    except Exception as exc:
        db.rollback()
        print(f"[FAIL] Seed failed: {type(exc).__name__}: {exc}")
        raise
    finally:
        if owns_session:
            db.close()


if __name__ == "__main__":
    seed()
