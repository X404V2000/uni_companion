"""tests/test_study_plan_service.py

PURPOSE
-------
Prove the study plan's arithmetic and ordering, and pin the properties that
would make the feature harmful if wrong:

  1. Completed work is not counted. An inflated hour count reads as a bug to a
     student and makes the whole card untrustworthy.
  2. The order is total and stable. Two page loads must not disagree, or the
     student sees the "start with this" advice change on every refresh.
  3. A task due TODAY outranks an easier one due in a week, at equal weight.
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

from app.models.academic import AcademicTask
from app.services import study_plan_service as svc

TODAY = date(2026, 10, 23)


def _task(
    title: str,
    due_in_days: int,
    task_type: str = "ASSIGNMENT",
    weight: float | None = 25.0,
    completed: bool = False,
) -> AcademicTask:
    due = datetime.combine(
        TODAY + timedelta(days=due_in_days), datetime.min.time(), tzinfo=UTC
    )
    task = AcademicTask(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        module_id=uuid.uuid4(),
        title=title,
        task_type=task_type,
        due_date=due,
        weight_percentage=weight,
        is_completed=completed,
    )
    return task


class TestEstimate:
    def test_exam_costs_more_than_a_quiz(self):
        assert svc.estimate_hours(_task("e", 5, "EXAM")) > svc.estimate_hours(
            _task("q", 5, "QUIZ")
        )

    def test_higher_weight_costs_more_but_not_proportionally(self):
        light = svc.estimate_hours(_task("light", 5, "ASSIGNMENT", weight=10))
        heavy = svc.estimate_hours(_task("heavy", 5, "ASSIGNMENT", weight=80))
        assert heavy >= light
        # A 8x weight difference must not become an 8x hour difference.
        assert heavy < light * 8

    def test_unknown_weight_uses_the_default(self):
        assert svc.estimate_hours(
            _task("x", 5, "ASSIGNMENT", weight=None)
        ) == svc.estimate_hours(_task("y", 5, "ASSIGNMENT", weight=25))

    def test_hours_are_rounded_to_a_half(self):
        hours = svc.estimate_hours(_task("r", 5, "TEST", weight=33))
        assert (hours * 2) % 1 == 0, hours


class TestPlanContents:
    def test_completed_tasks_are_excluded(self):
        plan = svc.build_plan(
            [_task("done", 2, completed=True), _task("open", 3)], TODAY
        )
        assert plan["task_count"] == 1
        assert all(p.task.title != "done" for p in plan["focus"])

    def test_tasks_outside_the_week_are_excluded(self):
        plan = svc.build_plan(
            [_task("soon", 2), _task("far", 30)], TODAY
        )
        assert plan["task_count"] == 1

    def test_empty_input_returns_an_empty_plan(self):
        plan = svc.build_plan([], TODAY)
        assert plan["task_count"] == 0
        assert plan["total_hours"] == 0
        assert plan["focus"] == []

    def test_total_hours_sums_the_week(self):
        tasks = [_task("a", 2), _task("b", 4), _task("c", 6)]
        plan = svc.build_plan(tasks, TODAY)
        expected = round(sum(svc.estimate_hours(t) for t in tasks), 1)
        assert plan["total_hours"] == expected

    def test_focus_is_capped_at_three(self):
        plan = svc.build_plan([_task(f"t{i}", i + 1) for i in range(6)], TODAY)
        assert len(plan["focus"]) == 3

    def test_assumption_is_stated(self):
        """The student must be able to argue with the estimate."""
        plan = svc.build_plan([_task("a", 2)], TODAY)
        assert plan["assumption_note"]
        assert "hours" in plan["assumption_note"]


class TestOrdering:
    def test_earlier_deadline_wins_at_equal_weight_and_effort(self):
        soon = _task("soon", 1)
        later = _task("later", 5)
        plan = svc.build_plan([later, soon], TODAY)
        assert plan["focus"][0].task.title == "soon"

    def test_due_today_outranks_due_next_week(self):
        today_task = _task("today", 0, "ASSIGNMENT", weight=25)
        weekly = _task("weekly", 7, "QUIZ", weight=25)
        plan = svc.build_plan([weekly, today_task], TODAY)
        assert plan["focus"][0].task.title == "today"

    def test_high_weight_beats_low_weight_at_equal_deadline(self):
        low = _task("low", 3, "ASSIGNMENT", weight=10)
        high = _task("high", 3, "ASSIGNMENT", weight=60)
        plan = svc.build_plan([low, high], TODAY)
        assert plan["focus"][0].task.title == "high"

    def test_order_is_deterministic_across_runs(self):
        tasks = [_task(f"t{i}", (i % 4) + 1, weight=20) for i in range(6)]
        first = [p.task.title for p in svc.build_plan(tasks, TODAY)["focus"]]
        second = [p.task.title for p in svc.build_plan(list(reversed(tasks)), TODAY)["focus"]]
        assert first == second, (first, second)


class TestReasons:
    def test_reason_states_the_deadline_and_the_weight(self):
        plan = svc.build_plan([_task("a", 2, "ASSIGNMENT", weight=40)], TODAY)
        reason = plan["focus"][0].reason
        assert "2 days" in reason
        assert "40%" in reason

    def test_reason_reads_naturally_for_today(self):
        plan = svc.build_plan([_task("a", 0)], TODAY)
        assert "due today" in plan["focus"][0].reason

    def test_reason_without_a_weight_gives_hours_instead(self):
        plan = svc.build_plan([_task("a", 2, "ASSIGNMENT", weight=None)], TODAY)
        assert "hours" in plan["focus"][0].reason
