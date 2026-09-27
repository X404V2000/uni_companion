"""app/services/analytics_service.py

PURPOSE
-------
Product-validation instrumentation (Month 2, Week 2, Day 3) + sharing signals
& friction instrumentation (Day 4).

CONVENTIONS (single source of truth — do NOT change without a data migration)
----------------------------------------------------------------------------
- Event-type strings come ONLY from app/core/event_types.py (UPPERCASE).
- Percentiles: nearest-rank via the rounded-index convention
  k = round(p * (n - 1)) on a sorted list. p50 == median; p95 is the value
  at the 95% nearest rank. Locked by a test with hand-computed expectations.
- Windows: `since`/`until` are INCLUSIVE on both ends ([since, until]).
- Units: all durations are MILLISECONDS (ms). Durations are bounded [0, 600_000];
  out-of-bounds values are SILENTLY DROPPED (never stored).
- Rates: share_conversion_rate is 0.0–1.0, rounded to 4 decimal places;
  cache_hit_rate likewise. `None` (not 0) when there are no samples.

POPIA / PRIVACY
---------------
- Events never carry PII (only user_id, event_type, optional module_code,
  duration_ms, timestamp).
- Aggregates are counts/rates/percentiles — no individual rows are exposed.
- FK ON DELETE CASCADE: a POPIA hard-purge erases events automatically.

COST MODEL
----------
estimated_cost_zar derives from tokens_used on AISummaryCache using a blended
Gemini Flash rate. This is an ESTIMATE for budgeting — Google's billing
dashboard is the source of truth.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.event_types import ALL_EVENT_TYPE_VALUES, EventType
from app.models.academic import Module
from app.models.ai import AISummaryCache
from app.models.analytics import Feedback, UsageEvent

# Blended Gemini Flash pricing (USD per 1M tokens): input 0.10 + output 0.40,
# assuming ~2:1 input:output for summaries. Configurable without a migration.
_USD_PER_1K_TOKENS = 0.0003
_ZAR_PER_USD = 18.0

# Sharing conversion: a signup within this many days of a share on the same
# module counts as a conversion (the honest proxy for "did sharing work?").
SHARE_CONVERSION_WINDOW_DAYS = 7

# Duration sanity ceiling (ms). A client bug reporting a 2-hour duration would
# otherwise corrupt p95 forever.
_MAX_DURATION_MS = 600_000


def record_event(
    db: Session,
    user_id: uuid.UUID,
    event_type: str,
    module_code: str | None = None,
    duration_ms: int | None = None,
) -> None:
    """Append a usage event. Best-effort: telemetry must never break the core
    loop, so any storage failure is swallowed."""
    if event_type not in ALL_EVENT_TYPE_VALUES:
        return  # silently drop unknown event types (typo guard)
    try:
        db.add(
            UsageEvent(
                user_id=user_id,
                event_type=event_type,
                module_code=module_code,
                duration_ms=duration_ms,
            )
        )
        db.commit()
    except Exception:  # noqa: S110 - telemetry failure must never fail the request
        db.rollback()


def record_share(db: Session, user_id: uuid.UUID, module_code: str) -> None:
    """Record a module share event (client fired the OS share sheet)."""
    record_event(
        db, user_id=user_id, event_type=EventType.MODULE_SHARE.value,
        module_code=module_code,
    )


def record_duration(
    db: Session, user_id: uuid.UUID, event_type: str, duration_ms: int
) -> None:
    """Record a duration event; out-of-bounds values are silently dropped."""
    if duration_ms < 0 or duration_ms > _MAX_DURATION_MS:
        return  # silently drop out-of-bounds durations (never poison p95)
    record_event(db, user_id=user_id, event_type=event_type, duration_ms=duration_ms)


def record_feedback(db: Session, user_id: uuid.UUID, rating: int, comment: str | None) -> Feedback:
    """Persist a sanitized feedback row (rating 1-5 bound by schema)."""
    fb = Feedback(user_id=user_id, rating=rating, comment=comment)
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return fb


def _count(db: Session, event_type: str, since: datetime) -> int:
    return (
        db.query(UsageEvent)
        .filter(UsageEvent.event_type == event_type, UsageEvent.created_at >= since)
        .count()
    )


def _durations_in_window(db: Session, event_type: str, since: datetime) -> list[int]:
    rows = (
        db.query(UsageEvent.duration_ms)
        .filter(
            UsageEvent.event_type == event_type,
            UsageEvent.created_at >= since,
            UsageEvent.duration_ms.isnot(None),
        )
        .all()
    )
    return [r[0] for r in rows]


def _percentile(values: list[int], p: float) -> float | None:
    """Nearest-rank percentile (rounded-index). None when no samples."""
    if not values:
        return None
    values = sorted(values)
    k = max(0, min(len(values) - 1, int(round(p * (len(values) - 1)))))
    return float(values[k])


def get_metrics(db: Session, days: int = 7) -> dict:
    """Aggregate usage + sharing + friction signals over the trailing window."""
    days = max(1, min(90, days))
    since = datetime.now(UTC) - timedelta(days=days)

    total_summaries = _count(db, EventType.SUMMARY_GENERATED.value, since)
    cache_hits = _count(db, EventType.SUMMARY_CACHE_HIT.value, since)
    sessions_denominator = total_summaries + cache_hits

    active_users = (
        db.query(func.count(func.distinct(UsageEvent.user_id)))
        .filter(UsageEvent.created_at >= since)
        .scalar()
        or 0
    )

    # Sharing + conversion: shares in window, then count distinct users who
    # signed up (created their first module) within the conversion window on
    # the same module — excluding the sharer themselves.
    share_events = (
        db.query(UsageEvent.user_id, UsageEvent.module_code, UsageEvent.created_at)
        .filter(
            UsageEvent.event_type == EventType.MODULE_SHARE.value,
            UsageEvent.created_at >= since,
        )
        .all()
    )
    shares_count = len(share_events)
    distinct_converters: set[uuid.UUID] = set()
    for sharer_id, shared_code, shared_at in share_events:
        if not shared_code:
            continue
        window_end = shared_at + timedelta(days=SHARE_CONVERSION_WINDOW_DAYS)
        converters = (
            db.query(Module.user_id)
            .filter(
                Module.code == shared_code,
                Module.created_at > shared_at,
                Module.created_at <= window_end,
                Module.user_id != sharer_id,
            )
            .distinct()
            .all()
        )
        distinct_converters.update(r[0] for r in converters)
    conversion_rate = (
        round(len(distinct_converters) / shares_count, 4) if shares_count else 0.0
    )

    summarize_durations = _durations_in_window(
        db, EventType.SUMMARIZE_DURATION.value, since
    )
    sync_durations = _durations_in_window(db, EventType.SYNC_PUSH_DURATION.value, since)

    avg_rating = (
        db.query(func.avg(Feedback.rating))
        .filter(Feedback.created_at >= since)
        .scalar()
    )

    total_tokens = int(
        db.query(func.coalesce(func.sum(AISummaryCache.tokens_used), 0))
        .filter(AISummaryCache.created_at >= since)
        .scalar()
        or 0
    )

    now = datetime.now(UTC)
    return {
        "period_start": (now - timedelta(days=days)).date().isoformat(),
        "period_end": now.date().isoformat(),
        "active_users": int(active_users),
        "total_summaries": total_summaries,
        "cache_hit_rate": (
            round(cache_hits / sessions_denominator, 4) if sessions_denominator else 0.0
        ),
        "total_materials_searches": _count(db, EventType.MATERIALS_SEARCHED.value, since),
        "total_sync_pushes": _count(db, EventType.SYNC_PUSHED.value, since),
        "total_dashboard_views": _count(db, EventType.DASHBOARD_VIEWED.value, since),
        "avg_feedback_rating": round(float(avg_rating), 2) if avg_rating is not None else None,
        "total_tokens_used": total_tokens,
        "estimated_cost_zar": round(total_tokens / 1000 * _USD_PER_1K_TOKENS * _ZAR_PER_USD, 4),
        "shares_count": shares_count,
        "share_conversion_rate": conversion_rate,
        "summarize_p50_ms": _percentile(summarize_durations, 0.50),
        "summarize_p95_ms": _percentile(summarize_durations, 0.95),
        "sync_push_p50_ms": _percentile(sync_durations, 0.50),
        "sync_push_p95_ms": _percentile(sync_durations, 0.95),
    }


# ---------------------------------------------------------------------------
# Per-user activity feed (dashboard "Recent activity")
# ---------------------------------------------------------------------------

# Event types that are meaningful to a student seeing their OWN history.
# Duration/telemetry rows (SUMMARIZE_DURATION, SYNC_PUSH_DURATION) are excluded:
# they are metrics, not user-facing actions.
_ACTIVITY_EVENT_TYPES = (
    EventType.SUMMARY_GENERATED.value,
    EventType.SUMMARY_CACHE_HIT.value,
    EventType.MATERIALS_SEARCHED.value,
    EventType.SYNC_PUSHED.value,
    EventType.DASHBOARD_VIEWED.value,
    EventType.MODULE_SHARE.value,
)


def get_user_activity(db: Session, user_id: uuid.UUID, limit: int = 10) -> list[dict]:
    """Return the user's most recent activity, newest first.

    Scoped strictly to `user_id` (no cross-tenant leakage). Only user-facing
    event types are returned; duration telemetry is filtered out. `limit` is
    clamped so a caller cannot request an unbounded scan.
    """
    limit = max(1, min(limit, 50))

    rows = (
        db.query(UsageEvent)
        .filter(
            UsageEvent.user_id == user_id,
            UsageEvent.event_type.in_(_ACTIVITY_EVENT_TYPES),
        )
        .order_by(UsageEvent.created_at.desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": str(row.id),
            "event_type": row.event_type,
            "module_code": row.module_code,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]
