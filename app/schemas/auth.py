"""
schemas/auth.py

PURPOSE
-------
Pydantic schemas for authentication endpoints.

SECURITY NOTES:
- LoginRequest accepts only email + password (strict whitelist)
- TokenResponse schema for API clients that cannot use cookies
  (mobile apps, external integrations)
- For browser-based clients, the token is delivered via
  HttpOnly cookie and this body schema isn't used
"""

from pydantic import BaseModel, EmailStr, Field, field_validator


class LoginRequest(BaseModel):
    """
    Shape of the login request body.

    SECURITY:
    - Only email + password accepted (anything else gets dropped)
    - EmailStr validates email format
    - The byte-length validator guarantees the submitted password fits
      within bcrypt's 72-byte limit (see enforce_bcrypt_byte_limit) so no
      silent truncation can weaken or confuse credential verification.
    """
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        """Normalize email to lowercase + trimmed, consistent with signup."""
        return value.strip().lower()

    @field_validator("password")
    @classmethod
    def enforce_bcrypt_byte_limit(cls, value: str) -> str:
        """Reject passwords exceeding bcrypt's 72-byte limit (see signup schema)."""
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password is too long for the hashing algorithm.")
        return value


class TokenResponse(BaseModel):
    """
    Response schema when returning a raw token (non-cookie clients).
    Used by API/mobile clients that can't handle httpOnly cookies.
    """
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(
        default=900,
        description="Token lifetime in seconds (15 minutes)"
    )


class AccountDeleteRequest(BaseModel):
    """
    Shape of the body for account deletion (POPIA right-to-delete).

    SECURITY:
    - Requires the current password so a stolen/left-open session alone
      cannot irreversibly deactivate an account.
    - Same bcrypt 72-byte guard as login/signup to prevent silent truncation
      weakening credential checks.
    """
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("password")
    @classmethod
    def enforce_bcrypt_byte_limit(cls, value: str) -> str:
        """Reject passwords exceeding bcrypt's 72-byte limit."""
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password is too long for the hashing algorithm.")
        return value
