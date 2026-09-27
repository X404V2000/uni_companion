"""
app/api/v1/academic.py

PURPOSE
-------
HTTP endpoints for the Academic Tracker (Week 3, Day 2: modules).

Every endpoint requires authentication (`get_current_user`) and passes the
authenticated user's id into the service layer so queries are tenant-scoped.
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.academic import (
    ModuleCreate,
    ModuleResponse,
    PaginatedResponse,
    TaskCreate,
    TaskPriority,
    TaskResponse,
    TaskType,
    TaskUpdateStatus,
    TimetableSlotCreate,
    TimetableSlotResponse,
)
from app.services import academic_service

router = APIRouter(prefix="/academic", tags=["Academic Tracker"])


@router.post(
    "/modules",
    response_model=ModuleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_module(
    module_in: ModuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a module for the authenticated user."""
    try:
        return academic_service.create_module(
            db=db, user_id=current_user.id, module_in=module_in
        )
    except academic_service.DuplicateModuleError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get(
    "/modules",
    response_model=list[ModuleResponse],
    status_code=status.HTTP_200_OK,
)
async def list_modules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List modules belonging to the authenticated user (scoped)."""
    return academic_service.get_user_modules(db=db, user_id=current_user.id)


@router.delete("/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_module(
    module_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a module ONLY if it belongs to the authenticated user."""
    try:
        academic_service.delete_module(
            db=db, user_id=current_user.id, module_id=module_id
        )
    except academic_service.ModuleNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Module not found"
        ) from None
    # 204 No Content: FastAPI returns None body automatically.
    return None


@router.post(
    "/timetable",
    response_model=TimetableSlotResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_timetable_slot(
    slot_in: TimetableSlotCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a new class slot in the authenticated user's timetable."""
    try:
        return academic_service.create_timetable_slot(
            db=db, user_id=current_user.id, slot_in=slot_in
        )
    except academic_service.ModuleNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except academic_service.ScheduleConflictError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get(
    "/timetable",
    response_model=list[TimetableSlotResponse],
    status_code=status.HTTP_200_OK,
)
async def list_timetable(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Weekly timetable for the authenticated user (sorted day, then start)."""
    return academic_service.get_user_timetable(db=db, user_id=current_user.id)


@router.post(
    "/tasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_task(
    task_in: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a new assignment, exam, test, or quiz."""
    try:
        return academic_service.create_task(
            db=db, user_id=current_user.id, task_in=task_in
        )
    except academic_service.ModuleNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get(
    "/tasks",
    response_model=PaginatedResponse[TaskResponse],
    status_code=status.HTTP_200_OK,
)
async def list_tasks(
    page: int = Query(default=1, ge=1, description="Page number"),
    size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    module_id: uuid.UUID | None = Query(default=None),
    is_completed: bool | None = Query(default=None),
    priority: TaskPriority | None = Query(default=None),
    task_type: TaskType | None = Query(default=None),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Paginated, filterable task list for the authenticated user."""
    return academic_service.get_user_tasks_paginated(
        db=db,
        user_id=current_user.id,
        page=page,
        size=size,
        module_id=module_id,
        is_completed=is_completed,
        priority=priority,
        task_type=task_type,
        from_date=from_date,
        to_date=to_date,
    )


@router.patch(
    "/tasks/{task_id}/complete",
    response_model=TaskResponse,
    status_code=status.HTTP_200_OK,
)
async def update_task_status(
    task_id: uuid.UUID,
    status_in: TaskUpdateStatus,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update the completion status of a task (sets/clears completed_at)."""
    try:
        return academic_service.update_task_completion(
            db=db,
            user_id=current_user.id,
            task_id=task_id,
            is_completed=status_in.is_completed,
        )
    except academic_service.TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

