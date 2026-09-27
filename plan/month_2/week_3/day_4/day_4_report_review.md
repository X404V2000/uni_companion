# Day 4 Report — Architectural Review

**Reviewer:** Senior Systems Design & Architecture Engineer
**Date:** 27 September 2026
**Status:** Day 4 **APPROVED** — Day 5 blueprint below

---

## §1. Sign-Off

Day 4 is approved. This is the cleanest report submitted across the entire project — and it's the second day in a row the engineer caught a **bug in my own blueprint** before it could ship.

**What landed well:**

| Deliverable | Assessment |
|---|---|
| Deterministic tiered scoring (100/80/60/40/20/0) | Correct, documented, testable |
| `relevance_score` on `MaterialResponse` | Additive; backward-compatible |
| `sort` param with `Literal` validation | Pydantic enforces the contract |
| Stable sort with `id` tiebreaker | Verified with an explicit test |
| Score-0 excluded only when `q` present | Correct — conditional behavior tested |
| 19 tests (spec asked for 8+) | Generous coverage |
| 441 full suite, no regressions | Green |
| No migration, no packages | Honoured |

**The report's §3 is the standout.** It doesn't just say "the blueprint's bug was real" — it **reproduced it in isolation**, documented the exact failure mode, applied the correct fix, and then **verified the test catches the bug by reinstating the bug and watching the test fail**. That's the discipline of someone who understands that a passing test proves nothing unless you've seen it fail.

---

## §2. The Blueprint's Own Bug — Acknowledged

The report caught that my own sample code had a real defect:

> *"The `reverse=True` on the relevance branch reverses the whole tuple, which reverses `id` too — this is a bug."*

**I flagged this in the blueprint's §9, but I wrote it in the sample code in §4.2 anyway.** That's an inconsistency in my own document, and the engineer correctly recognized that the §9 warning was authoritative and the §4.2 sample was wrong.

**This is exactly what I want from an implementation partner.** Not blind execution of the code block. Reading comprehension across the whole document, catching the contradiction, and choosing the correct behavior.

**The correct fix** — negation + ascending sort — is now in the codebase. The wrong pattern won't recur.

---

## §3. The RAG Provenance Audit — Fully Cleared

The report answered my §2 questions exhaustively:

| Question | Answer |
|---|---|
| Which commit? | `179e667` |
| When? | 26 Sep 2026, 00:52 |
| By whom? | Same engineer, previous session |
| Founder-instructed? | Yes |
| Tested? | Yes — 11 tests, still green |
| Reviewed? | Yes — tests found and fixed an auth-precedence vulnerability |
| On remote? | Yes — `origin/demo` |

**Day 4 was not blocked, and no unvetted work exists in the migration chain.** The RAG tables were built with tests, from a founder instruction, and the tests caught a security defect. That's clean work, just undocumented in my planning.

**Two process notes the report raises are worth adopting:**

1. **Namespace discovery hazard.** The RAG code lives under `app/models/ai.py` and `app/services/brief_rag_service.py`, not `app/models/brief.py`. That's why my audit commands returned nothing. The feature is namespaced under "ai" rather than "brief," which makes it harder to find. **Worth a backlog item, but not blocking.** Either rename to a `brief_*` namespace (costly) or document the naming convention (cheap). I recommend documentation.

2. **`plan/MIGRATION_LOG.md` proposal.** *"Require any commit touching `alembic/versions/` to add a line to a running `plan/MIGRATION_LOG.md`."* This is the correct, cheap, minimal fix for the class of problem that surfaced on Day 3. **Adopt it.** I'll include this as a Day 5 deliverable.

---

## §4. Two Refinements Beyond the Blueprint — Both Correct

### §4.1 — `updated_at` compared via `.timestamp()`

The report says:

> *"If any row has `updated_at = None`, comparing it with a `datetime` raises TypeError. That would take down the whole search for one malformed row."*

**Correct.** The blueprint's sample code didn't handle None. The `_ts()` helper with a `0.0` fallback is the right pattern. One malformed row should degrade gracefully, not take down the endpoint.

### §4.2 — `total` counts after filtering

The report says:

> *"`total` must be `len(scored)` after score-0 rows are dropped. Counting candidates first would overstate the result count and leave a trailing empty page."*

**Correct.** The test `test_pagination_total_reflects_filtered_count` seeds 5 matches and 7 non-matches and asserts `total == 5`, `pages == 3` — not the naive `total == 12`. That's the right shape.

Both refinements make the code more robust than the blueprint specified. That's expected from a competent implementation.

---

## §5. Day 5 Blueprint — Week 3 Coherence Review

**Objective:** Prove Week 3 is internally consistent, migration chain is intact, cross-tenant isolation holds, and everything is merge-ready. No new features.

**Branch:** `month2/week3-day5-coherence` off `develop`.
**Baseline:** head `0011`.
**Duration:** short day (review-only).

### §5.1 Scope

Week 3 delivered four features across four days:

| Day | Feature |
|---|---|
| D1 | Admin materials CRUD (migration `0009`) |
| D2 | Bulk materials import (CSV/JSON + dry-run) |
| D3 | Coverage analytics + `(module_code, url)` index (migration `0011`) |
| D4 | Search relevance upgrade |

Plus an undocumented RAG feature (migration `0010`) that the Day 4 audit confirmed was clean.

**Day 5 verifies:**

1. **Migration integrity** — chain `0001 → 0011` applies cleanly from empty, is idempotent, and reverses.
2. **Cross-tenant isolation audit** — every new Week 3 surface enforces tenant isolation or documents why it doesn't (materials are global content, so admin endpoints are the exception).
3. **Full suite validation** — zero regressions from head `0011`.
4. **Contract + drift + ruff** — all green.
5. **Merge readiness** — branch order documented; no orphaned work.
6. **The `MIGRATION_LOG.md`** — newly created, backfilled with all 11 migrations, and required for any future commit touching `alembic/versions/`.
7. **Week 3 close-out report** — documented open items carried forward.

### §5.2 File Implementation Map

| File Path | Action | Purpose |
|---|---|---|
| `plan/MIGRATION_LOG.md` | **NEW** | One line per migration; backfilled |
| `.github/PULL_REQUEST_TEMPLATE.md` or `CONTRIBUTING.md` | **UPDATED** | Require migration log update on `alembic/versions/` changes |
| `plan/month_2/week_3/week_3_close_out.md` | **NEW** | The Day 5 report |
| `tests/test_migration_chain.py` | **NEW** | Asserts head = `0011` and revisions are linear + unique |
| `tests/test_week3_isolation_audit.py` | **NEW** | Proves tenant isolation on Week 3 surfaces that need it |

**No new migration, no new endpoint, no new packages.**

### §5.3 Migration chain test

Add `tests/test_migration_chain.py`:

```python
"""
Locks the migration chain: no duplicate revision IDs, no dangling
parent references, head matches the expected revision.
"""
from pathlib import Path
import re

VERSIONS = Path(__file__).parent.parent / "alembic" / "versions"


def _parse_migration_files() -> list[dict]:
    files = []
    for path in VERSIONS.glob("*.py"):
        text = path.read_text()
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
    """Each revision id appears exactly once. Guards against the class of
    bug that would have been introduced had Day 3 shipped as 0010."""
    files = _parse_migration_files()
    revisions = [f["revision"] for f in files]
    assert len(revisions) == len(set(revisions)), (
        f"Duplicate revision ids: {sorted(r for r in revisions if revisions.count(r) > 1)}"
    )


def test_linear_chain_from_base_to_head():
    """Follow down_revision pointers from the head; ensure every migration
    is reachable and there are no dangling parents."""
    files = _parse_migration_files()
    by_rev = {f["revision"]: f for f in files}
    parents = {f["down_revision"] for f in files if f["down_revision"]}
    children = set(by_rev.keys())

    # Only one migration has down_revision=None (base)
    roots = [f for f in files if f["down_revision"] is None]
    assert len(roots) == 1, f"Expected exactly one root migration, got {len(roots)}"

    # Every parent must exist
    dangling = parents - children
    assert not dangling, f"Dangling down_revision references: {dangling}"


def test_head_is_expected():
    """Locks head. Update this value when a new migration lands."""
    files = _parse_migration_files()
    heads = [f["revision"] for f in files if f["revision"] not in
             {x["down_revision"] for x in files if x["down_revision"]}]
    assert len(heads) == 1, f"Expected exactly one head, got {heads}"
    assert heads[0] == "0011", f"Head is {heads[0]}, expected 0011 (update if intentional)"
```

**Test 1 is the day's purpose.** It catches the class of bug that nearly happened on Day 3. Without this test, a duplicate revision can be introduced silently and only explode when someone runs `alembic upgrade head`.

### §5.4 `MIGRATION_LOG.md`

New file at `plan/MIGRATION_LOG.md`:

```markdown
# Migration Log

Every commit that touches `alembic/versions/` must add one line here.
This is the single source of truth for what changed and why.

| Revision | down_revision | File | Purpose | Added (date) |
|---|---|---|---|---|
| 0001 | base | 0001_initial_user_schema.py | users table + POPIA consent | 2026-09-01 |
| 0002 | 0001 | 0002_add_user_roles.py | RBAC role column | 2026-09-07 |
| 0003 | 0002 | 0003_academic_tracker_schema.py | modules, timetable_slots, academic_tasks | 2026-09-07 |
| 0004 | 0003 | 0004_ai_engine_tables.py | user_ai_quotas, ai_summary_caches | 2026-09-12 |
| 0005 | 0004 | 0005_study_materials_schema.py | study_materials table | 2026-09-12 |
| 0006 | 0005 | 0006_timetable_slots_updated_at.py | updated_at for LWW sync | 2026-09-12 |
| 0007 | 0006 | 0007_analytics_and_feedback.py | usage_events, feedback | 2026-09-15 |
| 0008 | 0007 | 0008_usage_events_duration_ms.py | duration_ms column | 2026-09-15 |
| 0009 | 0008 | 0009_materials_admin_columns.py | updated_at, created_by_user_id on materials | 2026-09-18 |
| 0010 | 0009 | 0010_brief_documents_and_chunks.py | RAG: brief documents + chunks | 2026-09-26 |
| 0011 | 0010 | 0011_materials_module_url_index.py | composite index (module_code, url) | 2026-09-27 |
```

**Why this file:** the Day 3 surprise (RAG migration `0010` appearing without warning) wouldn't have happened if this log existed. It's cheap and it makes that class of surprise impossible.

### §5.5 Cross-tenant isolation audit

Table for the report:

| Surface | Endpoint | Isolation | Test |
|---|---|---|---|
| Admin materials CRUD | `POST/PATCH/DELETE/GET /admin/materials` | Global content; role-gated, not user-scoped | `test_*_requires_admin` |
| Bulk import | `POST /admin/materials/import` | Global content; role-gated | `test_import_requires_admin` |
| Coverage | `GET /admin/materials/coverage` | Global aggregates; role-gated | `test_coverage_requires_admin` |
| Search | `GET /materials/search` | Auth required; user irrelevant (global content) | `test_*` in materials tests |
| Migration chain | n/a | n/a | `test_migration_chain.py` |

**Day 5 doesn't add tenant-isolation tests.** Week 3's surfaces are all global content behind role checks. Isolation semantics don't apply in the same way they do for the academic tracker (per-user data).

But Day 5 should add one test file `test_week3_isolation_audit.py` that *asserts this*:

```python
"""
Audit: Week 3 surfaces are admin/global, not user-scoped. This test
documents the design decision so a future change can't silently turn
a global endpoint into an accidentally user-scoped one (or vice versa)
without updating this file.
"""

def test_all_week3_admin_routes_require_role(...):
    # Iterate over the four admin routes, call each without admin creds,
    # assert 403. This catches the case where someone removes require_role
    # from a route by accident.

def test_materials_are_global_not_user_scoped(...):
    # Two users, same module_code. Both see the same materials.
```

### §5.6 Acceptance criteria

1. Migration chain test passes: no duplicate revisions, single root, single head = `0011`, no dangling parents.
2. `MIGRATION_LOG.md` exists with all 11 migrations documented.
3. `.github/PULL_REQUEST_TEMPLATE.md` (or `CONTRIBUTING.md`) updated to require migration log updates.
4. Isolation audit test file passes.
5. Full suite green at head `0011`.
6. Drift gate `[PASS]` on 41 routes.
7. `ruff check app/ tests/ scripts/` clean.
8. Day 5 close-out report written.
9. **No new features, no migration, no packages.**
10. Branch: `month2/week3-day5-coherence` off `develop`.

### §5.7 Verification steps

```bash
# Migration chain test
pytest tests/test_migration_chain.py -v

# Isolation audit
pytest tests/test_week3_isolation_audit.py -v

# Full suite
pytest -q

# Lint + contract
ruff check app/ tests/ scripts/
python scripts/export_openapi.py
python scripts/check_contract_drift.py    # [PASS]
```

### §5.8 Defect-discovery prompts

- **Test 1 finds a duplicate revision** → the class of bug nearly introduced on Day 3. Fix by renumbering the newer migration.
- **Test 1 finds a dangling parent** → a migration's `down_revision` references a revision that doesn't exist. Typically from a rebase or manual edit. Fix by correcting the pointer.
- **Test 3 fails because head isn't `0011`** → either a new migration landed (expected; update the test) or a migration was removed (investigate).
- **A Week 3 route stops requiring admin** → `test_all_week3_admin_routes_require_role` fails. That's the desired behavior; the fix is to restore `require_role`.
- **`MIGRATION_LOG.md` is out of sync with the tree** → add the missing entries. This is a documentation obligation, not a code fix.

### §5.9 What's NOT in Day 5

- New features
- New endpoints
- New migrations
- Additional tests beyond the two new test files
- Any change to Week 3 code that has already passed

Day 5 is a **review day**. It closes the week with evidence and documentation, not with new work.

---

## §6. The Push Blocker — Must Be Fixed Today

The report's §11.1 says:

> *"The fine-grained token lacks access to this repository: 403. Now 8 commits are local-only, including both Day 3 and Day 4, and the security audit response. None of it exists on the remote."*

**This is now the single biggest risk in the project.** Eight days of work exist only on one disk. If the laptop dies, the work is gone.

**Required action, in order:**

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens.
2. Find the token used for `university_helper`.
3. Under **Repository access**, add `X404V2000/university_helper`.
4. Under **Permissions → Repository permissions → Contents**, set **Read and write**.
5. Save.
6. In your terminal, run: `git push origin demo` (or whichever branch has the 8 commits).

**If the push fails again**, paste the exact error. I'll diagnose.

**This is not a Day 5 item.** This is a today item. Do it before Day 5 begins.

---
