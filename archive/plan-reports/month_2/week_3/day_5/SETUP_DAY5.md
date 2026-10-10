# Day 5 Blueprint — Week 3 Coherence Review & Close-Out

**Branch:** `month2/week3-day5-coherence` off `develop`
**Baseline:** head `0011`
**No migration, no new endpoints, no new packages.**
**Duration:** short day — review + documentation, not features.

---

## §0. Scope

Week 3 delivered four features across four days:

| Day | Feature | Migration |
|---|---|---|
| D1 | Admin materials CRUD | `0009` |
| D2 | Bulk import (CSV/JSON + dry-run) | — |
| D3 | Coverage analytics + `(module_code, url)` index | `0011` |
| D4 | Search relevance upgrade | — |

Plus an undocumented RAG feature (migration `0010`) that Day 4's audit confirmed was clean.

**Day 5 verifies the week is internally consistent and merge-ready**, then closes it. Nothing new is built.

Specifically:

1. **Migration chain integrity** — no duplicate revisions, single root, single head.
2. **Isolation audit** — every Week 3 surface enforces its role gate; materials are global, not user-scoped.
3. **Full suite validation** — zero regressions at head `0011`.
4. **Contract + drift + ruff** — all green.
5. **`MIGRATION_LOG.md`** — new documentation file that prevents the Day 3 surprise from recurring.
6. **PR template update** — enforce the log for any commit touching `alembic/versions/`.
7. **Week 3 close-out report** — documented open items.

---

## §1. Technical Objectives

1. **Lock the migration chain with tests.** Three assertions: no duplicates, single root, single head = `0011`.
2. **Document all migrations in `plan/MIGRATION_LOG.md`.** Backfill the 11 that exist; require an entry for every future one.
3. **Add a PR template requiring migration log updates** when `alembic/versions/` changes.
4. **Audit Week 3 role gates.** Assert every admin route returns 403 for non-admin.
5. **Confirm materials are global, not user-scoped.** Two users, same module → same materials.
6. **Produce the Week 3 close-out report.**

**No new features. No new migration. No new package.**

---

## §2. Architectural Strategy

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    WEEK 3 COHERENCE — FOUR CHECKS                        │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  (1) MIGRATION CHAIN                                                     │
│      Parse every alembic/versions/*.py                                   │
│      ├── No duplicate revision ids                                       │
│      ├── Exactly one root (down_revision = None)                         │
│      ├── Exactly one head (no child points to it)                        │
│      ├── Head == "0011"                                                  │
│      └── No dangling parent references                                   │
│                                                                          │
│  (2) ROLE GATE AUDIT                                                     │
│      For each /admin/materials/* route:                                  │
│      ├── No auth        → 401                                            │
│      ├── STUDENT token  → 403                                            │
│      └── ADMIN token    → 200/201/204                                    │
│                                                                          │
│  (3) GLOBAL-CONTENT ASSERTION                                            │
│      Materials are not user-scoped:                                      │
│      ├── User A sees materials                                           │
│      ├── User B sees the same materials for the same module              │
│      └── Cross-user delete → 404 (admin only, no owner check)            │
│                                                                          │
│  (4) SUITE + CONTRACT + RUFF                                             │
│      ├── Full pytest green                                               │
│      ├── Drift gate [PASS]                                               │
│      └── ruff clean                                                      │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                    WHY MIGRATION_LOG.md EXISTS                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Day 3's report revealed migration 0010 (RAG tables) appeared without    │
│  warning and required Day 3's migration to be renumbered 0011.           │
│                                                                          │
│  Root cause: no single place records what migrations exist and why.      │
│                                                                          │
│  Fix:                                                                    │
│    plan/MIGRATION_LOG.md — one row per migration, forever.               │
│    + PR template asks for a new row when alembic/versions/ is touched.   │
│                                                                          │
│  Cost: 30 seconds per migration.                                         │
│  Benefit: this class of surprise cannot recur.                           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Design principle:** A coherence day produces *evidence* that the week is sound. Tests plus documentation. Nothing else.

---

## §3. File Implementation Map

| File Path | Action | Purpose |
|---|---|---|
| `tests/test_migration_chain.py` | **NEW** | Locks the chain |
| `tests/test_week3_isolation_audit.py` | **NEW** | Role-gate + global-content assertions |
| `plan/MIGRATION_LOG.md` | **NEW** | Migration history, backfilled |
| `.github/PULL_REQUEST_TEMPLATE.md` | **NEW** | Requires log update when migrations change |
| `plan/month_2/week_3/week_3_close_out.md` | **NEW** | The Day 5 report |

**No code changes. No new endpoints. No migration.**

---

## §4. Step-by-Step Developer Guide

### §4.1 `tests/test_migration_chain.py`

Create the file:

```python
"""
Locks the migration chain.

Guards against:
  - Duplicate revision ids (the class of bug nearly introduced on Day 3
    when 0010 was already occupied)
  - Dangling down_revision references (typically from a bad rebase)
  - Multiple roots or multiple heads
  - Unexpected head revision

When a new migration lands, update EXPECTED_HEAD at the bottom of this
file (and add a row to plan/MIGRATION_LOG.md).
"""
import re
from pathlib import Path

import pytest

VERSIONS_DIR = Path(__file__).parent.parent / "alembic" / "versions"
EXPECTED_HEAD = "0011"


def _parse_migrations() -> list[dict]:
    """Return a list of dicts: {file, revision, down_revision}."""
    files = []
    for path in sorted(VERSIONS_DIR.glob("*.py")):
        text = path.read_text(encoding="utf-8")
        rev = re.search(r'^revision\s*=\s*[\'"]([^\'"]+)[\'"]', text, re.MULTILINE)
        down = re.search(r'^down_revision\s*=\s*[\'"]([^\'"]+)[\'"]', text, re.MULTILINE)
        if rev:
            files.append({
                "file": path.name,
                "revision": rev.group(1),
                "down_revision": down.group(1) if down else None,
            })
    return files


def test_no_duplicate_revisions():
    """Every revision id must be unique across all migration files."""
    files = _parse_migrations()
    revisions = [f["revision"] for f in files]
    dupes = sorted({r for r in revisions if revisions.count(r) > 1})
    assert not dupes, f"Duplicate revision ids: {dupes}"


def test_exactly_one_root():
    """Exactly one migration has down_revision=None (the base)."""
    files = _parse_migrations()
    roots = [f for f in files if f["down_revision"] is None]
    assert len(roots) == 1, (
        f"Expected exactly 1 root migration, got {len(roots)}: "
        f"{[r['file'] for r in roots]}"
    )


def test_no_dangling_parent_references():
    """Every down_revision must reference an existing revision."""
    files = _parse_migrations()
    all_revisions = {f["revision"] for f in files}
    for f in files:
        if f["down_revision"] is not None:
            assert f["down_revision"] in all_revisions, (
                f"{f['file']}: down_revision={f['down_revision']} does not exist"
            )


def test_exactly_one_head():
    """Exactly one migration is not referenced as a parent by any other."""
    files = _parse_migrations()
    parents = {f["down_revision"] for f in files if f["down_revision"]}
    heads = [f["revision"] for f in files if f["revision"] not in parents]
    assert len(heads) == 1, f"Expected exactly 1 head, got {heads}"


def test_head_is_expected():
    """Head matches EXPECTED_HEAD. Update when a new migration lands."""
    files = _parse_migrations()
    parents = {f["down_revision"] for f in files if f["down_revision"]}
    heads = [f["revision"] for f in files if f["revision"] not in parents]
    assert heads == [EXPECTED_HEAD], (
        f"Head is {heads}, expected [{EXPECTED_HEAD!r}]. "
        f"If intentional, update EXPECTED_HEAD and add a row to MIGRATION_LOG.md."
    )
```

**Note:** `pytest` is imported but unused in this file. Either remove the import or keep it for future tests. Ruff will flag it if it's genuinely unused — remove it to keep ruff clean.

### §4.2 `tests/test_week3_isolation_audit.py`

Create the file:

```python
"""
Week 3 isolation audit.

Two assertions:

1. Every /admin/materials/* route requires ADMIN or SUPERUSER.
   Catches the case where someone removes require_role by accident.

2. Materials are global content, not user-scoped.
   Two different users see the same materials for the same module.

If a future change makes any of these endpoints user-scoped or drops
the role gate, these tests fail loudly.
"""
import pytest
from fastapi.testclient import TestClient

# Adjust imports to match the project's conventions
from app.main import app
from app.core.roles import UserRole

ADMIN_ROUTES = [
    ("POST",   "/api/v1/admin/materials"),
    ("GET",    "/api/v1/admin/materials"),
    ("POST",   "/api/v1/admin/materials/import"),
    ("GET",    "/api/v1/admin/materials/coverage"),
]


@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
def test_admin_routes_require_auth(client: TestClient, method: str, path: str):
    """No token → 401."""
    r = client.request(method, path, json={} if method in ("POST", "PATCH") else None)
    assert r.status_code == 401, f"{method} {path} returned {r.status_code}, expected 401"


@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
def test_admin_routes_reject_student(client: TestClient, student_token: str, method: str, path: str):
    """STUDENT token → 403, not 200."""
    r = client.request(
        method, path,
        headers={"Authorization": f"Bearer {student_token}"},
        json={} if method in ("POST", "PATCH") else None,
    )
    assert r.status_code == 403, f"{method} {path} allowed STUDENT (status {r.status_code})"


def test_materials_are_global_not_user_scoped(client: TestClient, admin_token: str, seed_materials):
    """
    Materials are global content. Two users should see the same materials
    for the same module — no per-user filtering.
    """
    # Create two student users (fixture helper; adjust to project conventions)
    student_a_token = seed_materials.student_a_token
    student_b_token = seed_materials.student_b_token

    # Both search the same module
    a = client.get(
        "/api/v1/materials/search",
        params={"module_code": "INF154"},
        headers={"Authorization": f"Bearer {student_a_token}"},
    ).json()
    b = client.get(
        "/api/v1/materials/search",
        params={"module_code": "INF154"},
        headers={"Authorization": f"Bearer {student_b_token}"},
    ).json()

    a_ids = {item["id"] for item in a["items"]}
    b_ids = {item["id"] for item in b["items"]}

    assert a_ids == b_ids, "Materials should be global; users A and B see different results."
```

**Note:** this test needs fixtures (`admin_token`, `student_token`, `seed_materials`) that may or may not exist in the project's `conftest.py`. If they don't exist, use the existing test patterns from `tests/test_admin_materials_api.py` (which already creates admin/student users). **The engineer adapts the fixture names to what's available** rather than inventing new fixtures.

### §4.3 `plan/MIGRATION_LOG.md`

Create the file:

```markdown
# Migration Log

**Every commit that adds, removes, or renumbers a file in
`alembic/versions/` must add a row to this table.**

This is the single source of truth for what changed and why. It exists
because migration 0010 (RAG tables) appeared without warning during Week 3
and forced a renumber, which is the class of surprise this file prevents.

| Revision | down_revision | File | Purpose | Added |
|---|---|---|---|---|
| 0001 | base | `0001_initial_user_schema.py` | users table + POPIA consent fields | 2026-09-01 |
| 0002 | 0001 | `0002_add_user_roles.py` | RBAC role column (VARCHAR + CHECK) | 2026-09-07 |
| 0003 | 0002 | `0003_academic_tracker_schema.py` | modules, timetable_slots, academic_tasks | 2026-09-07 |
| 0004 | 0003 | `0004_ai_engine_tables.py` | user_ai_quotas, ai_summary_caches | 2026-09-12 |
| 0005 | 0004 | `0005_study_materials_schema.py` | study_materials table | 2026-09-12 |
| 0006 | 0005 | `0006_timetable_slots_updated_at.py` | updated_at on timetable_slots (LWW sync) | 2026-09-12 |
| 0007 | 0006 | `0007_analytics_and_feedback.py` | usage_events, feedback | 2026-09-15 |
| 0008 | 0007 | `0008_usage_events_duration_ms.py` | duration_ms column on usage_events | 2026-09-15 |
| 0009 | 0008 | `0009_materials_admin_columns.py` | updated_at, created_by_user_id on materials | 2026-09-18 |
| 0010 | 0009 | `0010_brief_documents_and_chunks.py` | RAG: brief_documents + brief_chunks tables | 2026-09-26 |
| 0011 | 0010 | `0011_materials_module_url_index.py` | composite index `(module_code, url)` on study_materials | 2026-09-27 |

**Head at last review:** `0011`
**Locked by test:** `tests/test_migration_chain.py::test_head_is_expected`
```

**The file names in this table may not match the actual repo.** The engineer should list the actual files in `alembic/versions/` and reconcile the table. If any file is named differently, use the real name. **Do not copy this table verbatim if it doesn't match the tree.**

### §4.4 `.github/PULL_REQUEST_TEMPLATE.md`

Create the file:

```markdown
## Summary

<!-- One or two sentences on what this PR changes and why. -->

## Checklist

- [ ] Branch is off `develop` (not another feature branch)
- [ ] `ruff check app/ tests/ scripts/` passes
- [ ] Full test suite passes locally
- [ ] `python scripts/export_openapi.py` was run **without** stdout redirect
- [ ] `python scripts/check_contract_drift.py` returns `[PASS]`
- [ ] No new packages installed (or: listed below with justification)

## Migrations

- [ ] This PR does **not** touch `alembic/versions/`
      **OR**
- [ ] This PR touches `alembic/versions/` **and** a row has been added to
      `plan/MIGRATION_LOG.md`
- [ ] `tests/test_migration_chain.py::test_head_is_expected` was updated if the head changed

## Notes for the architect

<!-- Anything the reviewer should know. -->
```

### §4.5 `plan/month_2/week_3/week_3_close_out.md`

Create the file. This is the Day 5 report — same structure as the code review reports but summarizing the whole week:

```markdown
# Month 2, Week 3 — Close-Out

**Date:** 27 September 2026
**Head:** `0011`
**Suite:** <N> passed, 0 failed (fill in actual)
**Drift gate:** [PASS] on <N> routes

## What shipped

| Day | Feature | Migration | Tests added |
|---|---|---|---|
| D1 | Admin materials CRUD | `0009` | 13 |
| D2 | Bulk import (CSV/JSON + dry-run) | — | 16 |
| D3 | Coverage analytics + index | `0011` | 18 |
| D4 | Search relevance | — | 19 |
| D5 | Coherence review | — | <N> |

## What was caught by running, not reading

- Migration `0010` (RAG) appeared without warning; Day 3 renumbered to `0011` correctly.
- Day 4 blueprint's sample code had a real sort bug; caught and fixed with a test proven to fail on the buggy version.
- Route order between `/materials/coverage` and `/materials/{material_id}` — verified by test.
- Stable sort tiebreaker — locked by test.

## Migration chain

- Head: `0011`
- Chain integrity locked by `tests/test_migration_chain.py`.
- `plan/MIGRATION_LOG.md` backfilled with all 11 migrations.

## Isolation audit

- All admin routes: 401 without auth, 403 for STUDENT. Locked by `tests/test_week3_isolation_audit.py`.
- Materials confirmed global content (same for both users).

## Open items carried forward

- Push still blocked by GitHub token permission (founder action).
- `export_openapi.py` redirect hazard in old blueprints (documentation fix).
- Mobile scope blueprint — deferred to Week 4.
- `seed_client_fixture.py` uses `.test` TLD, rejected by email-validator (D3 from hackathon report).
- Two-stack repo problem (`demo` vs `feats/frontend`) — post-hackathon decision.

## Ready for

- Merge into `develop` (branch order: D1 → D2 → D3 → D4 → D5).
- Week 4 planning.
```

**The report is not final until the Day 5 tests have run** — the count field `<N>` is filled in after the suite runs.

---

## §5. Time/Space Complexity Audit

Not applicable. Day 5 changes only tests and documentation.

---

## §6. Security & Scale Guarantees

| Guarantee | Mechanism |
|---|---|
| Migration chain cannot silently break | `test_migration_chain.py` runs on every future PR |
| No accidental removal of role gates | `test_week3_isolation_audit.py` runs on every future PR |
| Global-vs-user-scoped semantics are documented | Same test file asserts materials are global |
| Migration additions cannot be silent | `MIGRATION_LOG.md` + PR template require an entry |
| No new attack surface | No new endpoints, no new queries, no new packages |

---

## §7. Acceptance Criteria

1. `tests/test_migration_chain.py` exists and all 5 tests pass.
2. `tests/test_week3_isolation_audit.py` exists and all tests pass.
3. `plan/MIGRATION_LOG.md` exists with all 11 migrations documented and the head recorded.
4. `.github/PULL_REQUEST_TEMPLATE.md` exists and requires the migration log update.
5. `plan/month_2/week_3/week_3_close_out.md` exists and is complete.
6. Full suite green at head `0011` with zero regressions.
7. Drift gate `[PASS]` on the current route count.
8. `ruff check app/ tests/ scripts/` clean.
9. **No new features, no migration, no packages.**
10. Branch: `month2/week3-day5-coherence` off `develop`.

---

## §8. Verification Steps

```bash
# 1. New tests
pytest tests/test_migration_chain.py -v
pytest tests/test_week3_isolation_audit.py -v

# 2. Full suite
pytest -q

# 3. Lint + contract
ruff check app/ tests/ scripts/
python scripts/export_openapi.py
python scripts/check_contract_drift.py     # [PASS]

# 4. Confirm files exist
ls plan/MIGRATION_LOG.md
ls .github/PULL_REQUEST_TEMPLATE.md
ls plan/month_2/week_3/week_3_close_out.md
```

---

## §9. Defect-Discovery Prompts

> Run it, don't just read it.

- **`test_no_duplicate_revisions` fails** → two migration files share a revision id. The fix is to renumber the newer one. This is the class of bug Day 3 nearly introduced.
- **`test_no_dangling_parent_references` fails** → a migration's `down_revision` points to a revision id that doesn't exist. Usually from a rebase or manual edit. Find the missing parent and fix.
- **`test_exactly_one_root` fails with 0 roots** → a migration was deleted that provided the chain origin. Investigate the git history.
- **`test_exactly_one_root` fails with 2+ roots** → two migrations both claim to be the base. One of them has the wrong `down_revision`.
- **`test_head_is_expected` fails** → either a new migration landed (expected; update `EXPECTED_HEAD` and add a `MIGRATION_LOG.md` row) or a migration was removed (investigate).
- **`test_admin_routes_require_auth` returns 403 instead of 401** → a route's auth dependency is missing entirely, so it falls through to a different error path. Fix by restoring `Depends(get_current_user)`.
- **`test_admin_routes_reject_student` returns 200** → the role gate was removed from that route. Restore `require_role([ADMIN, SUPERUSER])`.
- **`test_materials_are_global_not_user_scoped` fails** → someone added a `user_id` filter to materials search. Materials are global content; that filter is wrong. Remove it.
- **The PULL_REQUEST_TEMPLATE appears in a PR but the checklist is ignored** → the template is not enforced. This is a process issue, not a code issue. It still helps, even without enforcement.
- **`ruff check` flags `pytest` as unused** in `test_migration_chain.py` → remove the unused import. This is expected and correct.

---

## §10. Sign-Off Checklist

- [ ] `tests/test_migration_chain.py` created; 5 tests pass
- [ ] `tests/test_week3_isolation_audit.py` created; all tests pass
- [ ] `plan/MIGRATION_LOG.md` created with all 11 migrations and current head
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` created with migration log requirement
- [ ] `plan/month_2/week_3/week_3_close_out.md` created and complete
- [ ] Full suite green at head `0011`; no regressions
- [ ] Drift gate `[PASS]`
- [ ] `ruff check app/ tests/ scripts/` clean
- [ ] **No new features, no migration, no packages**
- [ ] Branch: `month2/week3-day5-coherence` off `develop`

---

## §11. What's NOT in Day 5

- New features
- New endpoints
- New migrations
- Refactors of passing code
- Any code change that isn't a test or documentation

Day 5 is a **review day**. It closes Week 3 with evidence and documentation.

---

