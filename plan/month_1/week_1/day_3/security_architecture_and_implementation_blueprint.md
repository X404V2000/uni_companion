# Senior Security Architecture & Implementation Blueprint: Day 3 (Signup & POPIA Core)

**Role:** Principal Security Architect & Lead Systems Engineer  
**Project:** Varsity Companion API  
**Target:** Day 3 — Secure Registration, Threat Protection & POPIA Compliance  
**Budget Constraints:** Free Tier primary, max monthly spend < R100 (~$5.50 USD)

---

## SECTION 1: Threat Model & Attack Vector Analysis (Signup Context)

When exposing an unauthenticated `/signup` endpoint, it instantly becomes the primary target for malicious automated tools, botnets, and bad actors. Below is our threat matrix for Day 3 and how we mitigate each attack vector.

| Threat / Attack Vector | Risk Level | Impact | Defense Strategy |
| :--- | :--- | :--- | :--- |
| **Cross-Site Scripting (XSS)** | **HIGH** | Execution of arbitrary JS in victim's browser via injected profile fields (`full_name`, `university`). | 1. Input sanitization (Pydantic HTML entity escaping/stripping).<br>2. Output escaping in API serialization.<br>3. Strict CSP headers (`default-src 'none'`).<br>4. JSON-only payloads (never HTML/form-encoded). |
| **SQL Injection (SQLi)** | **CRITICAL** | DB compromise, unauthorized data exfiltration. | 1. Parameterized queries exclusively via SQLAlchemy 2.0 ORM.<br>2. Zero raw SQL string concatenation.<br>3. Strict type validation via Pydantic. |
| **Account Enumeration / Timing Attacks** | **MEDIUM** | Attacker probes which student emails are registered. | 1. Uniform error response structure for existing vs. new accounts.<br>2. Constant-time operations on duplicate checks.<br>3. Rate limiting per IP and email. |
| **Mass Registration / Bot Floods (DoS)** | **HIGH** | DB resource exhaustion, Neon compute quota depletion. | 1. Strict route-level rate limiting (e.g., 5 requests/min per IP).<br>2. Payload size limits (10 KB max request body).<br>3. Cloudflare Free Tier WAF & Bot Fight Mode. |
| **Parameter Tampering / Privilege Escalation** | **CRITICAL** | User injects `is_active=True`, `role="admin"`, or bypasses consent. | 1. Schema Isolation: `UserCreate` schema *strictly whitelists* input fields.<br>2. Internal status fields set strictly server-side.<br>3. Consent version strict matching against `CURRENT_*_VERSION`. |
| **Race Conditions (Double Submit)** | **MEDIUM** | Duplicate database entries created simultaneously. | 1. Postgres `UNIQUE` constraint on lowercased `email`.<br>2. Atomic DB transaction boundaries (`try/except IntegrityError`). |
| **Information Disclosure (Stack Trace Leaks)** | **HIGH** | Internal DB schema or file path leaks in 500 errors. | 1. Global exception handler catching unhandled errors.<br>2. Return generic `500 Internal Server Error` with Correlation ID in non-dev envs. |

---

## SECTION 2: Zero-Budget (< R100/mo) Security Infrastructure Strategy

To maintain enterprise-grade security without high monthly cloud bills:

```
                      +-----------------------------------+
                      |      Client / Browser / App       |
                      +-----------------------------------+
                                        |
                                        v
                      +-----------------------------------+
                      |       Cloudflare (FREE TIER)      |
                      | - Free SSL/TLS Termination        |
                      | - Anti-DDoS & Bot Fight Mode      |
                      | - Custom WAF Rules (Geo/IP)       |
                      | - Headers & Rate Limiting Rules   |
                      +-----------------------------------+
                                        |
                                        v
                      +-----------------------------------+
                      |    FastAPI Server (Render / Hetzner) |
                      | - Slowapi Rate Limiter            |
                      | - Pydantic Input Escaping         |
                      | - Security Headers Middleware     |
                      +-----------------------------------+
                                        |
                                        v
                      +-----------------------------------+
                      |   Neon Postgres DB (FREE TIER)    |
                      | - SSL Required Connection         |
                      | - Encrypted at Rest & in Transit  |
                      +-----------------------------------+
```

1. **Cloudflare Free Tier (R0)**:
   - Sets up free DNS, SSL/TLS encryption (TLS 1.3), automated DDoS mitigation, and Cloudflare's **Bot Fight Mode**.
   - Blocks automated submission scripts before they ever hit your FastAPI server or Neon DB.
2. **Neon Postgres Free Tier (R0)**:
   - Enforces SSL/TLS (`sslmode=require`) in connection strings.
   - Encrypted at rest; data stored securely in isolated tenant compute.
3. **App Hosting Options (R0 to ~R80/mo)**:
   - **Option A (R0)**: Render / Railway / Render Free Tiers or Fly.io free quota.
   - **Option B (~R80/mo)**: Hetzner Cloud CX22 VPS (€3.79/mo ≈ R75-R85/mo) for dedicated, predictable compute without cold starts.
4. **Email Delivery (R0)**:
   - **Resend** or **Brevo** (Sendinblue) Free Tier: 100–300 transactional emails per day at R0. Perfect for account verification / welcome emails.

---

## SECTION 3: Step-by-Step Day 3 Security Implementation Plan

Here is the exact step-by-step implementation plan for Day 3.

```
DAY 3 SIGNUP PIPELINE
=====================
[ Incoming Request ]
        │
        ▼
1. Size & Type Verification Middleware (Max 10KB, Application/JSON)
        │
        ▼
2. Rate Limiting Check (5 requests / min per IP)
        │
        ▼
3. Pydantic Schema Validation & Sanitization
   ├── Email Lowercasing & Trimming
   ├── XSS HTML Sanitization on `full_name`, `university`, `field_of_study`
   ├── Password Length Check (8 - 128 chars)
   └── Strict Consent Version Matching (terms == 1.0, privacy == 1.0)
        │
        ▼
4. Service Layer Execution
   ├── DB Query: Check email existence
   ├── Password Hashing: bcrypt (work factor = 12)
   └── DB Insert: Atomic transaction with `IntegrityError` handling
        │
        ▼
5. Output Scrubbing & Audit Response
   └── Return `UserResponse` schema (EXCLUDES hashed_password, internal flags)
```

---

## SECTION 4: Code Implementation Specifications

Let's build the complete, hardened implementation for Day 3 across 4 primary components:

### Component 1: XSS & HTML Sanitization Utility (`app/core/sanitizer.py`)

Create a dedicated input sanitizer to strip dangerous HTML tags and script execution patterns from string fields before storing them in Postgres.

```python app/core/sanitizer.py
"""
app/core/sanitizer.py

PURPOSE:
Provides strict string sanitization against Cross-Site Scripting (XSS),
HTML injection, and control character attacks.

SECURITY DECISIONS:
- Strips all HTML tags from user-supplied text inputs (names, fields of study).
- Converts special characters into HTML entities where needed.
- Rejects inputs containing embedded null bytes or control characters.
"""

import re
import html

# Regex matching any HTML tag (<script>, <iframe>, <img> with onerror, etc.)
HTML_TAG_REGEX = re.compile(r"<[^>]*?>")

# Regex matching dangerous control characters except standard whitespace
CONTROL_CHAR_REGEX = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")


def sanitize_string(value: str | None) -> str | None:
    """
    Sanitizes user input strings to eradicate XSS payloads.
    
    1. Removes null bytes and dangerous control characters.
    2. Strips HTML tags.
    3. Trims whitespace.
    4. HTML-escapes remaining characters (&, <, >, ", ').
    """
    if value is None:
        return None
    
    # 1. Remove control characters & null bytes
    cleaned = CONTROL_CHAR_REGEX.sub("", value)
    
    # 2. Strip all HTML tags
    cleaned = HTML_TAG_REGEX.sub("", cleaned)
    
    # 3. Strip leading/trailing whitespace
    cleaned = cleaned.strip()
    
    # 4. Escape any remaining HTML characters
    cleaned = html.escape(cleaned, quote=True)
    
    return cleaned
```

---

### Component 2: Hardened Pydantic Schema (`app/schemas/user.py`)

Update `app/schemas/user.py` to enforce sanitization and strict consent validation.

```python app/schemas/user.py
"""
app/schemas/user.py

PURPOSE:
Defines strict Pydantic schemas for User registration and responses.

SECURITY FEATURES:
- Automatic XSS sanitization on all string fields.
- Email normalization (lowercased & trimmed).
- NIST-compliant password length limits (8 - 128 chars).
- Strict validation of legal consent versions.
- Whitelist-only inputs (prevents parameter pollution & privilege escalation).
"""

import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.sanitizer import sanitize_string
from app.core.legal import CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION


class UserCreate(BaseModel):
    """
    Schema for user signup requests.
    """
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=255)

    # Optional profile fields
    university: Optional[str] = Field(default=None, max_length=255)
    field_of_study: Optional[str] = Field(default=None, max_length=255)
    year_of_study: Optional[int] = Field(default=None, ge=1, le=10)

    # Legal consent inputs
    terms_version: str = Field(..., min_length=1, max_length=20)
    privacy_version: str = Field(..., min_length=1, max_length=20)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        """Normalizes email address to prevent duplicate account spoofing."""
        return v.strip().lower()

    @field_validator("full_name", "university", "field_of_study")
    @classmethod
    def sanitize_text_fields(cls, v: Optional[str]) -> Optional[str]:
        """Applies XSS sanitization to user text inputs."""
        if v is None:
            return None
        sanitized = sanitize_string(v)
        if not sanitized and v:
            raise ValueError("Invalid characters detected in input")
        return sanitized

    @field_validator("terms_version")
    @classmethod
    def validate_terms_version(cls, v: str) -> str:
        """Verifies the submitted Terms version matches current requirement."""
        clean_v = v.strip()
        if clean_v != CURRENT_TERMS_VERSION:
            raise ValueError(f"Terms version must be '{CURRENT_TERMS_VERSION}'. Please accept current terms.")
        return clean_v

    @field_validator("privacy_version")
    @classmethod
    def validate_privacy_version(cls, v: str) -> str:
        """Verifies the submitted Privacy Policy version matches current requirement."""
        clean_v = v.strip()
        if clean_v != CURRENT_PRIVACY_VERSION:
            raise ValueError(f"Privacy Policy version must be '{CURRENT_PRIVACY_VERSION}'. Please accept current privacy policy.")
        return clean_v


class UserResponse(BaseModel):
    """
    Schema returned to client upon successful registration.
    Excludes sensitive fields (hashed_password, consent flags).
    """
    id: uuid.UUID
    email: EmailStr
    full_name: str
    university: Optional[str] = None
    field_of_study: Optional[str] = None
    year_of_study: Optional[int] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
```

---

### Component 3: Registration Service & Router (`app/api/v1/auth.py`)

Create the authentication router with route-level rate limiting, database uniqueness checks, and secure user creation.

```python app/api/v1/auth.py
"""
app/api/v1/auth.py

PURPOSE:
Authentication & Onboarding endpoints (Signup, Login).

SECURITY IMPLEMENTATIONS:
- Dedicated Rate Limiter (5 requests per minute per IP on /signup).
- Atomic DB Transaction to prevent race conditions on email collision.
- Timing-attack resistant responses.
- Explicit status code 201 Created.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.schemas.user import UserCreate, UserResponse
from app.models.user import User
from app.core.security import hash_password, DUMMY_HASH, verify_password
from app.core.config import settings

# Route module router
router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/signup",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new student account",
    description="Registers a user, hashes password via bcrypt, records POPIA legal consent."
)
async def signup(
    request: Request,
    user_in: UserCreate,
    db: Session = Depends(get_db)
):
    """
    Handles user signup with comprehensive security checks:
    1. Check for existing email registered in DB.
    2. Hash password with bcrypt (work factor 12).
    3. Create user record with POPIA consent attributes.
    4. Commit safely; catch race-condition duplicate inserts via IntegrityError.
    """
    # 1. Email Uniqueness Check
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        # Prevent Account Enumeration while giving actionable feedback
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists."
        )

    # 2. Cryptographic Password Hashing
    hashed_pwd = hash_password(user_in.password)

    # 3. Construct DB Model Instance
    new_user = User(
        email=user_in.email,
        hashed_password=hashed_pwd,
        full_name=user_in.full_name,
        university=user_in.university,
        field_of_study=user_in.field_of_study,
        year_of_study=
