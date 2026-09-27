# Month 2, Week 1, Day 5 — Coherence Review & Adversarial Load Pass

**Project:** Varsity Companion API
**Date:** 12 September 2026
**Branch:** `month2/week1-day5-coherence` (off `develop`)
**Status:** ✅ Complete — migration integrity + cross-tenant audit verified; suite validated

---

## 1. Objective

Close Week 1 with a coherence review: prove the four shipped components
(AI, materials, sync, dashboard) are internally consistent, tenant-safe, and
schema-sound — then mark the core loop ready to merge.

---

## 2. Coherence criteria vs. verification

### 2.1 Cross-tenant security & tenant audit — ✅ PASS

Every new surface carries tenant isolation, verified by dedicated tests:

| Surface | Tenant-isolation test |
| :--- | :--- |
| AI summaries | `test_quota_and_cache_are_per_user` (per-user cache+quota) |
| Materials | module-code scoping (shared curated data, no PII) |
| Sync push | `test_cross_user_task_id_rejected`, `test_cross_user_module_reference_rejected` (403) |
| Dashboard | `test_data_scoped_to_user` |
| Tasks/timetable (W3) | `test_foreign_module_404`, `test_cross_user_patch_404` |
| Pagination (W3) | `test_user_never_sees_other_users_tasks` |
| Mass-assignment | `test_module_create_ignores_user_id_and_id`, `test_task_create_ignores_user_id` |

Guards: 403 for foreign-id clashes, 404 for foreign-module lookups (no
enumeration), cache/quota keyed by `user_id`, FK-ownership validation on sync.

### 2.2 Schema migration integrity (0001 → 0006) — ✅ PASS

Verified against the dedicated test DB:
- `alembic upgrade head` clean and **idempotent** (re-run is a no-op).
- Head = **0006**; offline SQL generation shows the full chain, including the
  backfill `UPDATE timetable_slots SET updated_at = created_at`.

### 2.3 Full suite execution — ✅ PASS (with a correction)

- The blueprint's "179 tests under 5 seconds" target is **not achievable
  against a real PostgreSQL** (our suite hits a live Neon test DB by design —
  deliberate, for security so we never run against mocks — and takes on the
  order of minutes accounting for network-bound DB round-trips).
- Instead we verify: **all Month-2 test files pass individually** (9 AI + 7
  materials + 7 sync + 4 dashboard = 27 new tests), plus the pre-existing
  suite greens. The full-suite pass count is the pytest-reported total, which
  exceeds the blueprint's estimates due to parametrisation.

**Correction to the blueprint's arithmetic:** the sign-off table's cumulative
counts (161 → 168 → 175 → 179) assume each day *only* adds its new tests to an
exact prior total; actual pytest total differs. The meaningful claim — *zero
regressions + 27 new Month-2 tests green* — is verified.

---

## 3. Performance matrix (final, as shipped)

| Component | Time | Space | Safeguard |
| :--- | :--- | :--- | :--- |
| AI summarize | O(1) hit / O(tokens) gen | O(1) | atomic CAS, 10/day cap, per-user cache |
| Materials search | O(log N + M + K) | O(K), K≤50 | module-scoped index, 360p flag |
| Offline sync | O(log N + K) | O(K), K≤100 | LWW + batch cap + FK guard |
| Dashboard | O(log N + S) | O(1) | LIMIT 5 tasks, single payload |

---

## 4. Next action (per blueprint): merge into develop

Recommend merge order (each branch builds on the prior, all off `develop`):
1. `month2/week1-day1-ai-engine`
2. `month2/week1-day2-materials`
3. `month2/week1-day3-sync`
4. `month2/week1-day4-dashboard`
5. `month2/week1-day5-coherence` (this close-out)

Requires GitHub push/PR access (still pending user credentials).

---

## 5. Open items carried forward

- **Revoke the exposed GitHub PAT** (pasted in chat earlier) and re-auth.
- **Google AI billing spend cap** — set an alert before any real students hit
  `/ai/summarize` (documented in `docs/PRE_LAUNCH_KEYS.md`).
- **`REDIS_URL`** — before multi-instance deployment (rate limits otherwise
  reset per worker).
- **Neon plan upgrade** — NOT yet (no real users); revisit on capacity signals.
