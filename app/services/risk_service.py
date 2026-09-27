"""app/services/risk_service.py

PURPOSE
-------
"At-risk detection" — flag the work a student is likely to slip on, BEFORE it
becomes a missed deadline.

DESIGN: transparent rules, not a black box
------------------------------------------
Every flag is a documented, deterministic heuristic so a student can see WHY
something is flagged and act on it. No LLM is involved (zero cost, zero latency,
works offline) — which also means the same task always produces the same risk
level, so the dashboard never flickers between verdicts.

RULES (evaluated per open task)
-------------------------------
  OVERDUE          due date already passed
  DUE_TODAY        due within the next 24 hours
  DUE_SOON         due within 3 days
  HIGH_WEIGHT_SOON due within 7 days AND worth >= 20% of the module mark
  CRITICAL_PRIORITY  priority == CRITICAL and still open
  EXAM_APPROACHING an EXAM/TEST due within 7 days

Aggregated signals (about the student, not one task)
----------------------------------------------------
  HEAVY_WEEK      3+ open tasks due within the next 7 days
  CLUSTERED       3+ open tasks due on the SAME day
  NO_PROGRESS     tasks exist but none have been completed yet

SCALE
-----
One tenant-scoped query over open tasks, bounded to the next 30 days plus any
overdue rows, and capped at MAX_TASKS. Uses ix_tasks_user_due
(user_id, is_completed, due_date).
"""
from __future__ import annotations

import uuid
from collections import Counter
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.models.academic import AcademicTask, Module

# Bound the work: we never need to reason about the distant future, and any
# overdue task is always included regardless of age.
_LOOKAHEAD_DAYS = 30
MAX_TASKS = 200
_HEAVY_WEEK_THRESHOLD = 3
_CLUSTER_THRESHOLD = 3
_HIGH_WEIGHT_PERCENT = 20.0

# Severity ordering used to sort the output (most urgent first).
_SEVERITY = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}


def _risk_for_task(task: AcademicTask, now: datetime) -> tuple[str | None, str | None]:
    """Return (level, reason) for a single open task, or (None, None).

    `level` is one of CRITICAL / HIGH / MEDIUM; `reason` is a short human string
    explaining the flag so the UI can show WHY.
    """
    due = task.due_date
    if due.tzinfo is None:  # defensive: treat naive timestamps as UTC
        due = due.replace(tzinfo=UTC)
    delta = due - now
    # Round to whole minutes before bucketing. Without this, a task due at
    # exactly 72h compares as 72.000001h (microseconds elapsed between the
    # caller's clock reading and ours) and drops out of the "within 3 days"
    # band. Rounding makes each band boundary inclusive and stable, so two
    # reads a moment apart never disagree.
    total_seconds = round(delta.total_seconds() / 60) * 60
    hours = total_seconds / 3600
    days = hours / 24
    weight = float(task.weight_percentage or 0)

    if total_seconds < 0:
        return "CRITICAL", "Already overdue"

    if hours <= 24:
        return "CRITICAL", "Due within 24 hours"

    if days <= 3:
        return "HIGH", "Due within 3 days"

    if task.priority == "CRITICAL":
        return "HIGH", "Marked critical priority"

    if days <= 7 and weight >= _HIGH_WEIGHT_PERCENT:
        return "HIGH", f"Worth {weight:.0f}% and due within a week"

    if days <= 7 and task.task_type in ("EXAM", "TEST"):
        return "HIGH", f"{task.task_type.title()} within a week"

    if days <= 7:
        return "MEDIUM", "Due within a week"

    return None, None


def get_at_risk(db: Session, user_id: uuid.UUID, days: int = 14) -> dict:
    """Return the student's at-risk tasks plus aggregate signals.

    Strictly tenant-scoped. `days` bounds the horizon (clamped to 1..30).
    """
    now = datetime.now(UTC)
    horizon = min(max(days, 1), 30)
    cutoff = now + timedelta(days=max(horizon, _LOOKAHEAD_DAYS))

    open_tasks = (
        db.query(AcademicTask)
        .filter(
            AcademicTask.user_id == user_id,
            AcademicTask.is_completed.is_(False),
            # Include everything overdue, plus the bounded future window.
            AcademicTask.due_date <= cutoff,
        )
        .order_by(AcademicTask.due_date.asc())
        .limit(MAX_TASKS)
        .all()
    )

    # Module names for a friendlier UI (single extra query, not N+1).
    module_names = dict(
        db.query(Module.id, Module.code).filter(Module.user_id == user_id).all()
    )

    flagged: list[dict] = []
    for task in open_tasks:
        level, reason = _risk_for_task(task, now)
        if level is None:
            continue
        # Normalise naive timestamps to UTC before arithmetic so a legacy row
        # can never raise a naive/aware subtraction error.
        due = task.due_date if task.due_date.tzinfo else task.due_date.replace(
            tzinfo=UTC
        )
        # Whole days until due (negative when overdue) for a friendly label.
        days_until = int((due - now).total_seconds() // 86400)
        flagged.append(
            {
                "task_id": str(task.id),
                "title": task.title,
                "module_code": module_names.get(task.module_id, ""),
                "task_type": task.task_type,
                "priority": task.priority,
                "due_date": task.due_date.isoformat(),
                "weight_percentage": (
                    float(task.weight_percentage)
                    if task.weight_percentage is not None
                    else None
                ),
                "level": level,
                "reason": reason,
                "days_until_due": days_until,
            }
        )

    flagged.sort(
        key=lambda f: (
            _SEVERITY.get(f["level"], 9),
            f["due_date"],
        )
    )

    # --- Aggregate signals (about the student's workload) --------------------
    signals: list[dict] = []

    upcoming_week = [
        t
        for t in open_tasks
        if (t.due_date - now).total_seconds() <= 7 * 86400
        and (t.due_date - now).total_seconds() >= 0
    ]
    if len(upcoming_week) >= _HEAVY_WEEK_THRESHOLD:
        signals.append(
            {
                "kind": "HEAVY_WEEK",
                "level": "HIGH" if len(upcoming_week) >= 5 else "MEDIUM",
                "message": f"{len(upcoming_week)} deadlines land in the next 7 days",
            }
        )

    # Clusters: several things due on the same calendar day.
    day_counts = Counter(t.due_date.date() for t in open_tasks)
    for day, count in day_counts.most_common(3):
        if count >= _CLUSTER_THRESHOLD:
            signals.append(
                {
                    "kind": "CLUSTERED",
                    "level": "MEDIUM",
                    "message": f"{count} deadlines all fall on {day.isoformat()}",
                }
            )

    # No progress at all: motivating nudge rather than an alarm.
    total_open = db.query(AcademicTask).filter(
        AcademicTask.user_id == user_id,
        AcademicTask.is_completed.is_(False),
    ).count()
    total_done = db.query(AcademicTask).filter(
        AcademicTask.user_id == user_id,
        AcademicTask.is_completed.is_(True),
    ).count()
    if total_open > 0 and total_done == 0:
        signals.append(
            {
                "kind": "NO_PROGRESS",
                "level": "LOW",
                "message": "No tasks completed yet — start with the smallest one",
            }
        )

    counts = Counter(f["level"] for f in flagged)
    return {
        "generated_at": now.isoformat(),
        "horizon_days": horizon,
        "counts": {
            "critical": counts.get("CRITICAL", 0),
            "high": counts.get("HIGH", 0),
            "medium": counts.get("MEDIUM", 0),
            "total": len(flagged),
        },
        "signals": signals,
        "tasks": flagged,
    }
