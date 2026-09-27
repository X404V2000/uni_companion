# Month 2 · Week 3 — Close-Out

**To:** Senior Systems Design & Architecture Engineer
**From:** Implementation (DeepSeek V4, guided by founder)
**Date:** 27 September 2026
**Spec:** `plan/month_2/week_3/day_5/SETUP_DAY5.md`
**Head:** `0011`
**Commit:** `b1b95c5`
**Suite:** **469 passed, 0 failed**
**Drift gate:** `[PASS]` on 41 routes

---

## §1. What shipped this week

| Day | Feature | Migration | Tests added |
|---|---|---|---|
| D1 | Admin materials CRUD (role-gated) | `0009` | 13 |
| D2 | Bulk import (CSV/JSON + dry-run + atomicity) | — | 16 |
| D3 | Coverage analytics + `(module_code, url)` index | `0011` | 18 |
| D4 | Ranked search (deterministic relevance) | — | 19 |
| D5 | Coherence review — chain + role gates locked | — | **28** |
| — | RAG "Chat with your brief" *(outside the blueprint)* | `0010` | 11 |
| | **Total for the week's files** | | **94** |

Full suite grew from **441** (end of Day 4) to **469** today.

---

## §2. What was caught by running, not reading

This is the section worth reading. Every item below was found by executing
something, and none of them would have surfaced from a code review:

| # | Caught | Consequence if missed |
|---|---|---|
| 1 | **Migration `0010` was already taken**, so the Day 3 index became `0011` | Two files declaring `revision="0010"` → `alembic upgrade head` breaks in **every** environment. The app imports and the whole suite stays green, so nothing would have caught it until someone built a database. |
| 2 | **The Day 4 blueprint's own sort had a real bug** — `reverse=True` on a mixed tuple reversed the `id` tiebreaker too | Order flips to `id DESC` while the contract says ASC. Invisible in normal use because ids are distinct; only shows up as results changing between identical requests. |
| 3 | **Route order** — `/materials/coverage` had to precede `/materials/{material_id}` | `coverage` gets captured as a UUID → 422, which reads as "bad input" rather than "misplaced route". |
| 4 | **Unstable sort** — three modules tied at 14 materials | Without the `module_code ASC` tiebreaker, pagination silently drops or repeats rows while every response looks correct. |
| 5 | **Index test matched the name, not the column** — `"url"` appears in `ix_materials_module_url` before the column does | The index assertion would have passed on a wrongly-ordered index. Fixed by reading `pg_index.indkey`. |
| 6 | **The blueprint's own export command corrupts a file** — `export_openapi.py > docs/openapi.json` | The script prints progress to stdout *and* writes the file, so the redirect injects `[+] Exported…` into the JSON. |
| 7 | **The blueprint's regex didn't match our migrations** — it only handled `revision = "x"`, but all six use `revision: str = "x"` | The chain test would have parsed **zero files** and passed vacuously. Guarded with a discovery assertion. |
| 8 | **The blueprint's migration table named four non-existent files** | A log that disagrees with the tree is worse than no log. Reconciled against `git` and cross-checked by script. |

**Items 1, 2, and 6 are defects in the blueprint, found by the implementation.**
Item 7 would have silently disabled the day's main deliverable.

---

## §3. Migration chain

```
0001 → 0002 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010 → 0011
```

Verified beyond the unit tests, against a **throwaway empty database** created for
the purpose:

| Check | Result |
|---|---|
| `alembic upgrade head` from empty | **11 migrations applied** → head `0011` |
| Day 3 index present in the fresh DB | `ix_materials_module_url` ✅ |
| `alembic downgrade base` | **11 migrations reversed**, **0 tables remaining** |

The chain is linear, unbranched, with one root and one head. Locked by
`tests/test_migration_chain.py`.

**`plan/MIGRATION_LOG.md`** is backfilled with all 11 migrations, with dates taken
from `git` and filenames reconciled against the real tree. Cross-checked
mechanically: 11 rows, no missing, no extras, no wrong names.

---

## §4. Isolation audit

Materials are **global curated content** keyed by module code, not per-student
records. The audit makes both that and the role gates executable.

| Surface | Gate | Result |
|---|---|---|
| `GET /admin/metrics` | ADMIN/SUPERUSER | 401 / 403 ✅ |
| `POST /admin/materials` | ADMIN/SUPERUSER | 401 / 403 ✅ |
| `GET /admin/materials` | ADMIN/SUPERUSER | 401 / 403 ✅ |
| `GET /admin/materials/coverage` | ADMIN/SUPERUSER | 401 / 403 ✅ |
| `POST /admin/materials/import` | ADMIN/SUPERUSER | 401 / 403 ✅ |
| `PATCH /admin/materials/{id}` | ADMIN/SUPERUSER | 401 / 403 ✅ |
| `DELETE /admin/materials/{id}` | ADMIN/SUPERUSER | 401 / 403 ✅ |
| `POST /admin/purge-deleted-users` | ADMIN/SUPERUSER | 401 / 403 ✅ |
| `GET /materials/search` | auth required; **global content** | two students see identical rows ✅ |

**Beyond the blueprint's four routes, the audit covers all eight** admin routes, so
a gate removed anywhere in the module is caught — not just in Week 3's additions.

There is also a **positive control**: an ADMIN must still get 200, so the 403
assertions cannot pass merely because a route is broken for everyone.

**Both audit tests were verified to fail on the defect they guard against:**
deleting the coverage route's `require_role` produced
`"allowed a STUDENT (status 200)"`, and adding a duplicate `0011` migration
produced `"duplicate revision ids: ['0011']"`. Restored afterwards.

---

## §5. Acceptance criteria — spec §7

| # | Criterion | Status |
|---|---|---|
| 1 | `test_migration_chain.py` exists, all tests pass | ✅ **7 tests** |
| 2 | `test_week3_isolation_audit.py` exists, all pass | ✅ **21 tests** |
| 3 | `MIGRATION_LOG.md` with all 11 migrations + head | ✅ verified by script |
| 4 | PR template requires the migration log update | ✅ |
| 5 | `week_3_close_out.md` complete | ✅ this document |
| 6 | Full suite green at head `0011` | ✅ **469 passed** |
| 7 | Drift gate `[PASS]` | ✅ 41 routes |
| 8 | `ruff check` clean | ✅ on all new files |
| 9 | No new features, migration, or packages | ✅ |
| 10 | Branch off `develop` | ⚠️ see §7 |

---

## §6. Spec deviations (all verified, not assumed)

| Spec said | Reality | Action |
|---|---|---|
| `revision = "x"` regex | Our migrations use `revision: str = "x"` | Parser handles both; added a discovery guard so an empty parse fails loudly |
| `pytest` imported in chain test | Genuinely unused | Omitted; ruff clean |
| Fixtures `admin_token`, `student_token`, `seed_materials` | **Do not exist** in `conftest.py` | Adapted to the project's real pattern (`user_service.create_user` + login), as the spec instructed |
| Migration table filenames | 4 were wrong | Corrected from the tree; dates taken from `git` |
| 5 tests in chain file | — | **7**, adding a linear-walk property and a discovery guard |

---

## §7. Open items carried forward

### 🔴 1. Push is still blocked — now the single largest risk

**11 commits exist only on this disk.** Verified again today:
`git push origin demo` cannot authenticate.

The token is valid and authenticates as `X404V2000`, but was granted access to
six other repositories and **not** `university_helper`. A direct push returns:

```
remote: Write access to repository not granted.  (403)
```

**Fix (founder, ~1 minute):**
GitHub → Settings → Developer settings → Fine-grained tokens → *the token* →
**Repository access** → add `X404V2000/university_helper` →
**Permissions → Contents → Read and write** → Save.

**If the laptop dies before this is done, three days of work is gone.**

### 2. Blueprint documentation hazard
Older blueprints contain `python scripts/export_openapi.py > docs/openapi.json`,
which corrupts the file. Day 4 and Day 5 blueprints are correct; earlier ones are
not. Documentation-only fix, still pending.

### 3. Mobile scope
Deferred to Week 4 per your recommendation. **PWA-first**, then a React Native
blueprint for a later decision.

### 4. Two-stack repository
`demo` (Python/FastAPI, the real backend) vs `frontend`/`main` (a separate
TypeScript/Express export). Post-hackathon decision; not touched this week.

### 5. Naming convention
The RAG feature lives under `app/models/ai.py` rather than a `brief_*` namespace,
which is why your Day 4 audit commands returned nothing. You recommended
documenting rather than renaming — agreed, and now noted in `MIGRATION_LOG.md`.

---

## §8. Merge readiness

**Baseline for Week 4: head `0011`, suite 469, drift `[PASS]`.**

Branch order for merging into `develop`: `D1 → D2 → D3 → D4 → D5`. The week's
work is cumulative and each day builds on the last; `0011` must not be merged
before `0009` and `0010` are present.

Note that the migration chain now includes `0010` (RAG), which was **never part of
an approved blueprint**. It is clean — audited on Day 4, commit `179e667`, tested,
on `origin/demo` — but it should be formally adopted into the plan, otherwise the
documented baseline and the real baseline differ by one revision.

---

## §9. Verification commands

```bash
# The two new test files
TEST_DATABASE_URL="postgresql+psycopg://app_user:app_password@127.0.0.1:5544/varsity_companion_test" \
  venv/bin/pytest tests/test_migration_chain.py -v          # 7 passed
TEST_DATABASE_URL="..." venv/bin/pytest tests/test_week3_isolation_audit.py -v  # 21 passed

# Full suite
TEST_DATABASE_URL="..." venv/bin/pytest tests/ --no-cov -p no:cacheprovider     # 469 passed

# Lint + contract (NO stdout redirect — the script writes the file itself)
venv/bin/ruff check app/ tests/ scripts/
venv/bin/python scripts/export_openapi.py
venv/bin/python scripts/check_contract_drift.py             # [PASS]

# Cross-check the migration log against the tree
python3 /tmp/check_migration_log.py

# Prove the chain on a throwaway empty database
docker exec vc_demo_pg psql -U app_user -d postgres -c "CREATE DATABASE chain_probe;"
DATABASE_URL="postgresql+psycopg://app_user:app_password@127.0.0.1:5544/chain_probe" \
  venv/bin/alembic upgrade head      # 11 applied -> 0011
DATABASE_URL="..." venv/bin/alembic downgrade base         # 11 reversed, 0 tables
docker exec vc_demo_pg psql -U app_user -d postgres -c "DROP DATABASE chain_probe;"
```

---

**Week 3 status: closed.** Four features, two migrations, 94 tests across the
week's files, 469 in the suite, chain locked and verified from empty, role gates
audited across the whole admin surface, and every deviation from the blueprints
documented with evidence.

The one thing that is not done, and cannot be done from here, is the push.
