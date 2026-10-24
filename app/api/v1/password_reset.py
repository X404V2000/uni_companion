"""app/api/v1/password_reset.py

PURPOSE
-------
Password recovery. Two endpoints with deliberately different audiences:

  POST /password-reset/issue     ADMIN ONLY - issue a one-time token for a student
  POST /password-reset/complete  PUBLIC - redeem a token and set a new password

WHY ISSUING IS ADMIN-ONLY
-------------------------
There is no email delivery yet, so the token is handed over by a human. If any
authenticated user could mint a token for any account, the "admin-only" part of
that sentence would be a formality and every student could reset every other
student's password. The role gate is the whole security boundary here, so it is
enforced with `require_role`, not checked in the body of the function.

WHY COMPLETING IS PUBLIC
------------------------
The student is locked out. They cannot authenticate, so the endpoint cannot
require a token of the normal kind - the reset token IS their credential, which
is why it is single-use, hashed at rest, and expires in 30 minutes.

WHY BOTH FAILURES RETURN THE SAME MESSAGE
-----------------------------------------
"Invalid, used, or expired" is one sentence for three causes. Distinguishing them
would tell a guesser which of their attempts was closest, and the student cannot
act on the difference anyway: the fix is always "ask for a fresh token".
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.rate_limiter import limiter
from app.core.roles import UserRole
from app.core.security import hash_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.password_reset import (
    ResetCompleteRequest,
    ResetCompleteResponse,
    ResetTokenIssued,
    ResetTokenRequest,
)
from app.services import password_reset_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/password-reset", tags=["Password reset"])

# One message for every refusal, by design - see the module docstring.
INVALID_TOKEN_DETAIL = (
    "That recovery link is not valid, has already been used, or has expired. "
    "Ask for a new one."
)


@router.post(
    "/issue",
    response_model=ResetTokenIssued,
    status_code=status.HTTP_201_CREATED,
    summary="Admin: issue a one-time recovery token for a student",
)
@limiter.limit("20/minute")
def issue_reset_token(
    request: Request,
    payload: ResetTokenRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role([UserRole.ADMIN, UserRole.SUPERUSER])),
) -> ResetTokenIssued:
    email = payload.email.strip().lower()
    student = (
        db.query(User)
        .filter(User.email == email, User.is_active.is_(True))
        .first()
    )
    if student is None:
        # This endpoint is admin-only, so naming the miss does not help an
        # attacker - the admin can only reach it with a privileged session.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active account with that email address.",
        )

    raw = password_reset_service.issue_token(db, student, created_by=admin.id)
    logger.info("admin %s issued a reset token for user %s", admin.id, student.id)
    return ResetTokenIssued(
        token=raw,
        expires_in_minutes=password_reset_service.TOKEN_LIFETIME_MINUTES,
        student_email=student.email,
        student_name=student.full_name,
    )


@router.post(
    "/complete",
    response_model=ResetCompleteResponse,
    status_code=status.HTTP_200_OK,
    summary="Redeem a recovery token and set a new password",
)
@limiter.limit("10/minute")
def complete_reset(
    request: Request,
    payload: ResetCompleteRequest,
    db: Session = Depends(get_db),
) -> ResetCompleteResponse:
    row = password_reset_service.validate_token(db, payload.token)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_TOKEN_DETAIL
        )

    password_reset_service.consume(db, row, hash_password(payload.new_password))
    return ResetCompleteResponse()
