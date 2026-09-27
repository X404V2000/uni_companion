"""app/schemas/sync.py

Pydantic schemas for the Offline Sync engine (Month 2, Week 1, Day 3).

The engine syncs the full academic domain (tasks, modules, timetable slots)
between a mobile client's local store and the cloud, with last-write-wins
(LWW) conflict resolution driven by each item's `updated_at`.

DESIGN NOTES (fixes vs. the blueprint):
- Every item carries ALL required fields for its model (e.g. task_type and
  priority for tasks) — the blueprint omitted them, which would have violated
  the DB CHECK constraints.
- `updated_at` is normalized to a timezone-aware UTC datetime so comparisons
  are always apples-to-apples (naive vs aware would otherwise raise).
- Lists use `default_factory=list` (not a shared mutable default).
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, time, timedelta
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.sanitizer import sanitize_string

TaskType = Literal["ASSIGNMENT", "EXAM", "TEST", "QUIZ"]
TaskPriority = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]

# Allow a small client-vs-server clock skew, but clamp anything further in the
# future so a malicious client cannot push `updated_at = year 9999` and win
# last-write-wins forever (silently discarding all later legitimate edits).
_MAX_FUTURE_SKEW = timedelta(minutes=5)


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _clamp_future(value: datetime) -> datetime:
    """Coerce far-future timestamps to now + small skew tolerance."""
    now = datetime.now(UTC)
    ceiling = now + _MAX_FUTURE_SKEW
    clamped = min(value, ceiling)
    return clamped


class _SyncItemBase(BaseModel):
    """Shared updated_at normalization + clock-skimming clamp for sync items."""

    updated_at: datetime

    @field_validator("updated_at")
    @classmethod
    def _norm_updated_at(cls, v: datetime) -> datetime:
        return _clamp_future(_to_utc(v))


class TaskSyncItem(_SyncItemBase):
    id: uuid.UUID
    module_id: uuid.UUID
    title: str = Field(..., min_length=2, max_length=255)
    task_type: TaskType = Field(default="ASSIGNMENT")
    due_date: datetime
    priority: TaskPriority = Field(default="MEDIUM")
    weight_percentage: float | None = Field(default=None, ge=0.0, le=100.0)
    is_completed: bool = Field(default=False)

    @field_validator("title")
    @classmethod
    def _sanitize_title(cls, v: str) -> str:
        clean = sanitize_string(v)
        if not clean:
            raise ValueError("Invalid task title")
        return clean

    @field_validator("due_date")
    @classmethod
    def _bound_due_date(cls, v: datetime) -> datetime:
        v = _to_utc(v)
        # Reject absurd/degenerate deadlines (e.g. year 9999) while allowing
        # any realistic academic horizon (<= 10 years out).
        if v > datetime.now(UTC) + timedelta(days=3650):
            raise ValueError("due_date is implausibly far in the future")
        return v


class ModuleSyncItem(_SyncItemBase):
    id: uuid.UUID
    code: str = Field(..., min_length=2, max_length=20)
    name: str = Field(..., min_length=2, max_length=255)
    color_code: str = Field(default="#2563eb", max_length=7)

    @field_validator("code")
    @classmethod
    def _norm_code(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("name")
    @classmethod
    def _sanitize_name(cls, v: str) -> str:
        clean = sanitize_string(v)
        if not clean:
            raise ValueError("Invalid module name")
        return clean


class TimetableSlotSyncItem(_SyncItemBase):
    id: uuid.UUID
    module_id: uuid.UUID
    day_of_week: int = Field(..., ge=1, le=7)
    start_time: time
    end_time: time
    venue: str | None = Field(default=None, max_length=100)


class SyncPushRequest(BaseModel):
    tasks: list[TaskSyncItem] = Field(default_factory=list, max_length=100)
    modules: list[ModuleSyncItem] = Field(default_factory=list, max_length=100)
    timetable_slots: list[TimetableSlotSyncItem] = Field(
        default_factory=list, max_length=100
    )
    # Client-reported full round-trip duration (queue drain + upload + server
    # processing + response). Optional; bounded; records a friction event when
    # present (never errors when absent).
    client_duration_ms: int | None = Field(default=None, ge=0, le=600_000)


class SyncPullResponse(BaseModel):
    server_timestamp: datetime
    tasks: list[TaskSyncItem]
    modules: list[ModuleSyncItem]
    timetable_slots: list[TimetableSlotSyncItem]
