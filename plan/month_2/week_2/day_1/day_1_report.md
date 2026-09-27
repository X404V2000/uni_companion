# Month 2, Week 2, Day 1 — OpenAPI Contract Freeze & Offshore API Specification

**Project:** Varsity Companion API
**Date:** 15 September 2026
**Branch:** `month2/week2-day1-openapi` (off `develop`)
**Status:** ✅ Complete — static OpenAPI 3.1 contract frozen for client codegen

---

## 1. Objective

Before the offshore Flutter/Dart team writes client code, freeze the backend's
API contract as a machine-readable OpenAPI 3.1 schema + a human-readable
client guide, so the two teams build against one deterministic interface.

---

## 2. Deliverables

| File | Action | Notes |
| :--- | :--- | :--- |
| `scripts/export_openapi.py` | **NEW** | Deterministic, env-independent exporter |
| `docs/openapi.json` | **NEW** | Static OpenAPI 3.1 schema (committed) |
| `docs/API_CONTRACT_V1.md` | **NEW** | Human-readable client contract |
| `app/api/v1/auth.py` | **UPDATED** | Explicit `x-auth-mode` header parameter on login (documented in schema) |

---

## 3. What this provides the offshore team

- **Machine contract** (`docs/openapi.json`): 21 routes, 26 Pydantic schemas,
  valid OpenAPI 3.1.0 — feedable directly to Dart/Drift codegen.
- **Deterministic** (`sort_keys=True`): byte-identical re-runs, so diffs in
  review are meaningful and CI can detect drift later.
- **Explicit auth contract**: `x-auth-mode` is now a *declared* header
  parameter on login, with the strict case-sensitivity documented. Previously
  it only appeared in prose — codegen would not have emitted a typed field.

---

## 4. Corrections to the blueprint

1. **Route count is 21, not 15.** The blueprint's "15 active routes" is stale;
   the real surface is 21 (auth, admin, academic modules/tasks/timetable, AI,
   materials, sync, dashboard). The schema reflects the true inventory.
2. **The `SETUP_DAY1.md` in week_2/day_1 is a garbled re-export** of Month 1
   Week 1 (project foundation) — its line 11 is corrupted AI-export text. The
   authoritative Week 2 scope is `plan/month_2/week_2/week_2`. Implemented from
   that.

---

## 5. Acceptance criteria vs. implementation

| # | Criterion | Result |
| :--- | :--- | :--- |
| 1 | `python scripts/export_openapi.py` → valid parseable `docs/openapi.json` | ✅ (validated via json parse + `app.openapi()`) |
| 2 | All endpoints present | ✅ 21 routes / 23 operations documented |
| 3 | Flutter/Dart codegen parseable | ✅ valid OpenAPI 3.1; deterministic; typed auth header |
| 4 | Zero regressions | ✅ API-mode login tests pass; ruff clean |

---

## 6. Verification

| Check | Result |
| :--- | :--- |
| `ruff check` | **All checks passed** |
| Schema determinism (2 runs) | ✅ byte-identical |
| `x-auth-mode` documented | ✅ explicit header parameter + description |
| Login API-mode still works | ✅ 2/2 auth-flow tests pass |

No new packages or external keys.

---

## 7. Next

- Month 2, Week 2, Day 2 (per the `week_2` roadmap): continue the contract/
  mock-server parity work — the offshore team can now generate Dart models
  against `docs/openapi.json` + `docs/API_CONTRACT_V1.md`.
