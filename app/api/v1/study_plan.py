"""app/api/v1/study_plan.py

PURPOSE
-------
GET /api/v1/study-plan: how much work this week, and what to start with.

READ-ONLY BY DESIGN
-------------------
This endpoint only reads the student's existing tasks. It writes nothing and
needs no table, so the worst a bug here can do is show a wrong number - it cannot
lose a deadline. That is why it was built after the bursary feature, which
carried schema risk: this one carries none.
"""
from datetime import date

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rate_limiter import limiter
from app.db.session import get_db
from app.models.academic import AcademicTask, Module
from app.models.user import User
from app.schemas.study_plan import PlanTask, StudyPlan
from app.services import study_plan_service

router = APIRouter(prefix="/study-plan", tags=["Study plan"])


@router.get(
    "",
    response_model=StudyPlan,
    summary="This week's workload and what to start with",
    description=(
        "Totals the estimated hours of assessments due in the next seven days "
        "and ranks the top three to start. Estimates are stated in "
        "`assumption_note` so the student can judge them. Reads only."
    ),
)
@limiter.limit("30/minute")
def get_study_plan(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StudyPlan:
    tasks = (
        db.query(AcademicTask)
        .filter(
            AcademicTask.user_id == current_user.id,
            AcademicTask.is_completed.is_(False),
        )
        .all()
    )
    # Module codes for the focus rows. One query for the codes actually used,
    # rather than a join per task.
    module_ids = {t.module_id for t in tasks}
    codes = {
        m.id: m.code
        for m in db.query(Module).filter(Module.id.in_(module_ids)).all()
    } if module_ids else {}

    plan = study_plan_service.build_plan(tasks, date.today())

    return StudyPlan(
        week_days=plan["week_days"],
        task_count=plan["task_count"],
        total_hours=plan["total_hours"],
        assumption_note=plan["assumption_note"],
        focus=[
            PlanTask(
                id=p.task.id,
                title=p.task.title,
                module_code=codes.get(p.task.module_id),
                task_type=p.task.task_type,
                due_on=p.task.due_date.date(),
                days_left=p.days_left,
                weight_percentage=(
                    float(p.task.weight_percentage)
                    if p.task.weight_percentage is not None
                    else None
                ),
                estimated_hours=p.hours,
                reason=p.reason,
            )
            for p in plan["focus"]
        ],
    )
