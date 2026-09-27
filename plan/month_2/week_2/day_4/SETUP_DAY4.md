# Month 2, Week 2, Day 4 — Sharing Signals & Friction Instrumentation

**To:** Lead Developer
**From:** Senior Systems Design & Architecture Engineer
**Date:** 15 September 2026
**Status:** Day 3 Approved / Day 4 Specification Active

---

## 0. Ground Truth Confirmed

- `UsageEvent.module_code` is **already nullable** (`String(20)`, `nullable=True`) — from migration `0007`. No column addition needed for sharing.
- `share_conversion_rate` is **in scope** — "signup within 7 days on the same module" is the honest proxy for "did sharing work?"
- Dart package: **NO** (confirmed Day 3).
- New packages: **NONE** (this day adds zero dependencies).

---

## 1. Technical Objectives

1. **Observe organic sharing** — the MVP's fifth success criterion ("at least some organic sharing occurs") currently has no signal. Record share events and compute a conversion proxy.
2. **Observe core-loop friction** — catch regressions in the two highest-latency steps (summarize, sync push) via p50/p95, before students complain.
3. **Document the client deep-link contract** — the MVP spec's Should-Have #10 ("shareable link that pre-selects a module") needs a fixed URL shape so the offshore team builds to the same format.
4. **Extend the metrics readout** — one admin endpoint, richer signal, same auth shape.

Everything else is deferred. No referral rewards, no session replay, no funnel analysis. This day **adds observation**, not features.

---

## 2. Architectural Strategy

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        WHAT WE'RE OBSERVING                              │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  SHARING (criterion 5)                FRICTION (criterion 1)             │
│  ─────────────────────                ─────────────────────              │
│  • Client invokes native share         • summarize: server-measured      │
│  • Client POSTs /analytics/share         (request→response elapsed)      │
│  • Server records module_share event   • sync: client-reported           │
│  • Metrics derive:                        (client_duration_ms in body)   │
│      - shares_count                    • Metrics derive:                 │
│      - share_conversion_rate               - summarize_p50/p95           │
│        (signup in 7d on same module)       - sync_p50/p95                │
│                                                                          │
│  Both reuse: UsageEvent schema, (event_type, created_at) index,          │
│  CASCADE erasure, best-effort recording, no PII.                         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                    DATA FLOW — SHARE EVENT                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Student A taps "Share"  ──►  POST /analytics/share                      │
│         │                     { module_code: "INF154" }                  │
│         │                            │                                   │
│         │                            ▼                                   │
│         │                     record_event(user_id=A,                    │
│         │                                  event_type="module_share",    │
│         │                                  module_code="INF154")          │
│         │                                                                │
│         └──► OS share sheet ──► WhatsApp  ──►  Student B receives link   │
│                                                     │                    │
│                                                     ▼                    │
│                          Link opens app with module preselected          │
│                                                     │                    │
│                                                     ▼                    │
│                          Student B signs up ──► first module = INF154    │
│                                                     │                    │
│                                                     ▼                    │
│                          Within 7 days? → counts as CONVERSION           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                    DATA FLOW — DURATION EVENTS                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  summarize:                                                              │
│    t0 = now  ──►  [LLM or cache] ──►  t1 = now                           │
│    record_event(event_type="summarize_duration", duration_ms=t1-t0)      │
│                                                                          │
│  sync push:                                                              │
│    Client measures round-trip locally, sends client_duration_ms in body  │
│    Server records event with that value (no server-side timing)          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Design principle:** both signals ride on the existing `UsageEvent` table. No new tables, no new indexes (the existing `(event_type, created_at)` index from `0007` serves both), no new services — just new event types and one new endpoint.

---

## 3. File Implementation Map

| File Path | Action | Purpose |
|---|---|---|
| `app/models/analytics.py` | **UPDATED** | Add `duration_ms: Mapped[int \| None]` |
| `alembic/versions/0008_...py` | **NEW** | Add `usage_events.duration_ms INTEGER NULL` (forward-only, nullable) |
| `app/schemas/analytics.py` | **UPDATED** | `ShareEventRequest`; extend `MetricsResponse` |
| `app/schemas/sync.py` | **UPDATED** | Add optional `client_duration_ms: int \| None` to push schema |
| `app/services/analytics_service.py` | **UPDATED** | `record_share`, `record_duration`, extend `get_metrics` |
| `app/api/v1/analytics.py` | **UPDATED** | `POST /analytics/share` |
| `app/api/v1/ai.py` | **UPDATED** | Record `summarize_duration` after response |
| `app/api/v1/sync.py` | **UPDATED** | Pass `client_duration_ms` to service; record if present |
| `app/api/v1/admin.py` | *(no change)* | Reuses existing metrics endpoint |
| `docs/API_CONTRACT_V1.md` | **UPDATED** | Document deep-link URL shape |
| `docs/openapi.json` | **REGENERATED** | Drift gate will enforce this |
| `tests/test_analytics_share.py` | **NEW** | Share recording + conversion metrics |
| `tests/test_analytics_duration.py` | **NEW** | Duration event recording + p50/p95 |
| `.env.example` | **UPDATED** | Document `SHARE_LINK_BASE_URL` |
| `app/core/config.py` | **UPDATED** | Add `share_link_base_url: str = "https://varsitycompanion.co.za"` |

**No new packages.**

---

## 4. Step-by-Step Developer Guide

### Step 1: Extend the Model (`app/models/analytics.py`)

Add one nullable column to `UsageEvent`:

```python
duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

Rationale for a nullable, no-default column: existing rows have no duration; only duration-type events will populate it. Nullable is honest. No backfill.

### Step 2: Migration `0008`

Forward-only, single ALTER:

```python
def upgrade() -> None:
    op.add_column(
        "usage_events",
        sa.Column("duration_ms", sa.Integer(), nullable=True),
    )

def downgrade() -> None:
    op.drop_column("usage_events", "duration_ms")
```

No index needed: duration is only ever read for aggregate computation within a time window that already filters on `event_type` (indexed) and `created_at` (indexed via the `0007` composite).

### Step 3: Schemas (`app/schemas/analytics.py`)

Add:

```python
from pydantic import BaseModel, Field, field_validator
from app.core.sanitizer import sanitize_string

class ShareEventRequest(BaseModel):
    module_code: str = Field(..., min_length=2, max_length=20)

    @field_validator("module_code")
    @classmethod
    def normalize_module(cls, v: str) -> str:
        clean = sanitize_string(v)
        if not clean:
            raise ValueError("Invalid module code")
        return clean.upper()
```

Extend `MetricsResponse` with:

```python
shares_count: int
share_conversion_rate: float          # 0.0–1.0, rounded to 4dp
summarize_p50_ms: float | None
summarize_p95_ms: float | None
sync_push_p50_ms: float | None
sync_push_p95_ms: float | None
```

`None` when there are zero samples in the window — do not fake `0`, it lies.

### Step 4: Service Layer (`app/services/analytics_service.py`)

```python
SHARE_EVENT = "module_share"
SUMMARIZE_DURATION_EVENT = "summarize_duration"
SYNC_PUSH_DURATION_EVENT = "sync_push_duration"
SHARE_CONVERSION_WINDOW_DAYS = 7


def record_share(db: Session, user_id: uuid.UUID, module_code: str) -> None:
    record_event(db, user_id=user_id, event_type=SHARE_EVENT, module_code=module_code)


def record_duration(
    db: Session,
    user_id: uuid.UUID,
    event_type: str,
    duration_ms: int,
) -> None:
    # Bounded: reject negative or absurd values, silently drop.
    if duration_ms < 0 or duration_ms > 600_000:  # 10 min ceiling
        return
    record_event(
        db,
        user_id=user_id,
        event_type=event_type,
        duration_ms=duration_ms,
    )
```

**Why the ceiling:** a client bug that reports `duration_ms = 2_000_000_000` would corrupt p95 forever. Bound it, drop silently, log nothing (it's noise). 10 minutes is generous for any real core-loop action.

Extend `get_metrics`:

```python
def get_metrics(db: Session, since: datetime, until: datetime) -> dict:
    # ... existing WAU / cache hit rate / cost ...

    shares_count = (
        db.query(func.count(UsageEvent.id))
        .filter(
            UsageEvent.event_type == SHARE_EVENT,
            UsageEvent.created_at >= since,
            UsageEvent.created_at <= until,
        )
        .scalar()
        or 0
    )

    # Conversion: signups whose FIRST module matches a shared module,
    # within SHARE_CONVERSION_WINDOW_DAYS of the share event.
    #
    # "First module" = the module the signup selected. If the app only
    # supports one-module-per-signup at this stage, this is trivial. If
    # multi-module, take the signup's module created closest to signup time.
    #
    # Implementation note: run two indexed queries, intersect in Python —
    # this avoids a nested correlated subquery that Neon may plan poorly.
    share_events = (
        db.query(UsageEvent.module_code, UsageEvent.created_at)
        .filter(
            UsageEvent.event_type == SHARE_EVENT,
            UsageEvent.created_at >= since,
            UsageEvent.created_at <= until,
        )
        .all()
    )

    conversions = 0
    for shared_code, shared_at in share_events:
        window_end = shared_at + timedelta(days=SHARE_CONVERSION_WINDOW_DAYS)
        # Count signups whose earliest module creation falls in window
        # AND matches shared_code AND belongs to a different user.
        converted = (
            db.query(Module.user_id)
            .join(User, User.id == Module.user_id)
            .filter(
                Module.code == shared_code,
                Module.created_at > shared_at,
                Module.created_at <= window_end,
                Module.user_id != UsageEvent.user_id,  # placeholder; see note
            )
            .distinct()
            .count()
        )
        if converted:
            conversions += 1

    conversion_rate = round(conversions / shares_count, 4) if shares_count else 0.0

    # Percentiles
    summarize_durations = _durations_in_window(db, SUMMARIZE_DURATION_EVENT, since, until)
    sync_durations = _durations_in_window(db, SYNC_PUSH_DURATION_EVENT, since, until)

    def _pct(values: list[int], p: float) -> float | None:
        if not values:
            return None
        values = sorted(values)
        k = max(0, min(len(values) - 1, int(round(p * (len(values) - 1)))))
        return float(values[k])

    return {
        # ... existing fields ...
        "shares_count": shares_count,
        "share_conversion_rate": conversion_rate,
        "summarize_p50_ms": _pct(summarize_durations, 0.50),
        "summarize_p95_ms": _pct(summarize_durations, 0.95),
        "sync_push_p50_ms": _pct(sync_durations, 0.50),
        "sync_push_p95_ms": _pct(sync_durations, 0.95),
    }


def _durations_in_window(
    db: Session, event_type: str, since: datetime, until: datetime
) -> list[int]:
    rows = (
        db.query(UsageEvent.duration_ms)
        .filter(
            UsageEvent.event_type == event_type,
            UsageEvent.created_at >= since,
            UsageEvent.created_at <= until,
            UsageEvent.duration_ms.isnot(None),
        )
        .all()
    )
    return [r[0] for r in rows]
```

**Note on the placeholder user comparison:** the `share_events` query must also select `user_id` so the "different user" check works. Refine during implementation:

```python
share_events = (
    db.query(UsageEvent.user_id, UsageEvent.module_code, UsageEvent.created_at)
    .filter(...)
    .all()
)
```

Then use `module.user_id != sharer_id` in the inner query.

**The Python percentile over ≤10k rows/day is O(K log K) — fine.** Postgres `percentile_cont` would be O(K), but Neon's window-function planner is variable and the constant factor of a sorted Python list for a few thousand ints is nanoseconds. Choose the version you can reason about at 3am.

### Step 5: Endpoint (`app/api/v1/analytics.py`)

```python
@router.post("/share", status_code=status.HTTP_204_NO_CONTENT)
def record_share(
    payload: ShareEventRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Records a share event when the client invokes the OS share sheet for a
    module deep link. Best-effort: analytics failures never fail the request.
    """
    analytics_service.record_share(
        db=db,
        user_id=current_user.id,
        module_code=payload.module_code,
    )
    # 204 — no body, the client doesn't need anything back
```

**Why 204:** the client fired a signal and moved on. Returning anything is noise.

### Step 6: Instrument Summarize (`app/api/v1/ai.py`)

```python
import time

@router.post("/summarize", ...)
def request_ai_summary(...):
    t0 = time.perf_counter()
    try:
        result = ai_service.get_or_create_summary(...)
    finally:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        analytics_service.record_duration(
            db=db,
            user_id=current_user.id,
            event_type=analytics_service.SUMMARIZE_DURATION_EVENT,
            duration_ms=elapsed_ms,
        )
    return result
```

**Why `finally`:** record duration even on error — errors are part of the latency picture. The duration event type carries no success/failure flag; if you later want that, it's a separate `summarize_error` event.

`time.perf_counter()` is monotonic and appropriate for durations (unlike `time.time()`).

### Step 7: Instrument Sync Push (`app/schemas/sync.py` and `app/api/v1/sync.py`)

Schema:

```python
class SyncPushRequest(BaseModel):
    tasks: list[TaskSyncItem] = Field(default_factory=list, max_length=100)
    modules: list[ModuleSyncItem] = Field(default_factory=list, max_length=100)
    timetable_slots: list[TimetableSlotSyncItem] = Field(default_factory=list, max_length=100)
    client_duration_ms: int | None = Field(default=None, ge=0, le=600_000)
```

Router:

```python
@router.post("/push", ...)
def push_offline_changes(payload: SyncPushRequest, ...):
    result = sync_service.process_sync_push(...)
    if payload.client_duration_ms is not None:
        analytics_service.record_duration(
            db=db,
            user_id=current_user.id,
            event_type=analytics_service.SYNC_PUSH_DURATION_EVENT,
            duration_ms=payload.client_duration_ms,
        )
    return result
```

**Why client-reported:** the client knows the full round-trip (queue drain + upload + server processing + response). Server-side timing would miss the network and the offline queue work — which is precisely the friction we're trying to see.

### Step 8: Config (`app/core/config.py` and `.env.example`)

Add:

```python
share_link_base_url: str = "https://varsitycompanion.co.za"
```

This is **not used in the backend**. It is documented so the client team and the contract guide agree on the URL shape. The backend accepts `module_code` on share events but does not construct URLs.

### Step 9: Document the Deep-Link Shape (`docs/API_CONTRACT_V1.md`)

Add a section:

```markdown
## Deep-Link Contract (Client-Enforced)

When a student shares a module, the client generates a URL of the form:

    {share_link_base_url}/m/{module_code}

Examples:
    https://varsitycompanion.co.za/m/INF154
    https://varsitycompanion.co.za/m/COS132

Requirements:
- `module_code` MUST be uppercase (matches the server's normalization).
- Opening the link MUST preselect the module for a new or existing user.
- The link MUST resolve to the app (Universal Link / App Link on iOS/Android).
- The backend does NOT serve these URLs — they are a client/routing concern.
```

**Why document it here:** the contract guide is the single source of truth for the offshore team. If the deep-link shape lives only in someone's head, it drifts.

### Step 10: Tests

`tests/test_analytics_share.py`:
```python
def test_share_requires_auth(client): ...
def test_share_returns_204(client, auth_headers): ...
def test_share_rejects_invalid_module_code(client, auth_headers): ...  # 422
def test_share_normalizes_lowercase(client, auth_headers, db): ...
def test_share_records_event_with_module_code(db, ...): ...
def test_metrics_shares_count_reflects_events(db, ...): ...
def test_metrics_conversion_rate_counts_matching_signup(db, ...): ...
def test_metrics_conversion_rate_zero_when_no_shares(db, ...): ...
```

`tests/test_analytics_duration.py`:
```python
def test_summarize_records_duration_event(db, ...): ...
def test_sync_push_records_duration_when_present(db, ...): ...
def test_sync_push_omits_duration_when_absent(db, ...): ...
def test_duration_out_of_bounds_silently_dropped(db, ...): ...
def test_metrics_p50_p95_over_known_values(db, ...): ...
def test_metrics_p50_p95_none_when_no_samples(db, ...): ...
```

Assert p50/p95 against **hand-computed values** (e.g., durations `[100, 200, 300, 400]` → p50 = `300`, p95 = `400` with the simple index convention). This locks the percentile convention so it can't silently drift.

---

## 5. Time/Space Complexity Audit

| Component | Time | Space | Safeguard |
|---|---|---|---|
| `POST /analytics/share` | O(1) | O(1) | Single insert; no read |
| `record_duration` | O(1) | O(1) | Bounded insert; single row |
| `summarize` duration instrumentation | O(1) | O(1) | Two `perf_counter()` calls; negligible |
| `sync_push` duration instrumentation | O(1) | O(1) | Conditional insert; negligible |
| `get_metrics` — shares count | O(log N + K) | O(1) | Indexed on `(event_type, created_at)` |
| `get_metrics` — conversion | O(S · log N) | O(S) | S = shares in window; bounded by daily volume |
| `get_metrics` — percentiles | O(D log D) | O(D) | D = duration samples in window; bounded by daily volume |
| Migration `0008` | O(N) table scan | O(1) | Nullable, no default → Postgres optimizes to catalog-only in v15+ |

**Total per user action added:** two inserts at most. Negligible.

---

## 6. Security & Scale Guarantees

| Guarantee | Mechanism |
|---|---|
| No PII in events | Only `user_id`, `event_type`, `module_code`, `duration_ms` — no content, no emails, no recipient identity |
| POPIA erasure honored | FK CASCADE on `user_id` wipes all events on hard-purge (unchanged from `0007`) |
| Share endpoint is user-scoped | `get_current_user` required; user can only record shares as themselves |
| Duration bounded | Schema `le=600_000` + service-level ceiling; out-of-bounds silently dropped |
| Telemetry cannot break core loop | `record_event` swallows errors (Day 3 discipline preserved) |
| Metrics endpoint admin-gated | `require_role([ADMIN, SUPERUSER])` (unchanged) |
| Conversion measured, not leaked | Aggregated as a rate; individual conversions never surfaced |
| Migration is forward-only safe | Nullable column, no default, no data rewrite |

---

## 7. Acceptance Criteria

1. `POST /analytics/share` requires auth → 401 unauth.
2. `POST /analytics/share` returns 204 on valid input; 422 on invalid `module_code`.
3. `module_code` is normalized to uppercase before storage (case-insensitive input accepted).
4. `summarize` records `summarize_duration` with real elapsed ms (server-measured).
5. `POST /sync/push` accepts optional `client_duration_ms` (schema-bounded); records event when present; silently omits when absent.
6. Out-of-bounds durations (negative, > 600_000) are silently dropped, never stored.
7. `GET /admin/metrics` returns `shares_count`, `share_conversion_rate`, `summarize_p50_ms`, `summarize_p95_ms`, `sync_push_p50_ms`, `sync_push_p95_ms`.
8. Percentile values match hand-computed expectations on known input; `None` when zero samples in window.
9. `share_conversion_rate` is `0.0` when there are no shares; otherwise bounded `[0.0, 1.0]`.
10. `docs/openapi.json` regenerated; drift gate `[PASS]`.
11. `docs/API_CONTRACT_V1.md` documents the deep-link URL shape with examples.
12. Migration `0008` applies forward cleanly; downgrade reverses; Alembic head = `0008`.
13. All existing tests pass; new tests for share, duration, and metrics extensions pass.
14. `ruff check app/ tests/ scripts/` clean.
15. **No new packages.**

---

## 8. Verification Steps

```bash
# 1. Lint + full suite
ruff check app/ tests/ scripts/
pytest -q

# 2. Migration forward/downgrade
alembic upgrade head        # expects 0008
alembic downgrade -1        # reverses cleanly
alembic upgrade head

# 3. Drift gate
python scripts/check_contract_drift.py   # must be [PASS]

# 4. Local smoke: share + metrics
python scripts/seed_client_fixture.py
uvicorn app.main:app --reload  # another terminal
TOKEN=$(python scripts/print_client_tokens.py | grep '^Authorization' | awk '{print $3}')
curl -i -X POST http://127.0.0.1:8000/api/v1/analytics/share \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"module_code":"inf154"}'
# expect: 204 No Content

# 5. Metrics as admin (use an ADMIN token)
curl -s http://127.0.0.1:8000/api/v1/admin/metrics \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq
# expect: shares_count >= 1, other fields present
```

---

## 9. Defect-Discovery Prompts

> Run it, don't just read it.

- **Share returns 200 instead of 204** → the route lacks `status_code=status.HTTP_204_NO_CONTENT`. FastAPI defaults to 200.
- **`share_conversion_rate` > 1.0** → your conversion query counts multiple signups per share event without de-duplicating by user. Add `.distinct()` on `Module.user_id`.
- **`share_conversion_rate` counts the sharer themselves** → the "different user" check is missing or the placeholder comparison is wrong. Sharer's own re-registration must not count.
- **p95 < p50** → your percentile index convention is inconsistent (e.g., one uses `floor`, the other `round`). Use one function for both.
- **Durations recorded as `0` when summarize runs** → `time.perf_counter()` called after the work rather than before. Verify `t0` is captured as the first line.
- **Sync duration is absent even though the client sends it** → the router reads `payload.client_duration_ms` but the schema field name differs (e.g., `client_duration_ms` vs `duration_ms`). Grep both.
- **Migration `0008` downgrade fails** → `drop_column` on a column with a dependent index; verify `0007` did not add an index on `duration_ms` (it must not).
- **Existing rows show `duration_ms` non-null** → you added `server_default=0`. Remove it; nullable-with-no-default is the correct shape.
- **Metrics endpoint 403s even for ADMIN** → role check on the wrong role. Confirm `UserRole.ADMIN` is in the allow-list.
- **Drift gate fails after adding the share endpoint** → you edited code without running `python scripts/export_openapi.py > docs/openapi.json`. Regenerate and commit.

---

## 10. Sign-Off Checklist

- [ ] `UsageEvent.duration_ms` added (nullable, no default)
- [ ] Migration `0008` applies forward/downgrade cleanly; head = `0008`
- [ ] `POST /analytics/share` returns 204, requires auth, normalizes `module_code`
- [ ] Summarize records `summarize_duration` (server-measured, `perf_counter`)
- [ ] Sync push accepts optional `client_duration_ms`, schema-bounded, records when present
- [ ] Out-of-bounds durations silently dropped
- [ ] `GET /admin/metrics` returns shares, conversion, and four percentiles
- [ ] Percentile convention locked by a test with hand-computed expectations
- [ ] `docs/openapi.json` regenerated; drift gate `[PASS]`
- [ ] `docs/API_CONTRACT_V1.md` documents deep-link URL shape
- [ ] `tests/test_analytics_share.py` + `tests/test_analytics_duration.py` pass
- [ ] Full suite: zero regressions
- [ ] `ruff check app/ tests/ scripts/` clean
- [ ] **No new packages**
- [ ] Branch: `month2/week2-day4-signals` off `develop`

---

## 11. Best Practices Worth Adding (Optional, Low-Cost, High-Leverage)

You asked for recommendations that improve the software without hammering you. These are **optional** — the day is complete without them. Each is **one small file change and one test**, no new infrastructure.

### 11.1 A single `EVENT_TYPES` enum module

**What:** Create `app/core/event_types.py` with a `StrEnum` or `Literal` of all valid `event_type` values.

**Why:** Today, event types are string literals scattered across `analytics_service.py`. A single source of truth prevents typos (e.g., `"summarize_duration"` vs `"summarise_duration"` — one would silently never match in metrics). Type checkers catch the drift.

**Cost:** 10 lines, 1 test.

### 11.2 A metric-conventions doc comment

**What:** Add a module docstring to `analytics_service.py` documenting:
- Percentile convention (index-based, nearest-rank).
- Windows used (`since`/`until` semantics: `[since, until]` inclusive).
- Units (ms everywhere).
- Rate conventions (`0.0–1.0`, 4dp).

**Why:** Six months from now, nobody remembers. A docstring that travels with the code is cheaper than a wiki page nobody reads.

**Cost:** 15 lines of comments.

### 11.3 A guard test for event-type strings in metrics

**What:** A test that asserts every event type the service references in `get_metrics` is also in `EVENT_TYPES`.

**Why:** If someone adds a metric query but forgets to register the event type, the metric silently returns 0 forever.

**Cost:** 1 test, ~10 lines.

### 11.4 A `scripts/curl_metrics.sh` helper

**What:** A tiny shell script that loads the admin token and curls `/admin/metrics` with `jq`, so reading metrics is one command.

**Why:** The MVP success criteria are numeric. Making the number one command away means it gets read daily during validation. If it's three commands, it gets read weekly. If it's a dashboard, it gets read — but you don't need a dashboard yet.

**Cost:** ~15 lines of shell.

### 11.5 A one-line log when telemetry drops a duration

**What:** In `record_duration`, when a value is out of bounds, emit `logger.debug("dropped duration_ms=%s event=%s", duration_ms, event_type)`. Debug level — not warning, not error.

**Why:** If a client bug starts sending 1-hour durations, you want to see it *somewhere*, without it polluting production logs at normal level.

**Cost:** 1 line.

**My recommendation:** adopt **11.1** and **11.3** (they prevent silent bugs), and **11.2** (it's free). 11.4 and 11.5 are nice-to-haves you can defer.

---

## 12. What's Deferred (and why)

| Item | Reason |
|---|---|
| Referral rewards / invite codes | Product decision on incentives; premature before observing organic sharing |
| Session replay / RUM | Client surface; privacy sensitivity |
| Funnel analysis dashboards | Vendor territory; Day 3 chose self-hosted events |
| Cohort retention charts | Same — vendor territory |
| Push notifications for share-driven re-engagement | Separate design; not the same day |
| Percentile computation in Postgres | Python is fine at this volume; revisit if daily samples exceed ~100k |
| Postgres `percentile_cont` migration | Defer with the same trigger |

---

## 13. Next

Implement, verify (§8), then submit the Day 4 report. **Day 5 will be the Week 2 coherence review** — no new features, just a merge-readiness pass and a close-out document.

**Tell the engineer to expect one small migration** (`0008`), **one new endpoint** (`POST /analytics/share`), and **regenerate `docs/openapi.json` before pushing** (the drift gate will fail otherwise).

If you want any of the §11 optional best practices bundled into Day 4's scope, say which ones and I'll fold them into the acceptance criteria. Otherwise, Day 4 is complete as written.
