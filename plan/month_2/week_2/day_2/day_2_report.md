# Month 2, Week 2, Day 2 — Client Integration Harness & Contract Drift Gate

**Project:** Varsity Companion API
**Date:** 15 September 2026
**Branch:** `month2/week2-day2-client-harness` (off `develop`)
**Status:** ✅ Complete — origin team can develop offline against deterministic state

---

## 1. Objective

Give the offshore Flutter/Dart team more than a static OpenAPI file: a way to
**prove** the frozen contract matches the running API (drift gate), plus a
deterministic, local-only fixture + token helper so they can hit any endpoint
in ~5 minutes without touching production Neon.

---

## 2. Deliverables

| File | Action | Notes |
| :--- | :--- | :--- |
| `scripts/_openapi_utils.py` | **NEW** | Single canonicalizer (exporter + gate share it) |
| `scripts/check_contract_drift.py` | **NEW** | Drift gate (exit 1 on divergence, truncated diff) |
| `scripts/seed_client_fixture.py` | **NEW** | Deterministic, idempotent, local-only fixture |
| `scripts/print_client_tokens.py` | **NEW** | curl-ready cookie + bearer for fixture user |
| `.github/workflows/ci.yml` | **UPDATED** | Drift-gate step + `scripts/` ruff check |
| `tests/test_contract_drift.py` | **NEW** | Locks committed schema to live app |
| `tests/test_seed_fixture.py` | **NEW** | Idempotency + local-guard proofs |
| `docs/CLIENT_DEV_HARNESS.md` | **NEW** | 5-minute onboarding guide |

---

## 3. Defects found & fixed during implementation (Section 9 paid off)

1. **Local-guard substring bug (real safety hole):** the blueprint's
   `any(h in url for h in ("localhost","127.0.0.1","db"))` matches the literal
   `"db"` — so ANY remote URL ending in `/db` (database named "db") would pass
   as "local" and the fixture would wipe a remote DB. Fixed by **parsing the
   URL hostname** with `urllib.parse` and comparing the actual host, not a
   substring.

2. **Session scope bug:** `seed()` originally always used `SessionLocal` (dev
   DB), so the idempotency test would have written to the dev database instead
   of the test engine. Fixed by making `seed(db=None)` accept an optional
   session — CLI uses dev DB; tests pass their test-engine session.

3. **Exporter/gate divergence risk (blueprint §9 #1):** both scripts now call
   a shared `canonical_json()` so they can never serialize differently and
   silently mask drift.

4. **CI step stdout-redirect bug:** the blueprint's `export_openapi.py >
   /tmp/fresh.json` would not capture anything (the exporter writes a file, not
   stdout). Fixed: exporter accepts an output-path arg; CI passes it directly.

---

## 4. Acceptance criteria vs. implementation

| # | Criterion | Result |
| :--- | :--- | :--- |
| 1 | Drift gate wired + exits 1 on rename | ✅ `check_contract_drift.py` + `test_contract_drift.py` |
| 2 | Fixture idempotent | ✅ `test_seed_is_idempotent` |
| 3 | Fixture local-guarded | ✅ `test_seed_refuses_remote_db` (+ hostname-parse fix) |
| 4 | Token script end-to-end | ✅ code path verified (live curl requires local server) |
| 5 | Client guide complete | ✅ `docs/CLIENT_DEV_HARNESS.md` |
| 6 | Contract test passes | ✅ 4/4 new tests |
| 7 | No regressions; Alembic head 0006 | ✅ no migration; ruff clean |

---

## 5. Verification

| Check | Result |
| :--- | :--- |
| `ruff check app/ tests/ scripts/` | **All checks passed** |
| `tests/test_contract_drift.py` + `tests/test_seed_fixture.py` | **4 passed** |
| `python scripts/check_contract_drift.py` | **`[PASS]` in sync** |
| Alembic head | unchanged `0006` |
| New packages | **none** |

---

## 6. Next (Week 2, Day 3)

Per the Section 12 note: the remaining Week 2 possibilities are mock-server /
Dart parity / Postman — all currently deferred as speculative. Await architect
Day 3 direction.
