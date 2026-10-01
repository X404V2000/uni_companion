"""app/schemas/dashboard.py

Pydantic response schema for the unified academic dashboard (Month 2, Week 1,
Day 4). A single low-bandwidth payload for the mobile home screen.
"""
import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.academic import TaskResponse, TimetableSlotResponse
from app.schemas.ai import UserQuotaResponse


class AcademicDashboardResponse(BaseModel):
    server_timestamp: datetime
    today_slots: list[TimetableSlotResponse]
    urgent_tasks: list[TaskResponse]
    ai_quota: UserQuotaResponse
    modules_count: int
    # Total open deadlines, so a UI showing only the soonest few can say so
    # instead of letting a truncated list look like the complete one.
    total_open_tasks: int = 0


# ---------------------------------------------------------------------------
# At-risk detection
# ---------------------------------------------------------------------------

class RiskCounts(BaseModel):
    critical: int
    high: int
    medium: int
    total: int


class RiskSignal(BaseModel):
    kind: str
    level: str
    message: str


class AtRiskTask(BaseModel):
    task_id: uuid.UUID
    title: str
    module_code: str
    task_type: str
    priority: str
    due_date: datetime
    weight_percentage: float | None = None
    level: str
    reason: str
    days_until_due: int


class AtRiskResponse(BaseModel):
    generated_at: datetime
    horizon_days: int
    counts: RiskCounts
    signals: list[RiskSignal]
    tasks: list[AtRiskTask]
