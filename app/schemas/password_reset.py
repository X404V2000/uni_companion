"""app/schemas/password_reset.py

Pydantic shapes for password recovery.

WHY THE PUBLIC RESPONSE SAYS NOTHING ABOUT THE TOKEN
----------------------------------------------------
`ResetCompleteResponse` carries no account details. After a successful reset the
student signs in again; the endpoint that reset the password must not also hand
back a session or an identity, or a leaked token would be a full account takeover
in one request instead of requiring the password they just set.
"""
from pydantic import BaseModel, Field


class ResetTokenRequest(BaseModel):
    """Admin: issue a token for a student by email."""

    email: str = Field(..., max_length=254)


class ResetTokenIssued(BaseModel):
    # Returned ONCE. It is not stored in raw form and cannot be shown again.
    token: str
    expires_in_minutes: int
    # Shown to the admin so they can confirm they targeted the right account.
    student_email: str
    student_name: str


class ResetCompleteRequest(BaseModel):
    token: str = Field(..., max_length=512)
    new_password: str = Field(..., min_length=8, max_length=128)


class ResetCompleteResponse(BaseModel):
    detail: str = "Password updated. You can sign in with your new password."
