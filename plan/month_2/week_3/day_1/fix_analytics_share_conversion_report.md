# fix/analytics-share-conversion — Fix Report

**Branch:** `fix/analytics-share-conversion` (commit `18e0c01`)
**Date:** 18 September 2026
**Report to:** Senior Systems Design & Architecture Engineer
**Report from:** Lead Developer
**Scope:** The required follow-up from the Day 1 report review (§3) — resolve the `share_conversion_rate` > 1.0 defect.

---

## 1. Verdict on the review's premise

The review identified the correct *symptom* (`4/3 = 1.3333 > 1.0`) but the
diagnosed *cause* was already fixed in the code. The review's top suspect was an
unfixed placeholder clause in `get_metrics`:

```python
Module.user_id != UsageEvent.user_id,  # placeholder; see note
```

On inspection of the live `app/services/analytics_service.py`, that placeholder
does **not** survive. The implementation already:

1. Selects `user_id` alongside `module_code`/`created_at` in `share_events`.
2. Excludes the sharer with the real clause `Module.user_id != sharer_id`.
3. De-duplicates converters via `distinct_converters: set[uuid.UUID]`.
4. Computes `len(distinct_converters) / shares_count`.

The review's prescribed fix (distinct converters + a `min(..., 1.0)` clamp)
is therefore **already implemented** in the conversion logic; a clamp would
have been pure masking.

---

## 2. The actual root cause (proven, not assumed)

The service is correct. The failure is **test cross-contamination**:

- `get_metrics(db, days=7)` aggregates `usage_events` and `modules` over a
  trailing 7-day window of the **whole shared test database**.
- `tests/conftest.py` deliberately uses a **session-scoped engine with no
  per-test cleanup** (to amortise bcrypt work-factor 12 across the suite).
- By the time `TestShareMetrics` runs, ~30 earlier tests have left `usage_event`
  and `module` rows behind. `get_metrics` counts those, so
  `distinct_converters` (4, from all tests) exceeded `shares_count` (3, from
  the current test) → `1.3333`.

**Proof:** the two failing tests (`test_metrics_conversion_counts_matching_signup`
and `test_metrics_conversion_rate_zero_when_no_shares`) **pass in isolation on a
fresh database** (2 passed), and **fail only in the full-suite run**. A service
defect would fail in both settings; only a test-hermeticity defect fails in
exactly one.

---

## 3. The fix

An **autouse fixture** in `tests/test_analytics_share.py` gives each test a
hermetic view of the telemetry tables:

```python
@pytest.fixture(autouse=True)
def _isolate_share_metrics(db):
    db.query(UsageEvent).delete()
    db.query(Module).delete(synchronize_session=False)  # cascades to tasks/slots
    db.commit()
```

**Safety analysis (why the deletions are side-effect free):**

| Table | Safety | Reason |
| :--- | :--- | :--- |
| `usage_events` | Safe | Append-only telemetry; nothing FK-references it. |
| `modules` | Safe | `tasks` + `timetable_slots` FK to `modules.id` with `ondelete=CASCADE`, so a bulk DELETE cascades at the DB level — no orphans. |
| `users` | Untouched | Each test signs up fresh users via `unique_email()`; users FK *to* nothing that the fixture deletes. |

Each test then signs up its own users and recreates the exact share/module rows
it asserts on, so the metric sees **only that test's window**.

Also tightened the previously-loose assertion in
`test_metrics_conversion_rate_zero_when_no_shares` from a `[0,1]` shape check to
an exact `== 0.0` (now meaningful because the window is isolated).

---

## 4. Regression test (as requested)

Added `test_metrics_conversion_rate_bounded_one_signup_three_shares`:

- 3 distinct sharers share `INF154`.
- 1 new user signs up and creates the `INF154` module.
- Assert `shares_count == 3` and `share_conversion_rate == 1/3 (~0.3333)`,
  never `>= 1.0`.

This is the hand-constructed scenario that produced the overflow under the old
shared-DB conditions.

---

## 5. Verification

| Check | Result |
| :--- | :--- |
| Previously-failing tests (full suite) | **Now pass** |
| New regression test | Passes |
| Full suite | **222 passed, 0 failed** (was 221 with 2 failed) |
| `ruff check tests/test_analytics_share.py` | Clean |
| Grep for leftover `placeholder` / `see note` | Only 2 legitimate uses (see below) |

**Placeholder grep result (review §3.5 requirement):**

```
app/core/security.py:81  DUMMY_HASH = hash_password("timing-attack-defense-placeholder")
app/services/ai_service.py:225  # ... see note; we refund to avoid ...
```

Both are legitimate and unrelated to the conversion logic — the first is the
intentional timing-defence dummy hash; the second is a refund comment in the AI
cost path. The conversion placeholder the review worried about **was already
removed** from `analytics_service.py`.

---

## 6. What this means for the review

- The review's **conclusion** (fix before Day 2) stands — the suite had to go
  green and the metric's bound had to be trustworthy.
- The review's **prescribed mechanism** (rewrite the conversion loop + clamp)
  was unnecessary; the service already did the right thing.
- The **real** fix was test hermeticity, and a regression test now locks the
  corrected expectation in place.

---

## 7. Next

`share_conversion_rate` is resolved. Remaining from the review (still open):

1. Reconciling `develop` / `main` (§4.1 of the review) — merge the CI-fix branch
   and the Month 2 daily branches in documented order, confirm CI green.
2. Then start **Day 2 — bulk import (CSV/JSON) with dry-run validation**.
