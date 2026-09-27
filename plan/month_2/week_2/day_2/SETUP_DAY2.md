# Month 2, Week 2, Day 2 — Offline-First Contract Conformance & Client Integration Harness

**To:** Lead Developer
**From:** Senior Systems Design & Architecture Engineer
**Date:** 15 September 2026
**Status:** Day 1 Approved / Day 2 Specification Active

---

## 0. Scope Clarification & Assumptions

You confirmed "Day 2 only," so this blueprint is self-contained. The theme follows Day 1's contract freeze: the offshore Flutter/Dart team needs **more than a static OpenAPI file** to build against deterministically. Day 2 delivers the **runtime-side contract guarantee** — a way to prove the frozen contract actually matches the running API, plus a client-shaped integration harness the offshore team can use to develop against *without* hitting production Neon.

**Working assumptions** (correct me if wrong — I'll revise Day 3):
- Offshore team is Flutter/Dart.
- They need to develop offline / against a local server (data cost, time zones, CI).
- They'll use both cookie-based (browser preview) and `x-auth-mode: api` (mobile) auth flows.
- You already have `docs/openapi.json` + `docs/API_CONTRACT_V1.md` from Day 1.

---

## 1. Technical Objectives

1. **Contract Drift Gate** — prove `docs/openapi.json` matches the running app, fail CI if they diverge. Prevents the "we shipped a contract nobody can trust" failure mode.
2. **Client Integration Harness** — a **deterministic seed script** that populates a local test DB with a fixed student fixture (modules, tasks, timetable, materials, quota) so the offshore team can develop against known state.
3. **Auth Flow Fixtures** — a small script that outputs **ready-to-paste** cookie and bearer tokens for the fixture user, so the client team can hit any endpoint immediately without writing signup/login code first.
4. **Local Development Guide** — a `docs/CLIENT_DEV_HARNESS.md` that gives the offshore team a 5-minute path from `git clone` to "I made an authenticated request."

Everything else (mock server, Dart codegen, Postman collection) is **deferred** — Day 1's static OpenAPI is sufficient for codegen, and a full mock server is speculative infrastructure until the offshore team explicitly asks for it.

---

## 2. Architectural Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                     OFFSHORE CLIENT DEV WORKFLOW                        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. git clone                                                            │
│  2. docker compose up  ─────────► local API + local Postgres            │
│  3. python scripts/seed_client_fixture.py ──► deterministic test data   │
│  4. python scripts/print_client_tokens.py ──► cookie + bearer token     │
│  5. Flutter app → http://localhost:8000 with x-auth-mode: api           │
│                                                                          │
│  All offline. Zero production hits. Same contract as prod.              │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                     CI CONTRACT DRIFT GATE                              │
├────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Every push/PR:                                                          │
│    python scripts/export_openapi.py > /tmp/openapi.fresh.json           │
│    diff /tmp/openapi.fresh.json docs/openapi.json                       │
│    → fail build if they differ                                           │
│                                                                          │
│  Cost: ~3 seconds. Prevents: silent contract drift.                     │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                     CLIENT INTEGRATION HARNESS                          │
├────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  seed_client_fixture.py:                                                 │
│    • Creates user `client.dev@varsitycompanion.test` (password: fixed)  │
│    • 3 modules (INF154, COS132, COS212)                                 │
│    • 5 tasks (mixed type/priority/completion)                           │
│    • 4 timetable slots (Mon–Thu)                                        │
│    • 10 study materials per module (curated stubs)                      │
│    • Resets AI quota (so summarize calls work immediately)              │
│    • Idempotent: re-running resets to the same fixture state            │
│                                                                          │
│  print_client_tokens.py:                                                 │
│    • Prints login response (cookie + bearer) in curl-ready format       │
└────────────────────────────────────────────────────────────────────────┘
```

**Why this shape:** The offshore team's #1 blocker isn't the contract format — it's **"I can't get to a state where I can test the endpoints I need."** Solving that unlocks parallel client development without a mock server, without DB seeding via raw SQL, and without ever touching production.

---

## 3. File Implementation Map

| File Path | Action | Purpose |
|---|---|---|
| `scripts/seed_client_fixture.py` | **NEW** | Deterministic, idempotent client-facing fixture |
| `scripts/print_client_tokens.py` | **NEW** | Outputs curl-ready cookie + bearer tokens for the fixture user |
| `scripts/check_contract_drift.py` | **NEW** | Compares `app.openapi()` against `docs/openapi.json` |
| `.github/workflows/ci.yml` | **UPDATED** | Add contract-drift gate step |
| `docs/CLIENT_DEV_HARNESS.md` | **NEW** | Offshore team 5-minute onboarding guide |
| `tests/test_contract_drift.py` | **NEW** | Pytest wrapper proving the gate works |
| `tests/test_seed_fixture.py` | **NEW** | Proves the fixture is idempotent |

**No new runtime dependencies.** Uses existing SQLAlchemy, config, and security modules. `httpx` for the token script (already a runtime dep from Day 1 Month 2).

---

## 4. Step-by-Step Developer Guide

### Step 1: Contract Drift Checker (`scripts/check_contract_drift.py`)

```python
"""
scripts/check_contract_drift.py

PURPOSE:
Fail if the committed docs/openapi.json differs from the running app's
generated schema. Protects the offshore team from a silently stale contract.

Exit codes:
  0 = in sync
  1 = drift detected (prints unified diff)
"""
import json
import sys
from pathlib import Path

from app.main import app

COMMITTED = Path("docs/openapi.json")


def _canonical(schema: dict) -> str:
    # Match Day 1's exporter settings exactly.
    return json.dumps(schema, sort_keys=True, indent=2, ensure_ascii=False)


def main() -> int:
    if not COMMITTED.exists():
        print(f"[FAIL] {COMMITTED} does not exist. Run scripts/export_openapi.py.")
        return 1

    fresh = _canonical(app.openapi())
    committed = COMMITTED.read_text(encoding="utf-8")

    if fresh == committed:
        print("[PASS] OpenAPI contract is in sync.")
        return 0

    print("[FAIL] OpenAPI contract drift detected.")
    print(f"  committed: {len(committed)} bytes")
    print(f"  fresh:     {len(fresh)} bytes")
    print("  Re-run: python scripts/export_openapi.py > docs/openapi.json")
    return 1


if __name__ == "__main__":
    sys.exit(main())
```

### Step 2: Seed Fixture (`scripts/seed_client_fixture.py`)

```python
"""
scripts/seed_client_fixture.py

PURPOSE:
Deterministic, idempotent fixture for the offshore client dev team.

Guarantees:
- Same user every run (email = client.dev@varsitycompanion.test)
- Same 3 modules, 5 tasks, 4 slots, 30 materials
- Resets AI quota so the client can summarize immediately
- Never touches users other than the fixture user

Usage:
  python scripts/seed_client_fixture.py
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.core.roles import UserRole
from app.db.session import SessionLocal
from app.models.academic import AcademicTask, Module, TimetableSlot
from app.models.ai import UserAIQuota
from app.models.material import StudyMaterial
from app.models.user import User

FIXTURE_EMAIL = "client.dev@varsitycompanion.test"
FIXTURE_PASSWORD = "ClientDev!Fixture2026"   # printed by the guide, not secret
FIXTURE_FULL_NAME = "Client Dev Fixture"
FIXTURE_UNIVERSITY = "Fixture University"
FIXTURE_FIELD = "Information Science"

# Deterministic UUIDs so client tests can reference fixed IDs.
NS = uuid.UUID("11111111-2222-3333-4444-555555555555")
def _id(label: str) -> uuid.UUID:
    return uuid.uuid5(NS, label)


MODULES = [
    ("INF154", "Imperative Programming"),
    ("COS132", "Introduction to Programming"),
    ("COS212", "Data Structures and Algorithms"),
]

TASKS = [
    # (module_code, title, task_type, priority, weight, days_until_due, completed)
    ("INF154", "Assignment 1: Loops and Arrays", "ASSIGNMENT", "HIGH",     15.0,  3, False),
    ("INF154", "Practical Test 1",               "TEST",       "CRITICAL", 20.0,  1, False),
    ("COS132", "Assignment 2: Recursion",        "ASSIGNMENT", "MEDIUM",   10.0,  7, False),
    ("COS212", "Quiz 1: Linked Lists",           "QUIZ",       "LOW",       5.0, 10, False),
    ("COS212", "Semester Test",                  "TEST",       "HIGH",     25.0, 14, True),  # completed
]

SLOTS = [
    # (module_code, day_of_week 1=Mon..7=Sun, start, end, venue)
    ("INF154", 1, time(8,  0),  time(9,  30), "Centenary 2"),
    ("COS132", 1, time(10, 0),  time(11, 30), "Ingenuity Lab"),
    ("COS212", 2, time(9,  0),  time(10, 30), "Centenary 1"),
    ("INF154", 3, time(14, 0),  time(15, 30), "Lab 3"),
]

MATERIAL_TEMPLATES = [
    ("YOUTUBE", "360p", "Python Loops Explained",              "https://www.youtube.com/watch?v=loops-tutorial"),
    ("YOUTUBE", "360p", "Arrays vs Lists in Python",           "https://www.youtube.com/watch?v=arrays-vs-lists"),
    ("JOURNAL", "PDF",  "A Survey of Introductory Programming", "https://example.org/journals/intro-prog-survey.pdf"),
    ("ARTICLE", "HTML", "Common Recursion Mistakes",           "https://example.org/articles/recursion-pitfalls"),
    ("PDF",     "PDF",  "Linked List Reference Sheet",         "https://example.org/refs/linked-lists.pdf"),
    ("YOUTUBE", "360p", "Big-O in 10 Minutes",                 "https://www.youtube.com/watch?v=big-o-10min"),
    ("JOURNAL", "PDF",  "Algorithm Complexity Basics",         "https://example.org/journals/complexity-basics.pdf"),
    ("ARTICLE", "HTML", "How to Read a Stack Trace",           "https://example.org/articles/stack-traces"),
    ("YOUTUBE", "360p", "Debugging with Print Statements",     "https://www.youtube.com/watch?v=debug-print"),
    ("PDF",     "PDF",  "Module Cheat Sheet",                  "https://example.org/refs/cheat-sheet.pdf"),
]


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
        # Reset credentials so the printed password always works.
        user.hashed_password = hash_password(FIXTURE_PASSWORD)
        user.is_active = True
        user.deleted_at = None
        db.flush()
    return user


def _wipe_user_data(db: Session, user_id: uuid.UUID) -> None:
    # Order matters: children before parents.
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
        db.add(AcademicTask(
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
        ))
    db.flush()


def _seed_slots(db: Session, user: User, modules: dict[str, Module]) -> None:
    for i, (code, dow, start, end, venue) in enumerate(SLOTS):
        db.add(TimetableSlot(
            id=_id(f"slot:{code}:{i}"),
            user_id=user.id,
            module_id=modules[code].id,
            day_of_week=dow,
            start_time=start,
            end_time=end,
            venue=venue,
        ))
    db.flush()


def _seed_materials(db: Session) -> None:
    # Materials are global (not user-scoped). Idempotent by fixed UUID.
    for i, (code, _name) in enumerate(MODULES):
        for j, (rtype, quality, title, url) in enumerate(MATERIAL_TEMPLATES):
            mid = _id(f"material:{code}:{j}")
            if db.query(StudyMaterial).filter(StudyMaterial.id == mid).first():
                continue
            db.add(StudyMaterial(
                id=mid,
                module_code=code,
                title=title,
                description=f"{code} — {title}",
                url=url,
                resource_type=rtype,
                quality_resolution=quality,
                is_approved=True,
            ))
    db.flush()


def _reset_quota(db: Session, user: User) -> None:
    today = date.today()
    db.query(UserAIQuota).filter(
        UserAIQuota.user_id == user.id,
        UserAIQuota.usage_date == today,
    ).delete()
    db.add(UserAIQuota(
        user_id=user.id,
        usage_date=today,
        summaries_used=0,
        daily_limit=10,
    ))
    db.flush()


def main() -> None:
    db = SessionLocal()
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
        db.close()


if __name__ == "__main__":
    main()
```

### Step 3: Token Printer (`scripts/print_client_tokens.py`)

```python
"""
scripts/print_client_tokens.py

PURPOSE:
Authenticate the fixture user against a local server and print ready-to-paste
cookie + bearer auth materials for the offshore Flutter team.

Usage:
  python scripts/print_client_tokens.py [BASE_URL]
"""
import json
import sys

import httpx

from scripts.seed_client_fixture import FIXTURE_EMAIL, FIXTURE_PASSWORD

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"


def main() -> None:
    login_body = {"email": FIXTURE_EMAIL, "password": FIXTURE_PASSWORD}

    # API-mode: emit a bearer token (mobile / Flutter path).
    api = httpx.post(
        f"{BASE_URL}/api/v1/auth/login",
        json=login_body,
        headers={"x-auth-mode": "api"},
        timeout=10.0,
    )
    api.raise_for_status()
    token = api.json()["access_token"]

    # Browser-mode: emit a cookie jar (preview / web path).
    browser = httpx.post(
        f"{BASE_URL}/api/v1/auth/login",
        json=login_body,
        timeout=10.0,
    )
    browser.raise_for_status()
    cookie = browser.cookies.get("access_token")

    print("=== API MODE (Flutter) ===")
    print(f"Authorization: Bearer {token}")
    print()
    print("=== BROWSER MODE (web preview) ===")
    print(f"Cookie: access_token={cookie}")
    print()
    print("=== curl smoke test ===")
    print(
        f'curl -s {BASE_URL}/api/v1/auth/me '
        f'-H "Authorization: Bearer {token}" | jq'
    )
    print(
        f'curl -s {BASE_URL}/api/v1/academic/dashboard '
        f'-H "Authorization: Bearer {token}" | jq'
    )


if __name__ == "__main__":
    main()
```

### Step 4: CI Drift Gate (`.github/workflows/ci.yml` — add one step)

Insert **after** the existing lint step, **before** migrations:

```yaml
      - name: Verify OpenAPI contract is in sync
        run: |
          python scripts/export_openapi.py > /tmp/openapi.fresh.json
          if ! diff -q /tmp/openapi.fresh.json docs/openapi.json; then
            echo "::error::docs/openapi.json is stale. Regenerate and commit."
            diff -u docs/openapi.json /tmp/openapi.fresh.json | head -n 80
            exit 1
          fi
```

The `diff -u | head -n 80` gives the reviewer a readable snippet of exactly what drifted, without dumping 4000 lines into the CI log.

### Step 5: Tests

`tests/test_contract_drift.py`:
```python
import json
from pathlib import Path
from app.main import app

COMMITTED = Path("docs/openapi.json")

def _canonical(schema: dict) -> str:
    return json.dumps(schema, sort_keys=True, indent=2, ensure_ascii=False)

def test_committed_openapi_matches_app():
    """Locks the contract: any schema change must update docs/openapi.json."""
    assert COMMITTED.exists(), "docs/openapi.json missing"
    assert _canonical(app.openapi()) == COMMITTED.read_text(encoding="utf-8")
```

`tests/test_seed_fixture.py`:
```python
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.academic import Module, AcademicTask, TimetableSlot
from scripts.seed_client_fixture import (
    FIXTURE_EMAIL, main as seed_main,
)

def test_seed_is_idempotent(db: Session):
    """Running the fixture twice must produce the same state, not duplicates."""
    seed_main()
    first_user = db.query(User).filter(User.email == FIXTURE_EMAIL).one()
    first_modules = db.query(Module).filter(Module.user_id == first_user.id).count()
    first_tasks = db.query(AcademicTask).filter(AcademicTask.user_id == first_user.id).count()
    first_slots = db.query(TimetableSlot).filter(TimetableSlot.user_id == first_user.id).count()

    seed_main()
    second_user = db.query(User).filter(User.email == FIXTURE_EMAIL).one()
    assert second_user.id == first_user.id
    assert db.query(Module).filter(Module.user_id == second_user.id).count() == first_modules
    assert db.query(AcademicTask).filter(AcademicTask.user_id == second_user.id).count() == first_tasks
    assert db.query(TimetableSlot).filter(TimetableSlot.user_id == second_user.id).count() == first_slots
```

### Step 6: Client Dev Guide (`docs/CLIENT_DEV_HARNESS.md`)

You will write this — it's short. Sections:

1. **Prereqs** — Docker, Python 3.13 (or the version you use), git.
2. **Bring-up** — `docker compose up -d` → wait for health → `python scripts/seed_client_fixture.py`.
3. **Get tokens** — `python scripts/print_client_tokens.py`.
4. **Smoke test** — the two `curl` commands the script prints.
5. **Flutter base config** — base URL `http://10.0.2.2:8000` (Android emulator loopback) or `http://localhost:8000` (iOS sim). Use `x-auth-mode: api`.
6. **Contract** — link to `docs/openapi.json` and `docs/API_CONTRACT_V1.md`.
7. **Known fixture state** — table of the 3 modules, 5 tasks, 4 slots so the client team writes assertions against fixed IDs.
8. **Reset** — re-run the seed script to get back to a known state.

---

## 5. Time/Space Complexity Audit

| Component | Time | Space | Safeguard |
|---|---|---|---|
| `check_contract_drift.py` | O(S) where S = schema size (~50 KB) | O(S) | Runs once in CI (~3s); negligible |
| `seed_client_fixture.py` | O(1) — fixed 3 modules + 5 tasks + 4 slots + 30 materials | O(1) | Fixed-count loops; no user-supplied input |
| `print_client_tokens.py` | O(1) — 2 HTTP calls | O(1) | 10s timeout; no unbounded reads |
| CI drift gate | O(S) | O(S) | Diff truncated to 80 lines |

**No N+1, no unbounded lists, no LLM calls, no new external APIs.**

---

## 6. Security & Scale Guarantees

| Guarantee | Mechanism |
|---|---|
| Fixture is **local-only** | Script refuses to run if `DATABASE_URL` does not point to `localhost`/`127.0.0.1`/`db` (docker service name) — **add this guard**, don't trust the caller |
| Fixture **never touches non-fixture rows** | All deletes filter by `user_id == fixture_user.id` |
| Fixture user is **inert** | Role `STUDENT`, no admin surface, no email dispatch (call the service layer directly, not through HTTP) |
| Token script is **read-only on server state** | Only calls `/login`; no mutations |
| CI drift gate **cannot be skipped silently** | It's a separate step; a red gate blocks merge |
| No new **runtime** deps | `httpx` already runtime; all other imports are project code |

**Add this guard to `seed_client_fixture.py`** (the critical safety check — put it at the top of `main()`):

```python
ALLOWED_HOSTS = ("localhost", "127.0.0.1", "db")  # db = compose service name

def _assert_local_db() -> None:
    from app.core.config import settings
    url = settings.DATABASE_URL.lower()
    if not any(h in url for h in ALLOWED_HOSTS):
        raise SystemExit(
            "[REFUSE] seed_client_fixture must not run against a remote database. "
            f"Detected host not in {ALLOWED_HOSTS}."
        )
```

Call `_assert_local_db()` as the very first line of `main()`.

---

## 7. Acceptance Criteria

1. **Drift gate is wired and works**: introducing an accidental field rename in any Pydantic schema makes `scripts/check_contract_drift.py` exit `1`; reverting it exits `0`.
2. **Fixture is idempotent**: `seed_client_fixture.py` run twice in a row produces identical state (asserted by `tests/test_seed_fixture.py`).
3. **Fixture is local-guarded**: pointing `DATABASE_URL` at a remote host causes the script to refuse with a clear message.
4. **Token script works end-to-end**: after `seed` + local server up, `print_client_tokens.py` prints a working bearer token (a `curl` to `/api/v1/auth/me` returns 200).
5. **Client guide is complete**: an offshore dev who has never seen the repo can go from clone to first authenticated request in under 5 minutes using only `docs/CLIENT_DEV_HARNESS.md`.
6. **Contract test passes**: `tests/test_contract_drift.py` green (committed schema is in sync).
7. **Zero regressions**: all pre-existing tests still pass; `ruff check` clean; Alembic head unchanged at `0006` (no new migration — this is a scripting/harness day).

---

## 8. Verification Steps (engineer runs these)

```bash
# 1. Lint
ruff check app/ tests/ scripts/

# 2. Full test suite (should now include drift + fixture idempotency)
pytest -q

# 3. Manual drift check
python scripts/check_contract_drift.py
# expect: [PASS] OpenAPI contract is in sync.

# 4. Local fixture + tokens (requires local DB + server running)
python scripts/seed_client_fixture.py
uvicorn app.main:app --reload   # in another terminal
python scripts/print_client_tokens.py
# copy a printed curl, run it, expect HTTP 200

# 5. Safety guard
DATABASE_URL="postgresql+psycopg://u:p@remote.example.com/db" \
  python scripts/seed_client_fixture.py
# expect: [REFUSE] seed_client_fixture must not run against a remote database.
```

---

## 9. Defect-Discovery Prompts

> Run it, don't just read it. Here's what to look for:

- **Drift gate passes even when you change a schema field** → your exporter and the gate use different JSON serialization (e.g., `sort_keys` mismatch, `indent` difference, or `ensure_ascii`). They must call the same canonicalizer. Fix by extracting `_canonical()` into `scripts/_openapi_utils.py` and importing it from both places.
- **Fixture creates a second user on the second run** → the case-insensitive unique index on `users.email` is being bypassed by your lookup query (e.g., you search by exact case but the fixture email was normalized). Log the queried email and the DB row email side-by-side.
- **`print_client_tokens.py` 401s immediately after seeding** → the seed script hashed the password but the login schema normalizes the email differently than `_get_or_create_user` stored it. Verify `User.email == FIXTURE_EMAIL.lower()` after seeding.
- **Seed works locally but fails in Docker** → `DATABASE_URL` inside the container uses service name `db` (allowed) but the `main()` guard runs before the app config is loaded from `.env`. Ensure the guard reads `settings.DATABASE_URL` (post-env-load), not `os.getenv("DATABASE_URL")`.
- **CI drift gate passes even when you change `docs/openapi.json` manually** → your diff step only checks the app→file direction, not file→app. The `diff -q` between fresh and committed **must be symmetric** (it is by default with `diff -q`; double-check no `--brief`-with-`-N` flag accidentally masks additions).
- **Token printed for API mode has no `access_token` key** → the strict `x-auth-mode` check from Day 1 (Month 1) requires **exact lowercase `api`**. Verify the script sends `{"x-auth-mode": "api"}`, not `{"X-Auth-Mode": "API"}`.
- **Fixture state on second run differs from first** → one of `_seed_*` is appending rather than upserting. All fixture rows have **deterministic UUIDs** (via `_id()`), so the fix is: check by ID before insert, or delete by ID then insert.

---

## 10. Sign-Off Checklist (before submitting the Day 2 report)

- [ ] `scripts/check_contract_drift.py` exists and exits 1 on simulated drift
- [ ] `scripts/seed_client_fixture.py` runs successfully and is **idempotent**
- [ ] The local-guard refuses non-local `DATABASE_URL`
- [ ] `scripts/print_client_tokens.py` produces a working bearer token
- [ ] `docs/CLIENT_DEV_HARNESS.md` is written and a colleague could follow it cold
- [ ] `.github/workflows/ci.yml` contains the drift-gate step
- [ ] `tests/test_contract_drift.py` and `tests/test_seed_fixture.py` pass
- [ ] `ruff check app/ tests/ scripts/` is clean
- [ ] Full suite: no regressions
- [ ] Alembic head unchanged (`0006`)
- [ ] **No new packages installed**
- [ ] Branch: `month2/week2-day2-client-harness` off `develop`

---

## 11. What's Deferred (and Why)

To keep this day focused and honest:

| Deferred | Reason |
|---|---|
| Full mock server (`prism`, `wiremock`) | Static OpenAPI is enough for Dart codegen; mock server is speculative until the client team asks for it. |
| Dart package generation | The offshore team's job; our contract makes it possible. Revisit only if they ask for a shared package. |
| Postman collection export | Nice-to-have; the `curl` commands from `print_client_tokens.py` cover the immediate need. |
| Client-shaped integration tests in our repo | We can't test their Flutter app; we test the contract they depend on. |
| Push notifications, WebSocket refresh | Out of Week 2 scope — separate design needed. |

---

## 12. Next Action

Implement, verify (§8), then submit the Day 2 report. Once I have the report, I'll design **Day 3** — but tell me now if the Week 2 scope has shifted from my assumption (mock server / Dart parity / Postman), because that changes what Day 3 looks like.

