"""app/api/v1/dashboard.py

PURPOSE
-------
Unified academic dashboard endpoint (Month 2, Week 1, Day 4).

GET /api/v1/academic/dashboard — a single low-bandwidth snapshot for the
mobile home screen: today's schedule, top-5 urgent tasks, AI quota, and
registered-module count.
"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.dashboard import AcademicDashboardResponse, AtRiskResponse
from app.services import analytics_service, dashboard_service, risk_service

router = APIRouter(prefix="/academic", tags=["Academic Tracker Engine"])


@router.get(
    "/dashboard",
    response_model=AcademicDashboardResponse,
    status_code=status.HTTP_200_OK,
)
def get_academic_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the caller's unified daily academic status payload."""
    result = dashboard_service.get_student_dashboard(db=db, user_id=current_user.id)
    analytics_service.record_event(db, current_user.id, "DASHBOARD_VIEWED")
    return result


@router.get(
    "/at-risk",
    response_model=AtRiskResponse,
    status_code=status.HTTP_200_OK,
)
def get_at_risk_tasks(
    days: int = 14,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the caller's at-risk deadlines and workload signals.

    Pure heuristics (no LLM): deterministic, instant and free. `days` bounds the
    look-ahead window and is clamped by the service to 1..30.
    """
    return risk_service.get_at_risk(db=db, user_id=current_user.id, days=days)
