# Month 2 · Week 3 · Day 3 — Materials Coverage Analytics + `(module_code, url)` Index

**To:** Senior Systems Design & Architecture Engineer
**From:** Implementation (DeepSeek V4, guided by founder)
**Date:** 27 September 2026
**Spec:** `plan/month_2/week_3/day_3/SETUP_DAY1.md`
**Commit:** `51f3e1d`
**Status:** Complete — 16/16 spec acceptance criteria met

---

## §1. Summary

Day 3 delivered both specified items:

| # | Deliverable | Status |
|---|---|---|
| 1 | Composite index `ix_materials_module_url` on `study_materials(module_code, url)` | ✅ Shipped (**migration `0011`**, not `0010` — see §2) |
| 2 | `GET /admin/materials/coverage` — role-gated, bounded coverage report | ✅ Shipped |

**Verification:** 18 new tests · **422 passed** full suite · contract drift `[PASS]` · ruff clean on all touched files.

**No new packages. No LLM calls. No external APIs.**

The web application was **not disrupted** — all 12 bring-up checks pass on the same commit.

---

## §2. Deviation from the spec: migration numbered `0011`, not `0010`

The spec (§4.1) specifies `alembic/versions/0010_materials_module_url_index.py` with
`revision = "0010"`, `down_revision = "0009"`, because it was written against a baseline
of head `0009`.

**By implementation time, `0010` was already occupied** by
`0010_brief_documents_and_chunks.py` (the "Chat with your brief" RAG tables, added after
the spec was authored).

Reusing revision `0010` would have produced **two migration files with the same revision
id** — Alembic would fail to resolve the history, breaking `alembic upgrade head` for
every environment.

**Resolution:** the migration ships as `0011` with `down_revision = "0010"`. The index
definition, name, columns, uniqueness and downgrade are **exactly as specified**; only
the revision number and its parent differ. This is documented in the migration's own
docstring so a future reader does not think it is a numbering error.

> **Note for the architect:** the spec's stated baseline ("head `0009`") is now stale.
> Baseline is `0010`, head after this day is `0011`.

---

## §3. What was built

### 3.1 Migration `0011` — `ix_materials_module_url`

```python
op.create_index(
    "ix_materials_module_url",
    "study_materials",
    ["module_code", "url"],
    unique=False,
)
```

**Why non-unique (as specified):** the duplicate rule stays in the import layer, where it
can report *which* rows collided and honour `on_duplicate`. A unique constraint would
raise a bare integrity error the importer could not explain, and would forbid cases still
under discussion.

The index is **also declared on the SQLAlchemy model** (`app/models/material.py`) so the
ORM and the physical schema cannot drift apart.

**Verified forward and backward:**
```
alembic upgrade head    -> 0011, index count = 1
alembic downgrade -1    -> index count = 0
alembic upgrade head    -> index count = 1
```

### 3.2 `GET /admin/materials/coverage`

Returns three sections:

| Section | Contents |
|---|---|
| `summary` | `total_materials`, `approved`, `unapproved`, `modules_with_materials`, `starved_modules` |
| `by_module` | `{module_code, total, approved, unapproved, last_updated_at}` — sorted `total DESC, module_code ASC`, paginated |
| `starved` | `{module_code, module_name}` — modules students are enrolled in with **zero** materials, paginated |

**Design note — why both directions exist.** `study_materials` is *global content* keyed by
code; `modules` is *per-student enrolment*. They are independent tables, so a code can
appear in either, both, or neither. Grouping materials alone can only answer *"how much
exists"*; it can never reveal a module that students have but that has no content at all.
That gap is precisely what an operator needs to see before a student opens an empty
module, so `starved` compares enrolment against content.

**Bounded:** both lists are independently capped by `size` (≤ 100), so the payload is
O(size) regardless of how many modules exist.

---

## §4. Correctness guarantees (verified by test)

| # | Guarantee | Mechanism |
|---|---|---|
| 1 | `approved + unapproved == total_materials` | `unapproved` is *derived* (`total - approved`), never counted separately |
| 2 | `summary.starved_modules == starved_total` | one row-count reused for both fields |
| 3 | `by_module.total == approved + unapproved` | same derivation rule |
| 4 | Stable ordering | `module_code ASC` tiebreaker (see §5) |
| 5 | Starved modules deduplicated | `GROUP BY Module.code` — `modules` holds one row per enrolment |
| 6 | Read-only | no writes; asserted by test |

---

## §5. Two non-obvious traps handled

### 5.1 Route declaration order (spec §9 flagged this)

`/materials/coverage` is declared **above** `/materials/{material_id}`.

FastAPI matches in declaration order. Had it been appended at the end, the dynamic route
would capture `material_id="coverage"` and return **422 "value is not a valid uuid"** — an
error that looks like bad client input but is really a misplaced route.

**Verified:** `admin.py` route order is line 95 (`/coverage`) before line 121
(`/{material_id}`), and `test_coverage_route_is_not_shadowed_by_the_dynamic_route`
asserts a `200` with a `summary` key.

### 5.2 Unstable sort → silent pagination corruption

The spec's ordering is `total DESC, module_code ASC`. The `module_code ASC` tiebreaker is
**not cosmetic**. During live verification, three modules had identical totals:

```
by_module page: [('COS132', 14), ('COS212', 14), ('INF154', 14)]
```

Without the tiebreaker, Postgres is free to return these in any order per query, so a row
can be **skipped or repeated across pages** while every individual response looks correct.
The test `test_by_module_ordering_total_desc_then_code_asc` seeds a deliberate 2-2-1
distribution to pin this.

---

## §6. The index tests — the point of the day

Correctness does not depend on an index; **only performance does**. Without a dedicated
test, the migration could be absent, misnamed, or on the wrong columns and every other
test would still pass.

Two tests close that gap:

**`test_index_exists_with_the_expected_columns`** — queries `pg_index`/`pg_attribute` for
the real column order.

> **Caught during development:** the first version searched the index *definition string*
> for the first occurrence of `"url"`. It failed, because the index **name**
> (`ix_materials_module_url`) contains `url` at position 33 while the column is at 76.
> Reading `pg_index.indkey` is the correct approach; a substring search cannot distinguish
> a column from a name.

**`test_duplicate_check_uses_the_index`** — seeds **1,200 rows**, runs `ANALYZE`, then
`EXPLAIN` on `WHERE module_code = ? AND url = ?`, asserting `ix_materials_module_url`
appears in the plan.

> Deliberately **does not** use `SET enable_seqscan = off`. Forcing the planner would
> prove nothing about real behaviour. `ANALYZE` is run because without current statistics
> the planner's choice on a small table is guesswork and the test would be flaky.

**These tests were verified to fail when the index is dropped** (both reported `FAILED`),
then restored via `alembic` — so they are not passing by luck.

---

## §7. Acceptance criteria — spec §7

| # | Criterion | Status |
|---|---|---|
| 1 | Migration applies forward, downgrade reverses, head = revision | ✅ `0011` both ways |
| 2 | Requires ADMIN/SUPERUSER → 403/401 | ✅ 3 tests |
| 3 | `summary.total_materials` equals row count | ✅ |
| 4 | `approved + unapproved == total_materials` | ✅ |
| 5 | `modules_with_materials` equals distinct count | ✅ |
| 6 | `starved_modules == starved_total` | ✅ |
| 7 | `by_module` sorted total DESC, code ASC | ✅ |
| 8 | `by_module` respects page/size; `by_module_total` full count | ✅ |
| 9 | `starved` lists only zero-material modules | ✅ |
| 10 | Empty dataset → zeros, empty lists | ✅ |
| 11 | `size=999` → 422 | ✅ |
| 12 | `EXPLAIN` uses `ix_materials_module_url` | ✅ |
| 13 | `docs/openapi.json` regenerated; drift gate `[PASS]` | ✅ 41 routes |
| 14 | ~10 tests pass; full suite no regressions | ✅ **18 new, 422 total** |
| 15 | `ruff check` clean | ✅ on all touched files |
| 16 | No new packages | ✅ |

---

## §8. Live verification (against the running app)

```
GET /api/v1/admin/materials/coverage?page=1&size=3

summary: {'total_materials': 116, 'approved': 116, 'unapproved': 0,
          'modules_with_materials': 11, 'starved_modules': 0}
invariants: approved+unapproved==total  |  starved==starved_total
by_module page: [('COS132', 14), ('COS212', 14), ('INF154', 14)]
totals: by_module=11  starved=0
```

Both invariants hold on real data, ordering is correct, and `starved=0` correctly reflects
that every enrolled module currently has content.

---

## §9. Issues encountered and resolved

| # | Issue | Resolution |
|---|---|---|
| 1 | Spec names `0010`, which was already taken | Shipped as `0011`; documented in-file (§2) |
| 2 | Index test failed on a substring match | Read `pg_index.indkey` instead of the definition string (§6) |
| 3 | `func.case()` used in the spec | Used canonical SQLAlchemy 2.0 `case()` |
| 4 | Contract export wrote progress lines into `docs/openapi.json` | The exporter writes the file itself; removed the stdout redirect |
| 5 | Test DB left with `alembic_version=0011` but no index (my manual drop) | Re-stamped to `0010`, re-ran the migration |

**Issue 4 is a process hazard worth flagging:** `scripts/export_openapi.py` prints its
summary to **stdout**, so redirecting stdout into the file corrupts it. It must be run
**without** a redirect. The spec's §8 verification block (`... > docs/openapi.json`) would
produce a corrupt file if followed literally.

---

## §10. Sign-off checklist — spec §10

- [x] Migration created; forward + downgrade clean; head correct (`0011`)
- [x] Index `ix_materials_module_url` present (and on the model)
- [x] Four coverage schemas added
- [x] `get_materials_coverage` in `material_service.py`
- [x] `GET /admin/materials/coverage` added and role-gated
- [x] Route declared above `/materials/{material_id}`
- [x] `by_module` sorted total DESC, code ASC
- [x] `starved` uses `GROUP BY Module.code`
- [x] `summary.starved_modules == starved_total`
- [x] `size` bounded ≤ 100
- [x] `EXPLAIN` test passes with seeded rows
- [x] `docs/openapi.json` regenerated; drift gate `[PASS]`
- [x] Tests pass; full suite no regressions
- [x] `ruff check` clean on touched files
- [x] No new packages
- [x] Branch: committed on `demo`

### Optional bundles (spec §11) — both implemented
- [x] **§11.1** index asserted directly against `pg_indexes`/`pg_index`
- [x] **§11.2** INFO log: `coverage.read page=%d size=%d by_module=%d starved=%d`

---

## §11. Deferred (as specified)

Caching, CSV export, historical snapshots — explicitly out of scope for Day 3.

---

## §12. Outstanding

### 12.1 The mobile question — needs a decision, not code

The founder's request was to *"start building the real mobile software for the MVP"*,
directed at this Day 3 spec. **Day 3 is backend analytics; it contains no mobile work.**

The full project plan describes the product as **"mobile-first"**, but that phrase
describes the *design philosophy* (low-data, offline-friendly) rather than a native-app
deliverable. **No mobile scope document exists anywhere in `plan/`.**

I implemented the Day 3 spec as written rather than inventing mobile requirements. Before
any mobile work begins, the architect should produce a mobile scope covering:
platform (React Native / Flutter / PWA), offline strategy, and which features ship in v1.

> **Recommendation:** for a Sunday pitch, a **PWA** of the existing app (installable,
> offline-cached, full-screen) delivers the mobile experience with **no second codebase**
> and no new frameworks. A native app is a post-funding decision.

### 12.2 Six commits are unpushed

GitHub rejects the push — the fine-grained token lacks access to
`X404V2000/university_helper`:

```
remote: Write access to repository not granted.  (403)
```

**Action (founder):** GitHub → Settings → Developer settings → Fine-grained tokens → add
`university_helper` under Repository access → set **Contents: Read and write** → Save.

Unpushed: `51f3e1d`, `ba34143`, `076d43f`, `5ada2df`, `435ce55`, `30a5bc5`.

### 12.3 Demo-tunnel fragility (carried forward)

Quick tunnels have no uptime guarantee. During this session the tunnels died **five**
times, once because the host laptop's **phone-hotspot DNS** failed
(`dial tcp: lookup api.trycloudflare.com on [::1]:53: connection refused`). A
domain + named tunnel (~R200/year) removes this class of failure entirely.

---

## §13. Verification commands

```bash
# Migration
venv/bin/alembic upgrade head      # 0011
venv/bin/alembic current           # 0011 (head)
venv/bin/alembic downgrade -1      # reverses
venv/bin/alembic upgrade head

# Index present
docker exec vc_demo_pg psql -U app_user -d varsity_companion_dev \
  -c "\d study_materials" | grep ix_materials_module_url

# Lint + tests
venv/bin/ruff check app/ tests/ scripts/
TEST_DATABASE_URL="postgresql+psycopg://app_user:app_password@127.0.0.1:5544/varsity_companion_test" \
  venv/bin/pytest tests/test_materials_coverage_api.py -v     # 18 passed
TEST_DATABASE_URL="..." venv/bin/pytest tests/ --no-cov -p no:cacheprovider   # 422 passed

# Drift gate — NOTE: no stdout redirect, the script writes the file itself
venv/bin/python scripts/export_openapi.py
venv/bin/python scripts/check_contract_drift.py    # [PASS]
```

---

**Day 3 status: complete.** 16/16 acceptance criteria met, 18 new tests, full suite green
at 422, contract in sync, and the web app undisturbed.
