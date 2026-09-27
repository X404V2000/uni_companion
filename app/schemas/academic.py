"""
app/schemas/academic.py

PURPOSE
-------
Pydantic validation schemas for the Academic Tracker endpoints (Week 3).

SECURITY:
- `code` and `name` are sanitized (control chars + HTML stripped) before
  persisting; module codes are normalized to uppercase + trimmed.
- `color_code` is constrained to a 6-digit hex colour via regex.
- `ModuleResponse` exposes only safe, serializable fields.
"""
import uuid
from datetime import datetime, time
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.sanitizer import sanitize_string


class ModuleCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=20)
    name: str = Field(..., min_length=2, max_length=255)
    color_code: str = Field(default="#2563eb", pattern=r"^#[0-9a-fA-F]{6}$")

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        """Sanitize + uppercase + trim module codes."""
        clean = sanitize_string(v)
        if not clean:
            raise ValueError("Invalid module code")
        return clean.upper()

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        clean = sanitize_string(v)
        if not clean:
            raise ValueError("Invalid module name")
        return clean


class ModuleResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    code: str
    name: str
    color_code: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TimetableSlotCreate(BaseModel):
    module_id: uuid.UUID
    day_of_week: int = Field(..., ge=1, le=7, description="1=Monday, 7=Sunday")
    start_time: time
    end_time: time
    venue: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def validate_time_range(self) -> "TimetableSlotCreate":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be strictly greater than start_time")
        return self

    @field_validator("venue")
    @classmethod
    def sanitize_venue(cls, v: str | None) -> str | None:
        if v is None:
            return None
        clean = sanitize_string(v)
        return clean or None


class TimetableSlotResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    module_id: uuid.UUID
    day_of_week: int
    start_time: time
    end_time: time
    venue: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


TaskType = Literal["ASSIGNMENT", "EXAM", "TEST", "QUIZ"]
TaskPriority = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]


class TaskCreate(BaseModel):
    module_id: uuid.UUID
    title: str = Field(..., min_length=2, max_length=255)
    task_type: TaskType = Field(default="ASSIGNMENT")
    due_date: datetime
    priority: TaskPriority = Field(default="MEDIUM")
    weight_percentage: float | None = Field(default=None, ge=0.0, le=100.0)

    @field_validator("title")
    @classmethod
    def sanitize_title(cls, v: str) -> str:
        clean = sanitize_string(v)
        if not clean:
            raise ValueError("Invalid task title")
        return clean


class TaskUpdateStatus(BaseModel):
    is_completed: bool


class TaskResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    module_id: uuid.UUID
    title: str
    task_type: str
    due_date: datetime
    priority: str
    weight_percentage: float | None
    is_completed: bool
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int
    pages: int
