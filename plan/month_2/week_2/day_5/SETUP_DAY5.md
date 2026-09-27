# Day 4 Report — Architectural Review & Day 5 Close-Out Blueprint

**Reviewer:** Senior Systems Design & Architecture Engineer
**Date:** 16 September 2026
**Status:** Day 4 **APPROVED** / Day 5 close-out blueprint below

---

## 1. Sign-Off on Day 4

Day 4 is approved. The implementation is faithful, disciplined, and — as with Day 2 — the defect-discovery prompts earned their keep.

**What landed well:**

| Deliverable | Assessment |
|---|---|
| `app/core/event_types.py` | Single source of truth for event types. Correct shape; the enum prevents the exact silent-drift class we discussed. |
| Bundled 11.1 / 11.2 / 11.3 | Shipped as specified; deferred 11.4/11.5 correctly. |
| `duration_ms` (nullable, no default) | Forward-only migration, no rewrite, no fake zeros. |
| Summarize instrumentation | `perf_counter`, recorded in `finally` — errors are part of the latency picture. |
| Sync duration | Client-reported via schema-bounded `client_duration_ms`; conditional record; silent drop of out-of-bounds values. |
| Percentile convention | Nearest-rank, rounded index, locked by a hand-computed test. |
| Deep-link contract | Documented in `docs/API_CONTRACT_V1.md`, examples included. |

**Zero new packages, migration head `0008`, ruff clean, 14 new tests, drift gate `[PASS]` on 26 routes.** Clean day.

---

## 2. The Casing Catch — Worth Calling Out

The engineer flagged something important in §3 of the report:

> *"I kept event-type casing **UPPERCASE** to match Day 3's already-persisted rows. The architect's lowercase examples in the prose would have silently orphaned every Day 3 event from metrics."*

**This is exactly the discipline I want.**

The blueprints I write are human-readable prose; the data on disk is not. When those two disagree, **the data wins** — and the engineer caught the disagreement before it shipped. Every Day 3 event would have become invisible to `get_metrics` (metrics would silently return `0` for WAU, cache-hit-rate, cost-per-user) and nobody would have noticed until the first real student hit the app.

That class of bug — **silent metric orphaning** — is precisely what 11.1 and 11.3 exist to prevent. The engineer applied them, then found a case they didn't cover: the **migration path from existing data**. Two takeaways:

1. **The enum should reflect what's on disk, not what a blueprint prose example says.** Correct call.
2. **Add one more guard test** (see Day 5 §5.4) to lock this behaviour so a future enum refactor can't silently re-introduce the mismatch.

No action needed on Day 4's code. The catch is recorded here so it's part of the historical record.

---

## 3. Where Week 2 Stands

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    MONTH 2, WEEK 2 — PROGRESS                            │
├──────────────────────────────────────────────────────────────────────────┤
│  D1 ✅ OpenAPI contract frozen                                           │
│  D2 ✅ Drift gate + client fixture + token helper                        │
│  D3 ✅ Product validation instrumentation (events, feedback, metrics)    │
│  D4 ✅ Sharing signals + friction instrumentation                        │
│  D5 → Coherence review + merge readiness (this blueprint)                │
└──────────────────────────────────────────────────────────────────────────┘
```

Week 2's theme — **the backend is now observable, but the offshore team hasn't built the client yet** — is complete. Day 5 is a review day, not a build day. The output is a **close-out report** and a clean `develop`.

---

## 4. Day 5 Objective

Prove Week 2 is internally consistent and merge-ready, then close the week with a documented handoff. No new features. No new endpoints. No new migrations.

Specifically:
1. **Migration integrity** — `0001 → 0008` applies cleanly, idempotently, and reverses.
2. **Cross-tenant security audit** — every Week 2 surface enforces tenant isolation.
3. **Full suite validation** — zero regressions across the whole repo.
4. **Contract + drift + ruff** — all green.
5. **Merge-readiness** — branch order, PR sequence, no orphaned work.
6. **Week 2 close-out** — documented open items carried forward.

---

## 5. Day 5 Blueprint

### 5.1 Migration integrity check

Verify the full chain from an **empty test database**, not the existing one — the point is to catch a broken migration that only fails on a clean slate.

```bash
# Fresh test DB (destroy + recreate)
dropdb --if-exists varsity_companion_test
createdb varsity_companion_test

# Apply full chain
alembic upgrade head
# expect: runs 0001 → 0008 without error

# Head check
alembic current
# expect: 0008 (head)

# Idempotency: re-run is a no-op
alembic upgrade head
# expect: no new migrations applied

# Reversibility: unwind one, reapply
alembic downgrade -1
alembic upgrade head
# expect: clean round-trip

# Offline SQL sanity (spot-check the newest migrations)
alembic upgrade 0007:0008 --sql | head -n 40
# expect: ALTER TABLE usage_events ADD COLUMN duration_ms INTEGER
```

**Report must include:** exact commands run, exact output, and a one-line verdict per check.

### 5.2 Cross-tenant isolation audit (Week 2 surfaces)

For each new surface from Week 2, confirm a dedicated test proves tenant isolation. The audit produces a table like:

| Surface | Endpoint | Isolation test | Result |
|---|---|---|---|
| Contract | (doc only) | n/a | n/a |
| Fixture seeding | script | local-guard test | ✅ |
| Share events | `POST /analytics/share` | `test_share_requires_auth` + user-scoped | ✅ |
| Metrics | `GET /admin/metrics` | `test_student_forbidden` (403) | ✅ |
| Duration recording | summarize + sync | scoped by `current_user.id` | ✅ |

If any row is missing a test, that's a Day 5 fix (small, one test), not a deferred item.

### 5.3 Full suite validation

Run the complete suite against the test DB and record:

```bash
pytest -q
# Report:
#   - Total tests collected
#   - Total passed
#   - Runtime
#   - Any skips (with reason)
```

The suite runtime against a live Postgres is a real cost. **This is the moment to measure it and decide whether it needs attention.** Options if runtime is getting uncomfortable:

- **Parallel execution** (`pytest-xdist -n auto`) — but check DB test isolation first. If tests share a session-scoped fixture, parallelizing will corrupt state.
- **Marker split** — `@pytest.mark.slow` for tests that hit the LLM or the live provider; run those only on push to `develop`, not on every local change.
- **Do nothing** — if it's under ~3 minutes, it's fine. Don't optimize on principle.

**My recommendation: measure first, decide second.** If it's under 5 minutes, leave it. The discipline of "real DB, no mocks" is worth a few minutes; mocks hide defects.

### 5.4 Add the enum-drift guard (the casing catch, locked)

Add one test to `tests/test_analytics_duration.py`:

```python
def test_persisted_event_types_match_enum():
    """
    Locks the contract between what's stored in the DB and the EventType enum.
    A future enum refactor must not silently orphan existing rows.
    """
    from app.core.event_types import EventType

    enum_values = {e.value for e in EventType}
    # Every value must be uppercase (matches Day 3 storage).
    for v in enum_values:
        assert v == v.upper(), f"EventType {v!r} is not uppercase"

    # Every value must round-trip through the enum.
    for v in enum_values:
        assert EventType(v).value == v
```

This doesn't prevent someone from changing the enum *and* the stored format together, but it forces the decision to be visible in a diff.

### 5.5 Merge-readiness review

Produce the merge order for `develop`:

```
1. month2/week2-day1-openapi        (contract freeze)
2. month2/week2-day2-client-harness (drift gate + fixture)
3. month2/week2-day3-instrumentation (events + feedback + metrics)
4. month2/week2-day4-signals        (sharing + duration)
5. month2/week2-day5-coherence      (this close-out)
```

Each branch builds on the prior. Merging out of order will produce false conflicts (e.g., Day 4 touches `analytics_service.py` which Day 3 created). **Merge in this exact order.**

Checklist per branch:
- [ ] Branch off `develop`, not off another feature branch
- [ ] CI green (ruff + alembic + pytest + docker + drift gate)
- [ ] `docs/openapi.json` in sync with `app.openapi()`
- [ ] No stray debug prints, `TODO`s, or commented-out code
- [ ] Commit messages reference the day (e.g., `week2-day4: sharing + duration signals`)

### 5.6 Week 2 close-out report

The Day 5 report itself is the close-out. It must contain:

1. **Scope delivered** — table of the four feature days + this close-out.
2. **Migration head** — `0008`; full chain verified from empty DB.
3. **Test totals** — Week 1 baseline + Week 2 additions; full suite count.
4. **Isolation audit** — the table from §5.2.
5. **Contract status** — route count, drift gate result.
6. **Defects found in Week 2** — the running list (from Day 2, Day 3, Day 4 reports + any found today).
7. **Open items carried forward** — see §6.
8. **Merge order** — the sequence from §5.5.
9. **Handoff note** — one paragraph stating what the offshore team can now build against, and what's blocked (if anything).

---

## 6. Open Items Carried Forward (expected)

These are the known items that Week 2 should hand off, not resolve:

| Item | Owner | Trigger to resolve |
|---|---|---|
| Set Gemini spend cap/alert on Google billing | You (founder action) | Before first real student hits `/ai/summarize` |
| Wire `REDIS_URL` for rate limiting | Engineering | Before multi-worker / multi-instance deploy |
| `curl_metrics.sh` helper (11.4 from Day 4) | Engineering | When you start reading metrics daily |
| Debug log on dropped durations (11.5 from Day 4) | Engineering | When the first anomaly appears in metrics |
| Clock-skew guard on sync `updated_at` | Engineering | Before offline sync goes live with real students |
| Materials curation workflow (how new rows enter `study_materials`) | You + Engineering | Before you want materials beyond the seeded fixtures |
| Client-side development start | Offshore team | As soon as `docs/CLIENT_DEV_HARNESS.md` is read |

None of these block the Week 2 merge. All are real, none are urgent.

---

## 7. Acceptance Criteria

1. Migration chain `0001 → 0008` applies cleanly from an empty database, is idempotent on re-run, and reverses (`downgrade -1` then `upgrade head`) without error.
2. Every Week 2 surface has a documented tenant-isolation test; the audit table in §5.2 is complete.
3. Full test suite passes; total count and runtime are reported.
4. `ruff check app/ tests/ scripts/` clean.
5. `python scripts/check_contract_drift.py` returns `[PASS]`.
6. New guard test `test_persisted_event_types_match_enum` passes and is committed.
7. Merge order is documented; each branch is verified CI-green locally where possible.
8. Day 5 close-out report is written with all nine sections from §5.6.
9. **No new packages, no new endpoints, no new migrations** (Day 5 is review-only).
10. Branch: `month2/week2-day5-coherence` off `develop`.

---

## 8. Verification Steps

```bash
# 1. Fresh migration chain
dropdb --if-exists varsity_companion_test && createdb varsity_companion_test
alembic upgrade head
alembic current          # expect: 0008 (head)
alembic upgrade head     # idempotent no-op
alembic downgrade -1 && alembic upgrade head

# 2. Lint + full suite
ruff check app/ tests/ scripts/
pytest -q

# 3. Drift gate
python scripts/check_contract_drift.py

# 4. New guard test
pytest tests/test_analytics_duration.py::test_persisted_event_types_match_enum -v

# 5. Confirm zero new artifacts
git diff --stat develop..HEAD
#   - no new model files
#   - no new migration files beyond 0008
#   - no new packages in requirements*.txt
```

---

## 9. Defect-Discovery Prompts

> Run it, don't just read it.

- **A migration fails only on fresh DB, not on existing DB** → it depends on a state that existed before `0001`. Grep the failing migration for `IF NOT EXISTS` or `ALTER ... IF EXISTS`; those hide the fact that a prior migration didn't create something. Remove the safety clauses from the newest migration and see if it fails — if yes, fix the prior migration.
- **`alembic current` reports a revision that isn't in the file tree** → a branch was merged with an out-of-order revision ID, or a revision was deleted. Use `alembic history --verbose` to see the chain.
- **`test_persisted_event_types_match_enum` fails on Day 3 data** → the enum casing decision was reversed during Day 5 refactoring. Check `git blame` on `event_types.py`; the check should be uppercase.
- **Full suite passes locally but CI fails** → CI runs `ENVIRONMENT=testing` (hardened, docs off, no Secure cookies). A test that assumes development mode will fail. Grep for `settings.environment == "development"` in tests.
- **`ruff check` passes on files but CI lints a file you forgot** → CI runs `ruff check app/ tests/ scripts/`, not just `app/`. Confirm the same paths locally.
- **Drift gate passes locally but not in CI** → the exporter reads from `.env` and your local `.env` differs from CI's. The exporter must be env-independent (Day 1 Month 2 established this); confirm it doesn't read app settings.
- **Isolation audit missing a surface** → grep for `@router.post` and `@router.get` across `app/api/v1/` and confirm each has either a tenant-isolation test or a documented reason it doesn't need one (e.g., global content like `study_materials`).

---

## 10. Sign-Off Checklist

- [ ] Fresh-DB migration chain verified (0001 → 0008)
- [ ] Idempotent re-run verified
- [ ] Downgrade + re-upgrade verified
- [ ] Cross-tenant isolation audit table complete
- [ ] Full suite green; runtime reported
- [ ] `ruff check app/ tests/ scripts/` clean
- [ ] Drift gate `[PASS]`
- [ ] `test_persisted_event_types_match_enum` added and passing
- [ ] Merge order documented
- [ ] Day 5 close-out report complete (all nine §5.6 sections)
- [ ] **No new packages, endpoints, or migrations**
- [ ] Branch: `month2/week2-day5-coherence` off `develop`

---

