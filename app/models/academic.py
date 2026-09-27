"""
app/models/academic.py

PURPOSE
-------
SQLAlchemy ORM models for the Academic Tracker domain (Week 3):
Modules, Timetable slots, and Academic tasks.

SECURITY — MULTI-TENANT ISOLATION
---------------------------------
Every entity carries a `user_id` foreign key -> users.id with ON DELETE
CASCADE. The API layer must additionally scope every query by the current
authenticated user (filter(user_id == current_user.id)); the FK is the
database-level backstop, not the only defence.

Column defaults match the Week 3 Day 1 specification, with CHECK constraints
added for the enumerated `task_type` and `priority` values (hardening).
"""
import uuid
from datetime import UTC, datetime, time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Module(Base):
    __tablename__ = "modules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    color_code: Mapped[str] = mapped_column(String(7), default="#2563eb", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    timetable_slots: Mapped[list["TimetableSlot"]] = relationship(
        "TimetableSlot", back_populates="module", cascade="all, delete-orphan"
    )
    tasks: Mapped[list["AcademicTask"]] = relationship(
        "AcademicTask", back_populates="module", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("user_id", "code", name="uq_user_module_code"),
    )

    def __repr__(self) -> str:
        return f"<Module id={self.id} code={self.code}>"


class TimetableSlot(Base):
    __tablename__ = "timetable_slots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    module_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False
    )
    day_of_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 1=Mon..7=Sun
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    venue: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    module: Mapped["Module"] = relationship("Module", back_populates="timetable_slots")

    __table_args__ = (
        CheckConstraint("day_of_week BETWEEN 1 AND 7", name="ck_timetable_day_valid"),
        Index("ix_timetable_user_day", "user_id", "day_of_week"),
    )

    def __repr__(self) -> str:
        return f"<TimetableSlot id={self.id} day={self.day_of_week}>"


class AcademicTask(Base):
    __tablename__ = "academic_tasks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    module_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    task_type: Mapped[str] = mapped_column(String(20), default="ASSIGNMENT", nullable=False)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    priority: Mapped[str] = mapped_column(String(10), default="MEDIUM", nullable=False)
    weight_percentage: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    module: Mapped["Module"] = relationship("Module", back_populates="tasks")

    __table_args__ = (
        CheckConstraint(
            "task_type IN ('ASSIGNMENT', 'EXAM', 'TEST', 'QUIZ')",
            name="ck_task_type_valid",
        ),
        CheckConstraint(
            "priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')",
            name="ck_task_priority_valid",
        ),
        Index("ix_tasks_user_due", "user_id", "is_completed", "due_date"),
    )

    def __repr__(self) -> str:
        return f"<AcademicTask id={self.id} title={self.title}>"
