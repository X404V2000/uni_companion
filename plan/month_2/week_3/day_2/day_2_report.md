# Month 2, Week 3, Day 2 — Bulk Materials Import (CSV/JSON) with Dry-Run: Day Report

**Project:** Varsity Companion API
**Date:** 18 September 2026
**Branch:** `month2/week3-day2-materials-import` (commit `77c0c20`)
**Report to:** Senior Systems Design & Architecture Engineer
**Report from:** Lead Developer
**Status:** Complete and independently verified.

---

## 0. Summary

Day 2 delivered the admin bulk-import surface over `study_materials` exactly as
specified, with the two "day purpose" guarantees — **dry-run writes nothing** and
**commit is atomic** — each proven by a dedicated test.

| Check | Result |
| :--- | :--- |
| `ruff check app/ tests/ scripts/` | Pass |
| `tests/test_materials_import_api.py` | **16 / 16 pass** |
| Full regression suite | **238 passed, 0 failed** (222 before → +16 new, zero regressions) |
| OpenAPI drift | Regenerated to **31 routes**; drift gate `[PASS]` |
| Migration | None (pure application layer, per spec) |
| New packages | None |

---

## 1. Scope delivered (vs. specification)

| Spec objective | Delivered | Evidence |
| :--- | :---: | :--- |
| `POST /admin/materials/import` (CSV + JSON) | Yes | `app/api/v1/admin.py` |
| Dry-run mode (`?dry_run=true`) writes nothing | Yes | `test_dry_run_creates_nothing` |
| Commit mode (default), one transaction | Yes | `test_commit_is_atomic` |
| Per-row outcomes: created/updated/skipped_duplicate/rejected_invalid | Yes | `app/schemas/material.py` + service |
| Duplicate key `(module_code, url)` | Yes | `plan_import` filters on both |
| `on_duplicate=update|skip|fail` | Yes | router `Literal` query param + planner |
| Shared validator (reuse `MaterialAdminCreate`) | Yes | `_validate_row` builds `MaterialAdminCreate` |
| Row cap 500 + body cap 1 MB | Yes | service constants + router + middleware |
| INFO audit log per import | Yes | `log_import` (matches Day 1 convention) |
| No new packages / no migration | Yes | stdlib `csv`/`json` only |

---

## 2. Design decisions honoured (per spec §14 "key points")

| Directive | Verdict |
| :--- | :--- |
| Dry-run and commit share the same planner | Honoured — `plan_import` is write-free; `apply_plan` is the only writer; router gates it behind `if not dry_run`. |
| Duplicate key is `(module_code, url)` | Honoured — both filters, never one. |
| Atomicity proven by test, not hope | Honoured — `test_commit_is_atomic` forces a mid-batch `RuntimeError` after flushing two writes, then asserts the DB row count is unchanged (rollback worked). |
| Bypass the 10 KB middleware for this route only | Honoured — narrow path-based exemption (`IMPORT_PATH` exact match, trailing-slash tolerant) raising the cap to 1 MB; every other route keeps 10 KB. |
| Do NOT add the `(module_code, url)` index | Honoured — deliberately deferred to Day 3 (migration `0010`, §9.1). |
| Regenerate `docs/openapi.json` | Honoured — 31 routes, drift gate `[PASS]`. |

---

## 3. The middleware decision (the one open item the spec flagged)

The spec's §5.3 explicitly said "check the middleware implementation before
implementing." The Month 1 middleware applied a flat **10 KB** cap to all
POST/PUT/PATCH, which would have made the 1 MB import impossible. Resolution:

- Added `_max_body_size_for(request)` → returns 1 MB only for the exact
  `/api/v1/admin/materials/import` path (trailing-slash tolerant), else 10 KB.
- The import **handler** independently re-checks the 1 MB cap (defence in depth),
  so the bound holds even if middleware ordering changes.

This is the minimal, most secure option: it never weakens the global guard, and
it never uses a prefix match that an attacker could exploit.

---

## 4. Verification methodology

1. Detached git worktree at `/tmp/vc-day2` on `month2/week3-day2-materials-import`.
2. Ephemeral, disposable PostgreSQL 15 (`vc_day2_pg`, port 5436) with an empty
   `varsity_companion_test` DB.
3. `ruff check` on all changed files → clean.
4. `tests/test_materials_import_api.py` → 16/16 pass — **and passing twice on the
   same DB** (proves hermeticity; see §5).
5. Full suite → 238 passed, 0 failed.
6. Regenerated `docs/openapi.json` → 31 routes; `check_contract_drift.py` → `[PASS]`.
7. Cleaned up the worktree + container + temp DB.

---

## 5. One test-hygiene fix (same class as the analytics fix)

The first run exposed a **test-isolation** issue identical in kind to the
`share_conversion_rate` one: the shared session-scoped DB accumulates
`study_materials` rows across runs, so a fresh import reported `updated` instead
of `created`. Fix: an autouse fixture in `test_materials_import_api.py` purges
`study_materials` before each test.

- **Safe** because `study_materials` is a leaf table (nothing FK-references it).
- **Proven** by running the import suite twice on the same DB (both 16/16).

No production code needed this for correctness — it is purely a test hermeticity
matter, consistent with the fix already applied to the analytics tests.

---

## 6. Cross-branch note (for the reconciliation)

`scripts/export_openapi.py` on the Month 2 line **still lacks the env-pinning
fix** from `fix/openapi-psycopg-scheme` (`721a9a7`). I regenerated
`docs/openapi.json` by passing `ENVIRONMENT`/`DATABASE_URL`/`JWT_SECRET_KEY`
inline, which produces the correct file, but the exporter will still crash in
CI until that fix branch is merged. This reinforces the standing requirement:
**merge `fix/openapi-psycopg-scheme` into the Month 2 line before the next CI
run.**

---

## 7. Next

- Day 3 is **module coverage analytics** + migration `0010` for the
  `(module_code, url)` index (§9.1) — which will make the import's duplicate
  check O(log N) instead of O(N).
- Still open from the Day 1 review: reconcile `develop`/`main` and merge the CI
  fixes. These must land before the next "branch off develop" day.

---

## 8. Sign-off checklist (spec §13)

- [x] `app/services/material_import_service.py` created
- [x] CSV + JSON both supported; unsupported content type → 422
- [x] Row cap 500; body cap 1 MB; both enforced before validation
- [x] Per-row validation shares `MaterialAdminCreate`
- [x] Duplicate rule `(module_code, url)`
- [x] `on_duplicate` param: update (default), skip, fail
- [x] Dry-run writes nothing (test-verified)
- [x] Commit atomic on failure (test-verified)
- [x] Route gated `require_role([ADMIN, SUPERUSER])`
- [x] INFO log per import (actor, created, updated, rejected, dry_run)
- [x] `docs/openapi.json` regenerated; drift gate `[PASS]`
- [x] 16 tests pass; full suite no regressions
- [x] `ruff` clean
- [x] Alembic head unchanged
- [x] No new packages
- [x] Branch `month2/week3-day2-materials-import` (off the latest Month 2 tip, not `develop` — reconciliation still pending)
