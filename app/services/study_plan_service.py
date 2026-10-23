"""app/services/study_plan_service.py

PURPOSE
-------
Answer the question a student actually asks: "can I get through this week?"

The dashboard already says WHAT is due. This says how much work that is and what
to start with, which is the part a student cannot work out at 11pm.

WHY THIS IS ARITHMETIC AND NOT A MODEL
--------------------------------------
Every number here can be argued with by the person reading it, and is stated in
the UI. "About 9 hours, based on 2 hours per test" is something a student can
correct in their head and then trust. A model that produced the same number
without explanation would be ignored the first time it was wrong, and it would
be wrong often: the app has no idea how long THIS student takes on THIS module.

The estimate is deliberately crude and deliberately visible. Precision would be
false precision.

WHAT IT DOES NOT DO
-------------------
It does not schedule. It does not invent study slots or write a timetable. It
ranks what is already due and totals it. Anything more would be guessing about
a week the app cannot see (lectures, work, sleep, sport).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from app.models.academic import AcademicTask

# Base hours per assessment type. Products of judgement, tuned to a semester
# module at a South African university where an assessment is usually a chunk of
# reading plus a written submission or revision.
#
# These are the numbers the UI shows the student ("based on 4 hours per
# assignment"), so changing one changes a promise as well as a calculation.
BASE_HOURS: dict[str, float] = {
    "QUIZ": 1.5,
    "TEST": 4.0,
    "ASSIGNMENT": 4.0,
    "EXAM": 12.0,
}
DEFAULT_BASE_HOURS = 4.0

# Guards on the weight multiplier. Without the clamp one 100%-weighted exam
# would make every other task invisible; the clamp keeps the ranking useful
# rather than dominated by a single row.
WEIGHT_MIN_FACTOR = 0.5
WEIGHT_MAX_FACTOR = 2.0

# Assumed weight when the student did not enter one. 25% is a typical single
# assessment in a semester module.
DEFAULT_WEIGHT = 25.0

# How many tasks the plan asks the student to think about at once. Three is a
# decision; ten is a list, and a list is what the dashboard already is.
FOCUS_COUNT = 3

# The window the weekly total covers.
WEEK_DAYS = 7


@dataclass
class PlannedTask:
    task: AcademicTask
    hours: float
    priority: float
    days_left: int
    reason: str


def weight_factor(weight_percentage: float | None) -> float:
    """Scale effort mildly by how much the assessment is worth.

    A 10% quiz needs less preparation than a 50% exam, but not five times less:
    the overhead of sitting down and understanding the material is roughly flat.
    Hence a clamped, shallow mapping rather than a proportional one.
    """
    if weight_percentage is None:
        return 1.0
    weight = float(weight_percentage)
    factor = 0.75 + (min(weight, 100.0) / 100.0) * 0.75
    return max(WEIGHT_MIN_FACTOR, min(WEIGHT_MAX_FACTOR, factor))


def estimate_hours(task: AcademicTask) -> float:
    """Estimated preparation hours for one task, rounded to a half hour."""
    base = BASE_HOURS.get((task.task_type or "").upper(), DEFAULT_BASE_HOURS)
    hours = base * weight_factor(
        float(task.weight_percentage) if task.weight_percentage is not None else None
    )
    return round(hours * 2) / 2


def _days_left(due: datetime, today: date) -> int:
    """Whole calendar days until the deadline. Never negative."""
    due_date = due.date() if isinstance(due, datetime) else due
    return max(0, (due_date - today).days)


def priority_of(task: AcademicTask, today: date) -> float:
    """How urgently this should be started. Higher means sooner.

    urgency  = soonest first, flattened so today and tomorrow are both "now"
    impact   = what the assessment is worth
    effort   = divided out, so a small easy task due soon beats a huge one

    sqrt on effort rather than a straight division: a 12-hour exam should not
    drop below a 4-hour assignment purely because it is bigger. It needs more
    time, it is not less urgent.
    """
    days = _days_left(task.due_date, today)
    urgency = 1.0 / max(1, days)
    impact = (
        float(task.weight_percentage)
        if task.weight_percentage is not None
        else DEFAULT_WEIGHT
    )
    effort = max(1.0, estimate_hours(task))
    return (urgency * impact) / math.sqrt(effort)


def _reason(task: AcademicTask, days: int, hours: float) -> str:
    """One line explaining why this task is where it is.

    Written for the student, and in the same voice as the rest of the app: state
    the fact, do not encourage.
    """
    when = (
        "due today"
        if days == 0
        else "due tomorrow"
        if days == 1
        else f"due in {days} days"
    )
    worth = (
        f"worth {float(task.weight_percentage):g}%"
        if task.weight_percentage is not None
        else f"about {hours:g} hours of work"
    )
    return f"{when}, {worth}"


def build_plan(
    tasks: list[AcademicTask], today: date | None = None
) -> dict:
    """Produce the weekly total and the top tasks to start.

    Only incomplete tasks are considered: a completed task is not work the
    student still has to do, and including it would inflate the hours and make
    the number feel wrong.
    """
    today = today or datetime.now(UTC).date()

    open_tasks = [t for t in tasks if not t.is_completed]
    week_end = today + timedelta(days=WEEK_DAYS)

    planned: list[PlannedTask] = []
    for task in open_tasks:
        if task.due_date is None:
            continue
        due_date = (
            task.due_date.date()
            if isinstance(task.due_date, datetime)
            else task.due_date
        )
        if due_date > week_end:
            continue
        days = _days_left(task.due_date, today)
        hours = estimate_hours(task)
        planned.append(
            PlannedTask(
                task=task,
                hours=hours,
                priority=priority_of(task, today),
                days_left=days,
                reason=_reason(task, days, hours),
            )
        )

    # Highest priority first; then the sooner deadline; then title, so the order
    # is total and two page loads cannot disagree.
    planned.sort(key=lambda p: (-p.priority, p.days_left, p.task.title))

    total_hours = round(sum(p.hours for p in planned), 1)

    return {
        "week_days": WEEK_DAYS,
        "task_count": len(planned),
        "total_hours": total_hours,
        "focus": planned[:FOCUS_COUNT],
        # The assumption, stated so the student can correct for it.
        "assumption_note": (
            "Based on about 4 hours per assignment or test and 12 hours per exam, "
            "scaled by how much each one is worth."
        ),
    }
