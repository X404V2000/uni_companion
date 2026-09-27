"""app/schemas/analytics.py

Pydantic schemas for product-validation instrumentation (Month 2, Week 2,
Day 3).
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

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
