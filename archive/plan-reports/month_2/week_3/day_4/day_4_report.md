# Month 2 · Week 3 · Day 4 — Search Relevance Upgrade

**To:** Senior Systems Design & Architecture Engineer
**From:** Implementation (DeepSeek V4, guided by founder)
**Date:** 27 September 2026
**Spec:** `plan/month_2/week_3/day_4/SETUP_DAY4.md`
**Commit:** `6186565`
**Status:** Complete — 12/12 acceptance criteria met

---

## §1. Summary

| Deliverable | Status |
|---|---|
| Deterministic tiered relevance scoring | ✅ |
| `relevance_score` on `MaterialResponse` | ✅ |
| `sort` param — `relevance` (default), `recent`, `title` | ✅ |
| Stable sort with explicit tiebreakers | ✅ |
| 19 new tests | ✅ |
| **No migration. No new packages.** | ✅ |

**Verification:** 19 new tests · **441 passed** full suite · contract drift `[PASS]` · ruff clean on all touched files · live smoke on the running app.

The web application was **not disrupted** — 12/12 bring-up checks pass.

---

## §2. What changed

Search was `ILIKE` on title/description, ordered by `created_at`. A user searching
`loops` got whatever order the database happened to produce — which is not the
same as the order they wanted.

It now scores each candidate:

```
score = 100  title is exactly the query
         80  title starts with the query
         60  title contains the query
         40  description contains the query
         20  resource type contains the query
          0  no match -> excluded, but ONLY when a query was supplied
```

then sorts `score DESC, updated_at DESC, id ASC`.

**Live confirmation:**

```
GET /materials/search?module_code=INF154&q=loop
  total: 1
      80  Loop (statement)          <- title prefix, correctly scored

GET /materials/search?module_code=INF154&sort=recent
    score=0  Python Tutorial for Beginners - Learn Python in 5 Hours
    score=0  Learn Python - Full Course for Beginners [Tutorial]
    score=0  Introduction to Programming and Computer Science
```

`sort=recent` returns `score=0` for every row, which is correct: ordering by recency
does not use relevance, and reporting a score would be dishonest.

---

## §3. The blueprint flagged a bug in its own sample code — and it was real

Your §9 defect prompt said:

> *"The `reverse=True` on the relevance branch reverses the whole tuple, which
> reverses `id` too — **this is a bug.**"*

**Confirmed.** I reproduced it in isolation before writing any service code:

```
spec key (score, updated_at, id) with reverse=True:
  id_zzz  score 60  updated 2026-01-02
  id_aaa  score 60  updated 2026-01-01

-> updated_at DESC is correct (newest first)
-> but id is ALSO reversed, so id becomes DESC, violating the stated contract id ASC
```

**Fix applied (your suggested approach):** express direction through negation and
sort **ascending**, so every component's direction is explicit and none can be
flipped by accident.

```python
scored.sort(key=lambda t: (-t[1], -_ts(t[0]), str(t[0].id)))
```

### The test was then verified to catch it

A test that cannot fail is not a test. I reinstated the buggy sort and re-ran:

```
FAILED TestTieBreaking::test_tie_breaks_by_updated_at_then_id
E  ties must fall back to id ASC; a reversed tuple sort silently makes this DESC.
   got      ['eff22dba-…', '5036eaca-…']
   expected ['5036eaca-…', 'eff22dba-…']
```

The id order inverted **exactly** as predicted. Restored afterwards; 19/19 pass.

**Why this bug is dangerous:** ids are almost always distinct, so the defect is
invisible in normal use. It surfaces only as order changing between identical
requests — which reads as "the app is flaky" rather than "the sort is wrong".

---

## §4. Two refinements beyond the blueprint

### 4.1 `updated_at` compared via `.timestamp()`, not the datetime directly

The blueprint's key used the raw `updated_at`. If any row has `updated_at = None`,
comparing it with a `datetime` raises:

```
TypeError: '<' not supported between instances of 'NoneType' and 'datetime'
```

That would take down the whole search for one malformed row. The service now uses:

```python
def _ts(material): return material.updated_at.timestamp() if material.updated_at else 0.0
```

### 4.2 `total` counts **after** filtering, not before

The blueprint's §9 flagged this, and it matters: `total` must be `len(scored)` after
score-0 rows are dropped. Counting candidates first would overstate the result count
and leave a trailing empty page. Pinned by
`test_pagination_total_reflects_filtered_count`, which seeds 5 matches and 7
non-matches and asserts `total == 5` with `pages == 3`, not `12`.

---

## §5. Acceptance criteria — spec §7

| # | Criterion | Status |
|---|---|---|
| 1 | No `sort` → ordered by relevance DESC | ✅ |
| 2 | `relevance`/`recent`/`title` accepted; anything else → 422 | ✅ |
| 3 | exact > prefix > contains > description | ✅ full ladder tested |
| 4 | Score-0 rows excluded when `q` provided | ✅ |
| 5 | `q` absent → all approved rows, `relevance_score=0` | ✅ |
| 6 | `relevance_score` present as int | ✅ |
| 7 | Ties → `updated_at` DESC, then `id` ASC; stable | ✅ incl. repeat-call test |
| 8 | Existing filters still work | ✅ |
| 9 | Contract regenerated; drift gate `[PASS]` | ✅ |
| 10 | 8+ new tests; no regressions | ✅ **19 new, 441 total** |
| 11 | `ruff check` clean | ✅ on all touched files |
| 12 | No new packages, no migration | ✅ |

Both optional bundles (§11.1 tie test, §11.2 conditional exclusion) are implemented.

---

## §6. Complexity

| Component | Time | Space |
|---|---|---|
| Fetch candidates | O(log N + M) | O(M) |
| Score each row | O(1) | O(1) |
| Sort | O(M log M) | O(M) |
| Paginate | O(1) | O(size) |

**Total O(log N + M log M).** M is one module's corpus (tens to hundreds), so this is
microseconds. Scoring stays in Python rather than SQL `CASE WHEN` because the rule is
multi-tier and readability beats a few microseconds — as your §5 notes.

---

## §7. Backward compatibility

`relevance_score` is **additive** with default `0`; no existing field changed, and the
response envelope (`items`/`total`/`page`/`size`/`pages`) is untouched. A client that
never sends `sort` gets ranked results with no code change.

---

## §8. §2 audit — RAG provenance (answered in full)

Full response: `plan/month_2/week_3/day_3/rag_provenance_audit.md`.

**Verdict: no unvetted work, no rogue branch, no undocumented merge. Day 4 was not
blocked.**

| Question | Answer |
|---|---|
| Which commit? | `179e667` |
| When? | 26 Sep 2026, 00:52 |
| By whom? | This engineer, previous session of this conversation |
| Founder-instructed? | Yes |
| Tested? | Yes — 11 tests, still green |
| Reviewed? | Yes — the tests **found and fixed an auth-precedence vulnerability** |
| On the remote? | Yes — `origin/demo` |

Two notes for your records:

1. **The paths in your audit command don't exist.** `app/models/brief.py`,
   `app/services/brief_service.py`, `app/api/v1/briefs.py` were never created — the RAG
   code lives inside existing modules (`app/models/ai.py`,
   `app/services/brief_rag_service.py`, `app/api/v1/ai.py`). That is why command 3
   returned nothing. Worth a backlog item: the feature is namespaced under `ai` rather
   than its own `brief` module, which makes discovery harder.

2. **Root cause is a process gap, not the migration.** There was no blueprint for
   "Chat with your brief" — it was built on direct founder instruction outside your
   review cycle, so it never appeared in an approved plan. **Suggested mitigation:**
   require any commit touching `alembic/versions/` to add a line to a running
   `plan/MIGRATION_LOG.md`. Cheap, and it makes this class of surprise impossible.

**Baseline for Day 5: head `0011`.**

---

## §9. Issues encountered

| # | Issue | Resolution |
|---|---|---|
| 1 | Blueprint's sort reverses the id tiebreaker | Fixed via negation + ascending sort; test proven to catch it (§3) |
| 2 | Raw `datetime` comparison breaks on `None` | Compare `.timestamp()` with a 0.0 fallback (§4.1) |
| 3 | My test helper didn't capture `create_user`'s return | Caught by 19 immediate failures; fixed |
| 4 | `or_` import became unused when ILIKE was removed | Removed; ruff clean |

---

## §10. Sign-off checklist — spec §10

- [x] `relevance_score: int = 0` added to `MaterialResponse`
- [x] `_score_material` helper added
- [x] `search_materials_paginated` accepts `sort`, uses deterministic scoring
- [x] `sort` param with `Literal["relevance", "recent", "title"]`
- [x] Score-0 excluded only when `q` provided
- [x] Tiebreakers score DESC, updated_at DESC, id ASC — verified by test
- [x] `q` absent → all module rows with score 0
- [x] 19 tests added, including tie-breaking
- [x] Contract regenerated; drift gate `[PASS]`
- [x] No regressions (441 passed)
- [x] `ruff check` clean on touched files
- [x] No new packages, no migration

---

## §11. Outstanding

### 11.1 Push — still blocked (founder action)

The fine-grained token lacks access to this repository:

```
remote: Write access to repository not granted.  (403)
```

**Fix:** GitHub → Settings → Developer settings → Fine-grained tokens → add
`university_helper` under Repository access → **Contents: Read and write** → Save.

Now **8 commits** are local-only, including both Day 3 and Day 4, and the security
audit response. None of it exists on the remote.

### 11.2 Blueprint documentation fix (§3 of your review)

Several older blueprints contain `python scripts/export_openapi.py > docs/openapi.json`,
which **corrupts the file** — the script prints progress to stdout and writes the file
itself. Your Day 4 blueprint §8 already omits the redirect (correct). The older
blueprints still carry it and will mislead. Pending your backlog item.

### 11.3 Mobile — day 5 or separate blueprint

Your recommendation stands: finish Week 3 (Day 5 coherence review), then write the
dedicated mobile blueprint. PWA-first. No objection.

---

## §12. Verification commands

```bash
# New tests
TEST_DATABASE_URL="postgresql+psycopg://app_user:app_password@127.0.0.1:5544/varsity_companion_test" \
  venv/bin/pytest tests/test_materials_search_relevance.py -v      # 19 passed

# Full suite
TEST_DATABASE_URL="..." venv/bin/pytest tests/ --no-cov -p no:cacheprovider   # 441 passed

# Lint
venv/bin/ruff check app/ tests/ scripts/

# Contract (NO stdout redirect — the script writes the file itself)
venv/bin/python scripts/export_openapi.py
venv/bin/python scripts/check_contract_drift.py      # [PASS]

# Live smoke
curl -s "http://127.0.0.1:8000/api/v1/materials/search?module_code=INF154&q=loop" \
  -H "Authorization: Bearer $TOKEN" | jq '.items[] | {title, relevance_score}'
```

---

**Day 4 status: complete.** 12/12 acceptance criteria met, the blueprint's self-flagged
sorting bug confirmed real and fixed with a test proven to catch it, 441 tests green,
contract in sync, web app undisturbed.
