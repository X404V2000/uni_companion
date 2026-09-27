"""
app/services/academic_service.py

PURPOSE
-------
Business logic and DB operations for academic modules (Week 3, Day 2).

SECURITY — MULTI-TENANT ISOLATION
---------------------------------
Every query is scoped by the authenticated user's id; a user can never
create/list/delete another user's modules. The database UNIQUE(user_id, code)
constraint is the backstop for duplicate codes per owner.
"""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.academic import AcademicTask, Module, TimetableSlot
from app.schemas.academic import (
    ModuleCreate,
    TaskCreate,
    TimetableSlotCreate,
)

logger = logging.getLogger(__name__)


class DuplicateModuleError(Exception):
    """Raised when a user already owns a module with the given code."""


class ModuleNotFoundError(Exception):
    """Raised when the requested module does not belong to the user."""


class ScheduleConflictError(Exception):
    """Raised when a new class slot overlaps an existing slot on the same day."""


class TaskNotFoundError(Exception):
    """Raised when a task does not belong to the user."""


def create_module(db: Session, user_id: uuid.UUID, module_in: ModuleCreate) -> Module:
    """Create a module owned by `user_id`; duplicate code -> DuplicateModuleError."""
    new_module = Module(
        user_id=user_id,
        code=module_in.code,
        name=module_in.name,
        color_code=module_in.color_code,
    )
    db.add(new_module)
    try:
        db.commit()
        db.refresh(new_module)
        return new_module
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateModuleError(
            f"Module '{module_in.code}' already exists in your account."
        ) from exc


def get_user_modules(db: Session, user_id: uuid.UUID) -> list[Module]:
    """All modules owned by the user, ordered by code."""
    return (
        db.query(Module)
        .filter(Module.user_id == user_id)
        .order_by(Module.code.asc())
        .all()
    )


def delete_module(db: Session, user_id: uuid.UUID, module_id: uuid.UUID) -> None:
    """Delete a module ONLY if it belongs to `user_id`; else ModuleNotFoundError.

    Deleting cascades to timetable slots and academic tasks via FK.
    """
    module = (
        db.query(Module)
        .filter(Module.id == module_id, Module.user_id == user_id)
        .first()
    )
    if not module:
        raise ModuleNotFoundError("Module not found")

    db.delete(module)
    db.commit()


def create_timetable_slot(
    db: Session, user_id: uuid.UUID, slot_in: TimetableSlotCreate
) -> TimetableSlot:
    """Create a class slot after verifying module ownership + no conflicts."""
    # 1. Module must exist and belong to this user.
    module = (
        db.query(Module)
        .filter(Module.id == slot_in.module_id, Module.user_id == user_id)
        .first()
    )
    if not module:
        raise ModuleNotFoundError("Referenced module not found in your account.")

    # 2. Overlap check: (existing.start < new.end) AND (existing.end > new.start)
    overlap = (
        db.query(TimetableSlot)
        .filter(
            TimetableSlot.user_id == user_id,
            TimetableSlot.day_of_week == slot_in.day_of_week,
            TimetableSlot.start_time < slot_in.end_time,
            TimetableSlot.end_time > slot_in.start_time,
        )
        .first()
    )
    if overlap:
        raise ScheduleConflictError(
            "Time slot overlaps with an existing class on this day."
        )

    # 3. Create + commit.
    new_slot = TimetableSlot(
        user_id=user_id,
        module_id=slot_in.module_id,
        day_of_week=slot_in.day_of_week,
        start_time=slot_in.start_time,
        end_time=slot_in.end_time,
        venue=slot_in.venue,
    )
    db.add(new_slot)
    db.commit()
    db.refresh(new_slot)
    return new_slot


def get_user_timetable(db: Session, user_id: uuid.UUID) -> list[TimetableSlot]:
    """Weekly timetable sorted by day_of_week then start_time."""
    return (
        db.query(TimetableSlot)
        .filter(TimetableSlot.user_id == user_id)
        .order_by(TimetableSlot.day_of_week.asc(), TimetableSlot.start_time.asc())
        .all()
    )


def create_task(db: Session, user_id: uuid.UUID, task_in: TaskCreate) -> AcademicTask:
    """Create an academic task after verifying the module belongs to the user."""
    module = (
        db.query(Module)
        .filter(Module.id == task_in.module_id, Module.user_id == user_id)
        .first()
    )
    if not module:
        raise ModuleNotFoundError("Referenced module not found in your account.")

    new_task = AcademicTask(
        user_id=user_id,
        module_id=task_in.module_id,
        title=task_in.title,
        task_type=task_in.task_type,
        due_date=task_in.due_date,
        priority=task_in.priority,
        weight_percentage=task_in.weight_percentage,
    )
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task


def get_user_tasks(
    db: Session, user_id: uuid.UUID, is_completed: bool | None = None
) -> list[AcademicTask]:
    """User's tasks, optionally filtered by completion, sorted by due_date."""
    query = db.query(AcademicTask).filter(AcademicTask.user_id == user_id)
    if is_completed is not None:
        query = query.filter(AcademicTask.is_completed == is_completed)
    return query.order_by(AcademicTask.due_date.asc()).all()


def get_user_tasks_paginated(
    db: Session,
    user_id: uuid.UUID,
    page: int = 1,
    size: int = 20,
    module_id: uuid.UUID | None = None,
    is_completed: bool | None = None,
    priority: str | None = None,
    task_type: str | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
) -> dict:
    """Paginated + multi-filter task query, scoped to the user.

    All filters are AND-ed; date filters are inclusive (due_date >= from_date
    and due_date <= to_date). Defensive bounds are enforced HERE (not just in
    the router) so a direct call can never page/drain unbounded rows or apply
    invalid enum filters.
    """
    # Defensive bounds (router also enforces; belt-and-braces).
    page = max(1, page)
    size = max(1, min(100, size))

    # Enum allow-lists: reject (rather than silently ignore) invalid values.
    if priority is not None:
        allowed = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
        if priority.upper() not in allowed:
            raise ValueError("Invalid priority filter")
        priority = priority.upper()
    if task_type is not None:
        allowed = {"ASSIGNMENT", "EXAM", "TEST", "QUIZ"}
        if task_type.upper() not in allowed:
            raise ValueError("Invalid task_type filter")
        task_type = task_type.upper()

    query = db.query(AcademicTask).filter(AcademicTask.user_id == user_id)

    if module_id is not None:
        query = query.filter(AcademicTask.module_id == module_id)
    if is_completed is not None:
        query = query.filter(AcademicTask.is_completed == is_completed)
    if priority is not None:
        query = query.filter(AcademicTask.priority == priority)
    if task_type is not None:
        query = query.filter(AcademicTask.task_type == task_type)
    if from_date is not None:
        query = query.filter(AcademicTask.due_date >= from_date)
    if to_date is not None:
        query = query.filter(AcademicTask.due_date <= to_date)

    total = query.count()
    offset = (page - 1) * size
    items = (
        query.order_by(AcademicTask.due_date.asc())
        .offset(offset)
        .limit(size)
        .all()
    )
    pages = (total + size - 1) // size if total > 0 else 1

    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size,
        "pages": pages,
    }


def update_task_completion(
    db: Session, user_id: uuid.UUID, task_id: uuid.UUID, is_completed: bool
) -> AcademicTask:
    """Set/clear completion; completed_at follows the state machine."""
    task = (
        db.query(AcademicTask)
        .filter(AcademicTask.id == task_id, AcademicTask.user_id == user_id)
        .first()
    )
    if not task:
        raise TaskNotFoundError("Task not found in your account.")

    task.is_completed = is_completed
    task.completed_at = datetime.now(UTC) if is_completed else None

    db.commit()
    db.refresh(task)
    return task
