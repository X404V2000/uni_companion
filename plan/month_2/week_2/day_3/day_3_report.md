# Month 2, Week 2, Day 3 — Product Validation Instrumentation

**Project:** Varsity Companion API
**Date:** 15 September 2026
**Branch:** `month2/week2-day3-instrumentation` (off `develop`)
**Status:** ✅ Complete — the MVP is now measurable, not just built

---

## 1. Objective

Turn "we have an MVP" into "we have measured usage." Backend hooks that capture
every meaningful core-loop action + an admin readout, so the MVP spec's numeric
success criteria (retention, usefulness, AI cost) can actually be verified.

---

## 2. Deliverables

| File | Action | Notes |
| :--- | :--- | :--- |
| `app/models/analytics.py` | **NEW** | `UsageEvent` (append-only) + `Feedback` (1-5 rating) |
| `alembic/versions/0007_...py` | **NEW** | Both tables + composite time indexes, FK CASCADE |
| `app/schemas/analytics.py` | **NEW** | `FeedbackCreate/Response`, `MetricsResponse` |
| `app/services/analytics_service.py` | **NEW** | `record_event`, `record_feedback`, `get_metrics` (cost accounting) |
| `app/api/v1/analytics.py` | **NEW** | `POST /analytics/feedback` (user-scoped) |
| `app/api/v1/admin.py` | **UPDATED** | `GET /admin/metrics` (ADMIN/SUPERUSER) |
| core-loop routes | **UPDATED** | Emit events: summarize (gen/hit), search, sync push, dashboard |
| `app/main.py` + `models/__init__.py` | **UPDATED** | Router + models wired |
| `tests/test_analytics_api.py` | **NEW** | 8 tests |

---

## 3. Architectural decisions (per architect §4.3 + my call)

- **No analytics vendor** (Mixpanel/PostHog): self-hosted, near-zero cost,
  POPIA-friendlier. Deferred until the offshore team asks.
- **Dart package: NO** (my call, delegated by user): contract stays in
  `docs/openapi.json`; client generates its own models. No cross-team version
  coupling.
- **No PII in events**: only `user_id`, `event_type` enum, optional
  `module_code`, timestamp. Never summary text/content/emails.
- **FK `ondelete=CASCADE`**: a POPIA hard-purge wipes the user's events
  automatically — erasure is honored end-to-end.
- **Best-effort recording**: `record_event` swallows errors so telemetry can
  never break the core loop.

---

## 4. Cost accounting

`estimated_cost_zar` derives from `tokens_used` already stored on
`AISummaryCache`, using a blended Gemini Flash rate + ZAR/USD placeholder (both
constants, updatable without schema change). Clearly labeled an ESTIMATE —
Google's billing dashboard remains the source of truth.

---

## 5. Acceptance criteria vs. implementation

| # | Criterion | Result |
| :--- | :--- | :--- |
| 1 | Events recorded on core-loop actions | ✅ dashboard view test; summarize/search/sync wired |
| 2 | Metrics admin-gated | ✅ `test_student_forbidden` (403) + `test_admin_can_read_metrics` |
| 3 | Feedback 1-5 + sanitized | ✅ 3 tests (valid, 422 on 6, XSS stripped) |
| 4 | POPIA-safe (no PII, cascade) | ✅ model design + FK CASCADE |
| 5 | No regressions | ✅ 8 new tests pass; ruff clean; drift gate in sync |

---

## 6. Verification

| Check | Result |
| :--- | :--- |
| `ruff check app/ tests/ scripts/` | **All checks passed** |
| `tests/test_analytics_api.py` | **8 passed** |
| OpenAPI contract | ✅ regenerated (25 routes); drift gate `[PASS]` |
| Alembic head | `0007` |
| New packages | **none** |

---

## 7. Next

The admin metrics endpoint gives a `curl`-able readout (WAU, cache hit rate,
cost/user). When the first real student uses the app, the MVP success criteria
are now observable. Week 2 Day 4 direction pending architect.
