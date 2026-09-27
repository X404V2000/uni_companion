"""
schemas/user.py

PURPOSE
-------
Defines the "shapes" of user-related data as it moves in and out of the
API. These are DIFFERENT from the SQLAlchemy model in models/user.py

    -   models/user.py describes what a user looks like INSIDE the database.
    -   schemas/user.py describes what a user looks like when talking to the
        OUTSIDE WORLD (an API request coming in, a JSON response going out).

WHY WE NEED BOTH, NOT JUST ONE
------------------------------
If we let API requests map directly onto the database model, a user
could theoretically submit fields they shouldn't be able to set, like
'is_active' or 'hashed_password', in a signup request. Pydantic schemas
act as a strict gatekeeper: only the fields explicitly declared below
are accepted or returned, nothing else gets through in either direction.

SECURITY: These schemas are our FIRST line of input validation.
- Malicious payloads never reach our database code
- Only explicitly declared fields are accepted (whitelist approach)
- Never echo back the password or internal fields
- XSS sanitization applied on all string fields (full_name, university,
  field_of_study) using our sanitizer utility
- Strict consent version validation matching against CURRENT versions
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.legal import CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION
from app.core.sanitizer import sanitize_string


class UserCreate(BaseModel):
    """
    Shape of the data required to sign up.

    SECURITY NOTES:
    - EmailStr validates email format before reaching our code
    - password: min_length=8 rejects weak passwords early
    - All string fields are XSS-sanitized (strip HTML tags/scripts)
    - terms_version and privacy_version are validated STRICTLY against
      CURRENT_*_VERSION constants - users cannot bypass consent by
      sending an arbitrary version string
    - No 'is_active', 'role', or any internal field is accepted here
    """

    email: EmailStr

    # Min 8 chars per NIST guidelines (no arbitrary complexity rules).
    # max_length=128 is a coarse DoS guard; the byte-length validator below
    # is the real security control because bcrypt silently truncates input
    # to its first 72 BYTES.
    password: str = Field(..., min_length=8, max_length=128)

    full_name: str = Field(..., min_length=1, max_length=255)

    # Optional academic fields (progressive profile completion)
    university: str | None = Field(default=None, max_length=255)
    field_of_study: str | None = Field(default=None, max_length=255)
    year_of_study: int | None = Field(default=None, ge=1, le=10)

    # Legal consent versions - client MUST provide these
    # They are STRICTLY validated to match current versions before proceeding
    terms_version: str = Field(..., min_length=1, max_length=20)
    privacy_version: str = Field(..., min_length=1, max_length=20)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        """
        SECURITY: Normalize email to lowercase + trim whitespace.

        Prevents:
        - Duplicate accounts: "User@gmail.com" vs "user@gmail.com"
        - Lookalike attacks using mixed case
        - Database uniqueness enforcement becomes reliable
        """
        return value.strip().lower()

    @field_validator("password")
    @classmethod
    def enforce_bcrypt_byte_limit(cls, value: str) -> str:
        """
        SECURITY: Enforce bcrypt's 72-byte hard limit explicitly.

        bcrypt (via passlib/bcrypt) silently ignores everything after the
        first 72 BYTES of input. Without this check, two different
        passwords that share their first 72 bytes (e.g. extremely long
        unicode passwords) would authenticate identically — a real weakness.
        We reject the input up-front so the developer never relies on a
        silent truncation that could weaken credential strength.
        """
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password is too long for the hashing algorithm.")
        return value

    @field_validator("full_name", "university", "field_of_study")
    @classmethod
    def sanitize_text_fields(cls, value: str | None) -> str | None:
        """
        SECURITY: XSS sanitization on all user text inputs.

        Uses our sanitizer to:
        - Remove control characters (null bytes, escape sequences)
        - Strip HTML tags (<script>, <img onerror=...>, etc.)
        - Trim whitespace
        - HTML-escape remaining dangerous characters

        Rejects input if sanitization removes all content (means the
        field was nothing but HTML tags/malicious content).
        """
        if value is None:
            return None

        sanitized = sanitize_string(value)
        if not sanitized and value:
            raise ValueError("Invalid characters detected in input")
        return sanitized

    @field_validator("terms_version")
    @classmethod
    def validate_terms_version(cls, value: str) -> str:
        """
        SECURITY COMPLIANCE: Strictly verifies submitted Terms version
        matches CURRENT_TERMS_VERSION from app/core/legal.py.

        This prevents:
        - A user bypassing updated terms by sending an old version
        - Unauthorized "consent" to non-existent policy versions

        POPIA: Consent must be specific, informed, and unambiguous.
        If they haven't accepted the CURRENT terms, they cannot sign up.
        """
        clean_v = value.strip()
        if clean_v != CURRENT_TERMS_VERSION:
            raise ValueError(
                f"Terms version must be '{CURRENT_TERMS_VERSION}'. "
                "Please accept the current terms of service."
            )
        return clean_v

    @field_validator("privacy_version")
    @classmethod
    def validate_privacy_version(cls, value: str) -> str:
        """
        SECURITY COMPLIANCE: Strictly verifies submitted Privacy Policy
        version matches CURRENT_PRIVACY_VERSION from app/core/legal.py.

        Same rationale as terms_version above.
        """
        clean_v = value.strip()
        if clean_v != CURRENT_PRIVACY_VERSION:
            raise ValueError(
                f"Privacy Policy version must be '{CURRENT_PRIVACY_VERSION}'. "
                "Please accept the current privacy policy."
            )
        return clean_v


class UserResponse(BaseModel):
    """
    Shape of the data sent BACK to the client after signup/login.

    SECURITY:
    - Deliberately EXCLUDES hashed_password entirely
    - Deliberately EXCLUDES consent version metadata (internal compliance data)
    - Only exposes fields the frontend actually needs
    """

    id: uuid.UUID
    email: EmailStr
    full_name: str
    university: str | None = None
    field_of_study: str | None = None
    year_of_study: int | None = None
    is_active: bool
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}
