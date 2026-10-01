"""app/services/dashboard_service.py

PURPOSE
-------
Aggregate the student's immediate academic status into one low-bandwidth
payload (Month 2, Week 1, Day 4): today's timetable, top-5 urgent tasks, AI
quota, and registered-module count.

SCALE GUARANTEES
----------------
- Every sub-query is tenant-scoped AND index-backed:
    * today's slots  -> ix_timetable_user_day (user_id, day_of_week)
    * urgent tasks   -> ix_tasks_user_due (user_id, is_completed, due_date)
    * quota          -> ix_user_quota_date (user_id, usage_date), UNIQUE
- Result size is O(1): today's slots are bounded by the timetable; urgent
  tasks are LIMIT 5; quota/modules are scalars. No pagination needed on a
  home-screen snapshot.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.academic import AcademicTask, Module, TimetableSlot
from app.models.ai import UserAIQuota
from app.services.ai_service import DEFAULT_DAILY_LIMIT


# day_of_week is stored 1=Mon..7=Sun (SmallInteger with CHECK 1..7).
# Python's datetime.weekday() returns 0=Mon..6=Sun, so +1 maps to the model.
def _today_day_of_week() -> int:
    return datetime.now(UTC).weekday() + 1


def _quota_response(quota: UserAIQuota | None, today: str) -> dict:
    used = quota.summaries_used if quota else 0
    limit = quota.daily_limit if quota else DEFAULT_DAILY_LIMIT
    return {
        "usage_date": today,
        "summaries_used": used,
        "daily_limit": limit,
        "remaining_credits": max(0, limit - used),
    }


def get_student_dashboard(db: Session, user_id: uuid.UUID) -> dict:
    """Return a unified, tenant-scoped academic snapshot."""
    now = datetime.now(UTC)
    today = datetime.now(UTC).date()
    day_of_week = _today_day_of_week()

    today_slots = (
        db.query(TimetableSlot)
        .filter(
            TimetableSlot.user_id == user_id,
            TimetableSlot.day_of_week == day_of_week,
        )
        .order_by(TimetableSlot.start_time.asc())
        .all()
    )

    # Overdue tasks FIRST, then the soonest upcoming.
    #
    # A plain ascending sort by due date puts everything already past due at the
    # top, which filled all five slots on a busy account and pushed a genuinely
    # urgent new deadline out of view entirely. Splitting the two means the list
    # always shows something actionable rather than reading as "nothing here".
    overdue = (
        db.query(AcademicTask)
        .filter(
            AcademicTask.user_id == user_id,
            AcademicTask.is_completed.is_(False),
            AcademicTask.due_date < now,
        )
        .order_by(AcademicTask.due_date.asc())
        .limit(3)
        .all()
    )
    upcoming = (
        db.query(AcademicTask)
        .filter(
            AcademicTask.user_id == user_id,
            AcademicTask.is_completed.is_(False),
            AcademicTask.due_date >= now,
        )
        .order_by(AcademicTask.due_date.asc())
        .limit(5)
        .all()
    )
    urgent_tasks = overdue + upcoming

    quota = (
        db.query(UserAIQuota)
        .filter(UserAIQuota.user_id == user_id, UserAIQuota.usage_date == today)
        .first()
    )

    modules_count = db.query(Module).filter(Module.user_id == user_id).count()

    # Counted separately from the limited list above: the caller needs to know
    # how many deadlines exist in total, not just how many are shown.
    total_open_tasks = (
        db.query(AcademicTask)
        .filter(
            AcademicTask.user_id == user_id,
            AcademicTask.is_completed.is_(False),
        )
        .count()
    )

    return {
        "server_timestamp": now,
        "today_slots": today_slots,
        "urgent_tasks": urgent_tasks,
        "ai_quota": _quota_response(quota, today.isoformat()),
        "modules_count": modules_count,
        "total_open_tasks": total_open_tasks,
    }
