"""app/schemas/study_plan.py

Pydantic shapes for the study plan.

WHY `assumption_note` IS PART OF THE CONTRACT
---------------------------------------------
The hours are an estimate and the UI says so out loud. Carrying the assumption in
the response rather than hardcoding the sentence in the client means the two can
never drift: if the hours per assignment change on the server, the sentence the
student reads changes with them.
"""
import uuid
from datetime import date

from pydantic import BaseModel, Field


class PlanTask(BaseModel):
    id: uuid.UUID
    title: str
    module_code: str | None = None
    task_type: str
    due_on: date
    days_left: int
    weight_percentage: float | None = None
    estimated_hours: float
    # One line, written for the student: "due in 2 days, worth 40%".
    reason: str


class StudyPlan(BaseModel):
    week_days: int
    task_count: int
    total_hours: float
    focus: list[PlanTask] = Field(default_factory=list)
    assumption_note: str
