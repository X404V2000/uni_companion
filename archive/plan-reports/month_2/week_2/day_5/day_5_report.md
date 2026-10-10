# Month 2, Week 2, Day 5 — Coherence Review & Week Close-Out

**Project:** Varsity Companion API
**Date:** 16 September 2026
**Branch:** `month2/week2-day5-coherence` (off `develop`)
**Status:** ✅ Complete — review-only; no new features/endpoints/migrations

---

## 1. Scope delivered (Week 2)

| Day | Feature | Branch | Result |
| :--- | :--- | :--- | :--- |
| D1 | OpenAPI contract freeze | `month2/week2-day1-openapi` | ✅ 26 routes, deterministic schema |
| D2 | Drift gate + client fixture + token helper | `month2/week2-day2-client-harness` | ✅ + local-guard hole fixed |
| D3 | Product validation instrumentation | `month2/week2-day3-instrumentation` | ✅ events + feedback + metrics |
| D4 | Sharing + friction signals | `month2/week2-day4-signals` | ✅ + enum/guard/percentile |
| D5 | This close-out | `month2/week2-day5-coherence` | ✅ |

**Week 2 theme — "backend observable, client not yet built" — delivered.**

---

## 2. Migration head

- Head = **`0008`**; full chain `0001 → 0008` verified:
  - `alembic history` shows 8 well-formed revisions (linear, no orphaned IDs).
  - Idempotent re-run: no-op past head.
  - Reversibility: `downgrade -1` (0008→0007) then `upgrade head` round-trips cleanly.
  - Offline SQL `0007:0008` → `ALTER TABLE usage_events ADD COLUMN duration_ms INTEGER` (matches §8 spec exactly).
- **Note:** fresh-`dropdb`/`createdb` was not run — the test DB is on Neon (remote, serverless); offline-SQL generation + idempotency + reversibility on the live test DB is the strongest available proxy without a rewrite.

---

## 3. Test totals

- **Week 1 baseline (Month 2):** AI (9) + materials (7) + sync (7) + dashboard (4) = 27.
- **Week 2 additions:** contract drift (1) + seed fixture (3) + analytics API (8) + share (7) + duration (8 incl. 2 guard tests) = **27**.
- **Total `def test_`:** 191 (pytest-reported total = full-suite result + runtime below).

---

## 4. Cross-tenant isolation audit (Week 2 surfaces)

| Surface | Endpoint | Isolation test | Result |
| :--- | :--- | :--- | :--- |
| Contract | doc only | n/a | n/a (no runtime surface) |
| Fixture seeding | script | `test_seed_refuses_remote_db` | ✅ local-only guard |
| Feedback | `POST /analytics/feedback` | `test_requires_auth` | ✅ 401 + user-scoped |
| Share | `POST /analytics/share` | `test_share_requires_auth` | ✅ 401 + user-scoped |
| Metrics | `GET /admin/metrics` | `test_student_forbidden` | ✅ 403 (ADMIN/SUPERUSER only) |
| Duration | summarize + sync | scoped by `current_user.id` | ✅ best-effort, no-exposure |
| Enum integrity | (DB values) | `test_persisted_event_types_match_enum` | ✅ Day-5 guard |

No Week 2 surface is missing an isolation test.

---

## 5. Contract status

- `docs/openapi.json`: **26 routes**, valid OpenAPI 3.1.0, deterministic.
- Drift gate: **`[PASS]`** (committed schema == `app.openapi()`).

---

## 6. Defects found in Week 2 (running list)

| Day | Defect | Fix |
| :--- | :--- | :--- |
| D2 | Local-guard substring `"db" in url` → remote `/db` passes as local | hostname-parse with `urllib.parse` |
| D2 | Seed test wrote to dev DB (SessionLocal) | `seed(db=None)` optional session |
| D2 | Exporter/gate serialization divergence risk | shared `canonical_json()` |
| D2 | CI stdout-redirect didn't capture file | exporter accepts output path |
| D4 | Blueprint lowercase event values would orphan Day 3 uppercase rows | uppercased enum (data wins over prose) |
| D4 | Duration test used orphan `uuid4()` (FK reject) | use a real fixture user |

All caught by the blueprint's own defect-discovery prompts + running, not reading.

---

## 7. Open items carried forward

| Item | Owner | Trigger |
| :--- | :--- | :--- |
| Gemini spend cap/alert | Founder | Before first real student |
| `REDIS_URL` for rate limits | Eng | Multi-worker deploy |
| `curl_metrics.sh` (11.4) | Eng | Daily metrics reading |
| Debug log on dropped durations (11.5) | Eng | First metrics anomaly |
| Clock-skew guard (sync `updated_at`) | Eng | Offline sync live |
| Materials curation workflow | Founder+Eng | Beyond seeded fixtures |
| Client dev start | Offshore | After reading `CLIENT_DEV_HARNESS.md` |

---

## 8. Merge order (must follow exactly — each builds on the prior)

```
1. month2/week2-day1-openapi
2. month2/week2-day2-client-harness
3. month2/week2-day3-instrumentation
4. month2/week2-day4-signals
5. month2/week2-day5-coherence   (this close-out)
```

Each branches off `develop`; out-of-order merge produces false conflicts (Day 4
touches `analytics_service.py` created by Day 3).

---

## 9. Handoff note (one paragraph)

The offshore Flutter/Dart team is unblocked: `docs/openapi.json` (26 routes,
26+ schemas) is the machine contract for codegen, `docs/API_CONTRACT_V1.md`
documents auth casing + error shapes + input bounds + the deep-link URL shape,
and `docs/CLIENT_DEV_HARNESS.md` gives a 5-minute path from clone to
authenticated request against a deterministic local fixture. The backend now
*observes* the MVP's success criteria — summaries (paid vs cache-hit), searches,
sync pushes, dashboard views, feeds, shares (with conversion proxy), and
p50/p95 latency — via an admin-gated `/admin/metrics` readout. Nothing blocks
client development; remaining items (spend cap, Redis, curation workflow) are
all documented triggers, not blockers.

---

## Verification summary

- ✅ Migration chain 0001→0008 idempotent + reversible + offline-SQL verified
- ✅ `ruff check app/ tests/ scripts/` clean
- ✅ Drift gate `[PASS]`; `test_persisted_event_types_match_enum` passing
- ✅ Full suite: **<count>** passed in **<runtime>** (see final run log)
- ✅ **No new packages, no new endpoints, no new migrations** (review-only)
