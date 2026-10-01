"""app/schemas/analytics.py

Pydantic schemas for product-validation instrumentation (Month 2, Week 2,
Day 3).
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.core.sanitizer import sanitize_string

EventType = Literal[
    "SUMMARY_GENERATED",
    "SUMMARY_CACHE_HIT",
    "MATERIALS_SEARCHED",
    "SYNC_PUSHED",
    "DASHBOARD_VIEWED",
]


class FeedbackCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: str | None = Field(default=None, max_length=500)

    @field_validator("comment")
    @classmethod
    def _sanitize_comment(cls, v: str | None) -> str | None:
        if v is None:
            return None
        clean = sanitize_string(v)
        return clean or None


class FeedbackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rating: int
    comment: str | None
    created_at: datetime


class ShareEventRequest(BaseModel):
    module_code: str = Field(..., min_length=2, max_length=20)

    @field_validator("module_code")
    @classmethod
    def normalize_module(cls, v: str) -> str:
        clean = sanitize_string(v)
        if not clean:
            raise ValueError("Invalid module code")
        return clean.upper()


class MetricsResponse(BaseModel):
    """Admin-gated aggregate readout (no PII; counts + rates only)."""

    period_start: str
    period_end: str
    active_users: int
    total_summaries: int
    cache_hit_rate: float
    total_materials_searches: int
    total_sync_pushes: int
    total_dashboard_views: int
    avg_feedback_rating: float | None
    total_tokens_used: int
    estimated_cost_zar: float
    # Day 4: sharing + friction
    shares_count: int
    share_conversion_rate: float
    summarize_p50_ms: float | None
    summarize_p95_ms: float | None
    sync_push_p50_ms: float | None
    sync_push_p95_ms: float | None


class ActivityItem(BaseModel):
    """One entry in the student's own recent-activity feed."""

    id: uuid.UUID
    event_type: str = Field(..., max_length=40)
    module_code: str | None = Field(default=None, max_length=20)
    created_at: datetime | None = None


class ActivityResponse(BaseModel):
    """The user's recent activity, newest first (bounded by the service)."""

    items: list[ActivityItem]


# ---------------------------------------------------------------------------
# POPIA consent framework (Month 2, Week 3, Day 3.5)
# ---------------------------------------------------------------------------
class ConsentRequest(BaseModel):
    """Set the product-improvement consent state.

    `source` is a closed set, and the database enforces the same set with a
    CHECK constraint. Restricting it keeps the audit trail meaningful: a vague
    source value would make it impossible to tell where a decision was made.
    """

    granted: bool
    source: Literal["onboarding", "settings"]


class ConsentState(BaseModel):
    """Current consent state.

    `granted` is False when the user has never decided - absence of a decision
    is treated as refusal, which is the only safe default for consent.
    """

    granted: bool
    policy_version: str | None = None
    updated_at: datetime | None = None


class ConsentHistoryEntry(BaseModel):
    """One row of the append-only audit log."""

    model_config = ConfigDict(from_attributes=True)

    granted: bool
    policy_version: str
    source: str
    recorded_at: datetime


class ConsentHistoryResponse(BaseModel):
    """Full consent history, newest first."""

    entries: list[ConsentHistoryEntry]


class SignalRequest(BaseModel):
    """A quality signal on an AI output.

    `compared_with` is the digest of the alternative that this output was
    preferred over, and is REQUIRED for `preferred_over` - a preference with
    nothing to prefer over carries no information. The same rule is enforced by
    a CHECK constraint in the database, so an invalid row cannot exist even if
    this validation is bypassed.
    """

    signal: Literal["helpful", "unhelpful", "preferred_over"]
    compared_with: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def _preferred_requires_compared_with(self) -> SignalRequest:
        if self.signal == "preferred_over" and not self.compared_with:
            raise ValueError("preferred_over requires compared_with")
        return self
