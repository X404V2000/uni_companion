"""
tests/test_academic_models.py

ORM + constraint tests for the Week 3 academic domain models:

- Cascade: deleting a User purges linked modules/slots/tasks.
- Unique module code per user (same-user dup -> IntegrityError; different
  users may share a code).
- day_of_week CHECK (1..7) enforced.
- task_type / priority CHECK enforced.
"""
from datetime import UTC, time

import pytest
from conftest import PASSWORD, unique_email
from sqlalchemy.exc import IntegrityError

from app.models.academic import AcademicTask, Module, TimetableSlot
from app.models.user import User
from app.schemas.user import UserCreate
from app.services import user_service


def _make_user(db) -> User:
    data = UserCreate(
        email=unique_email("acad"),
        password=PASSWORD,
        full_name="Acad User",
        terms_version="1.0",
        privacy_version="1.0",
    )
    return user_service.create_user(db, data)


def _make_module(db, user, code="INF315") -> Module:
    m = Module(user_id=user.id, code=code, name="Systems Analysis")
    db.add(m)
    db.commit()
    return m


class TestCascadeDelete:
    def test_user_deletion_purges_academic_rows(self, db):
        user = _make_user(db)
        m = _make_module(db, user)

        slot = TimetableSlot(
            user_id=user.id,
            module_id=m.id,
            day_of_week=1,
            start_time=time(9, 0),
            end_time=time(10, 0),
        )
        task = AcademicTask(
            user_id=user.id,
            module_id=m.id,
            title="Assignment 1",
            due_date=None,  # placeholder; replaced below
        )
        from datetime import datetime
        task.due_date = datetime.now(UTC)
        db.add_all([slot, task])
        db.commit()
        mid, sid, tid = m.id, slot.id, task.id

        # Delete the user -> CASCADE removes all academic rows.
        db.delete(user)
        db.commit()

        assert db.query(Module).filter(Module.id == mid).count() == 0
        assert db.query(TimetableSlot).filter(TimetableSlot.id == sid).count() == 0
        assert db.query(AcademicTask).filter(AcademicTask.id == tid).count() == 0


class TestUniqueModuleCode:
    def test_duplicate_code_same_user_raises(self, db):
        user = _make_user(db)
        _make_module(db, user, code="INF315")
        dup = Module(user_id=user.id, code="INF315", name="Dup")
        db.add(dup)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_same_code_different_users_ok(self, db):
        u1 = _make_user(db)
        u2 = _make_user(db)
        _make_module(db, u1, code="INF315")
        _make_module(db, u2, code="INF315")  # no error expected
        # Each user has exactly one INF315 module (shared code, distinct owners).
        assert db.query(Module).filter(Module.user_id == u1.id).count() == 1
        assert db.query(Module).filter(Module.user_id == u2.id).count() == 1


class TestConstraints:
    def test_day_of_week_check(self, db):
        user = _make_user(db)
        m = _make_module(db, user)
        bad = TimetableSlot(
            user_id=user.id,
            module_id=m.id,
            day_of_week=9,
            start_time=time(9, 0),
            end_time=time(10, 0),
        )
        db.add(bad)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_task_type_and_priority_check(self, db):
        user = _make_user(db)
        m = _make_module(db, user)
        from datetime import datetime

        bad = AcademicTask(
            user_id=user.id,
            module_id=m.id,
            title="X",
            task_type="HACK",
            priority="NUCLEAR",
            due_date=datetime.now(UTC),
        )
        db.add(bad)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
