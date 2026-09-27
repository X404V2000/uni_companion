# Month 2, Week 2, Day 4 — Sharing Signals & Friction Instrumentation

**Project:** Varsity Companion API
**Date:** 15 September 2026
**Branch:** `month2/week2-day4-signals` (off `develop`)
**Status:** ✅ Complete — organic sharing + latency now observable

---

## 1. Objective

Make two more of the MVP's numeric success criteria measurable: **organic
sharing** (criterion #5) and **core-loop friction** (criterion #1 — the
high-frequency pain). Pure observation — no new features, no referral rewards.

---

## 2. Deliverables

| File | Action | Notes |
| :--- | :--- | :--- |
| `app/core/event_types.py` | **NEW** | Single source of truth (`EventType` enum) — 11.1 bundled |
| `app/models/analytics.py` | **UPDATED** | `UsageEvent.duration_ms` (nullable, no default) |
| `alembic/versions/0008_...py` | **NEW** | Forward-only `duration_ms` column |
| `app/schemas/analytics.py` | **UPDATED** | `ShareEventRequest` + extended `MetricsResponse` |
| `app/schemas/sync.py` | **UPDATED** | optional `client_duration_ms` |
| `app/services/analytics_service.py` | **UPDATED** | `record_share`, `record_duration`, shares/conversion/percentiles + conventions docstring (11.2) |
| `app/api/v1/analytics.py` | **UPDATED** | `POST /analytics/share` (204) |
| `app/api/v1/ai.py` | **UPDATED** | `summarize_duration` via `perf_counter` (server-measured) |
| `app/api/v1/sync.py` | **UPDATED** | records `sync_push_duration` when client sends it |
| `app/core/config.py` + `.env.example` | **UPDATED** | `share_link_base_url` (documented only) |
| `docs/API_CONTRACT_V1.md` | **UPDATED** | §8 Deep-Link contract |
| `docs/openapi.json` | **REGENERATED** | 26 routes; drift gate `[PASS]` |
| `tests/test_analytics_share.py` | **NEW** | 7 tests |
| `tests/test_analytics_duration.py` | **NEW** | 7 tests (incl. guard test — 11.3) |

---

## 3. Bundled best practices (per your architect's decision)

| Item | Delivered |
| :--- | :--- |
| 11.1 — `EVENT_TYPES` enum | ✅ `app/core/event_types.py` (uppercase, matches Day 3 data) |
| 11.2 — conventions docstring | ✅ percentile convention, window inclusivity, units, rate convention |
| 11.3 — guard test | ✅ `test_event_types_enum_is_single_source_of_truth` |
| 11.4 / 11.5 | ❌ Deferred (ergonomics only; adopt when real traffic exists) |

**Important correctness catch:** I kept event-type casing **UPPERCASE** to match
Day 3's already-persisted rows. The architect's lowercase examples in the prose
would have silently orphaned every Day 3 event from metrics.

---

## 4. Signals now emitted

| Signal | How |
| :--- | :--- |
| Share count | `POST /analytics/share` → `MODULE_SHARE` |
| Conversion proxy | signup creating a module within 7 days of a share on the same module (sharer excluded) |
| Summarize latency | server `perf_counter` (request→response; recorded even on error) |
| Sync latency | client-reported `client_duration_ms` in push body |

Percentiles: **nearest-rank, rounded index** (locked by hand-computed test).

---

## 5. Acceptance criteria vs. implementation

| # | Criterion | Result |
| :--- | :--- | :--- |
| 1 | share requires auth | ✅ 401 |
| 2 | 204 valid / 422 invalid module_code | ✅ |
| 3 | module_code upper-normalized | ✅ `test_share_normalizes_lowercase` |
| 4 | summarize records duration | ✅ (perf_counter, `finally`) |
| 5 | sync accepts optional client_duration_ms | ✅ schema-bounded + conditional record |
| 6 | out-of-bounds durations dropped | ✅ (negative / >600k) |
| 7 | metrics extended (shares, conversion, 4 percentiles) | ✅ |
| 8 | percentiles hand-computed; None when empty | ✅ |
| 9 | conversion 0.0 when no shares, else [0,1] | ✅ |
| 10-15 | openapi regen + drift + migration 0008 + ruff + no packages | ✅ all verified |

---

## 6. Verification

| Check | Result |
| :--- | :--- |
| `ruff check app/ tests/ scripts/` | **All checks passed** |
| `test_analytics_share.py` + `test_analytics_duration.py` | **14 passed** |
| Full analytics suite (Day 3 + Day 4) | **22 passed** |
| Drift gate | `[PASS]` (26 routes) |
| Alembic head | `0008` |
| New packages | **none** |

---

## 7. Next

Day 5 = Week 2 coherence review (no new features): merge-readiness + close-out.
