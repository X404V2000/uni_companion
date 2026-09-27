"""app/services/sync_service.py

PURPOSE
-------
Offline sync engine (Month 2, Week 1, Day 3): applies client-side offline
changes to the cloud and returns deltas since a client's last sync.

SECURITY / SCALE GUARANTEES
---------------------------
- TENANT ISOLATION (both directions):
    * Push: an item whose id already exists under a DIFFERENT user is rejected
      (403-style error upstream) rather than overwritten — client-supplied
      UUIDs can collide, so we never let one user clobber another's row.
    * Pull: every query is user-scoped.
- MODULE OWNERSHIP: a task/slot referencing module_id is only accepted if that
  module belongs to the same user (prevents cross-tenant FK smuggling).
- LAST-WRITE-WINS: an incoming item only overwrites the DB row when its
  updated_at is NEWER. All items in one batch live in ONE transaction — no
  partial sync state on error.
- BATCH BOUNDS: each list is capped (<=100) by the schema; processing is O(B)
  for B items, each lookup O(log N) via PK/index.
"""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import TypeVar

from sqlalchemy.orm import Session

from app.models.academic import AcademicTask, Module, TimetableSlot

logger = logging.getLogger(__name__)

Model = TypeVar("Model")


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _owned_module_ids(db: Session, user_id: uuid.UUID) -> set[uuid.UUID]:
    """The set of module ids this user owns (for FK-ownership validation)."""
    rows = db.query(Module.id).filter(Module.user_id == user_id).all()
    return {r[0] for r in rows}


def _apply_lww(db, user_id, item, model, owned_modules):
    """Apply one LWW upsert. Returns True if a change was applied, False if the
    incoming item was older (ignored). Raises ValueError on tenant violation."""
    existing = (
        db.query(model).filter(model.id == item.id).first()
    )
    if existing is not None and existing.user_id != user_id:
        # Another user owns this id — never touch it (offline UUID collision).
        raise ValueError(f"{model.__name__} id belongs to another user")

    # FK ownership guard: task/slot must point at the caller's own module.
    module_id = getattr(item, "module_id", None)
    if module_id is not None and module_id not in owned_modules:
        raise ValueError("module_id does not belong to the caller")

    if existing is not None:
        if item.updated_at > existing.updated_at:
            _update_fields(existing, item)
            return True
        return False  # LWW: older write is ignored

    # New offline-created item (client-supplied id).
    db.add(_build_new(model, user_id, item))
    return True


def _update_fields(existing, item) -> None:
    # Copy every user-editable field EXCEPT id/user_id/created_at.
    for field in ("title", "task_type", "due_date", "priority",
                  "weight_percentage", "is_completed", "completed_at",
                  "code", "name", "color_code", "day_of_week", "start_time",
                  "end_time", "venue"):
        if hasattr(item, field):
            setattr(existing, field, getattr(item, field))
    existing.updated_at = item.updated_at


def _build_new(model, user_id, item):
    kwargs = {"id": item.id, "user_id": user_id}
    for field in ("module_id", "title", "task_type", "due_date", "priority",
                  "weight_percentage", "is_completed", "completed_at",
                  "code", "name", "color_code", "day_of_week", "start_time",
                  "end_time", "venue"):
        if hasattr(item, field):
            kwargs[field] = getattr(item, field)
    obj = model(**kwargs)
    obj.created_at = _utcnow()
    obj.updated_at = item.updated_at
    return obj


def process_sync_push(db: Session, user_id: uuid.UUID, push_data) -> dict:
    """Apply batch of offline changes with LWW + tenant/module guards."""
    owned_modules = _owned_module_ids(db, user_id)
    applied = 0
    ignored = 0

    # Order matters for FK: modules first, then slots/tasks that reference them.
    for item in push_data.modules:
        if _apply_lww(db, user_id, item, Module, owned_modules):
            applied += 1
            # A module sync item is self-owned; register it so later items can
            # reference it in the same batch.
            owned_modules.add(item.id)
        else:
            ignored += 1

    for item in push_data.timetable_slots:
        if _apply_lww(db, user_id, item, TimetableSlot, owned_modules):
            applied += 1
        else:
            ignored += 1

    for item in push_data.tasks:
        if _apply_lww(db, user_id, item, AcademicTask, owned_modules):
            applied += 1
        else:
            ignored += 1

    db.commit()
    return {"status": "success", "applied_changes": applied, "ignored_changes": ignored}


def process_sync_pull(db: Session, user_id: uuid.UUID, since: datetime | None) -> dict:
    """Return all user-scoped records modified strictly after `since`."""
    if since is not None and since.tzinfo is None:
        since = since.replace(tzinfo=UTC)

    def _changed(model):
        q = db.query(model).filter(model.user_id == user_id)
        if since is not None:
            q = q.filter(model.updated_at > since)
        return q.order_by(model.updated_at.asc()).all()

    return {
        "server_timestamp": _utcnow(),
        "tasks": _changed(AcademicTask),
        "modules": _changed(Module),
        "timetable_slots": _changed(TimetableSlot),
    }
