"""
core/security.py

PURPOSE
-------
Centralized security primitives for password handling and JWT operations.
Every security-critical operation (hashing, verification, token generation)
lives here so there's ONE place to audit and update.

SECURITY DECISIONS:
1. bcrypt for hashing - deliberately slow, industry-standard
   - Includes per-password random salt (defends against rainbow tables)
   - Work factor 12 = ~250ms per hash (attacker can only try ~4/sec)
2. Timing-safe comparison - constant-time string comparison
   - Prevents timing attacks where measuring response time reveals
     partial password matches
3. JWT (JSON Web Tokens) for stateless authentication
   - HS256 signing (symmetric key, fast, secure)
   - Short-lived tokens (15 min) to limit damage from token theft
   - Claims contain ONLY user_id (sub claim) - no PII in token
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt

from app.core.config import settings

# Work factor for bcrypt. Higher = slower = more secure.
BCRYPT_ROUNDS = 12


# ---------------------------------------------------------------------------
# PASSWORD HASHING
# ---------------------------------------------------------------------------

def hash_password(plain_password: str) -> str:
    """
    Hash a plain password using bcrypt.

    SECURITY:
    - bcrypt automatically generates a random salt per password
    - Returns a string like: $2b$12$[22-char-salt][31-char-hash]
    - The salt and work factor are embedded in the output

    NEVER log the input or output of this function.
    """
    password_bytes = plain_password.encode("utf-8")
    hashed = bcrypt.hashpw(password_bytes, bcrypt.gensalt(rounds=BCRYPT_ROUNDS))
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain password against a stored hash.

    SECURITY:
    - Uses bcrypt's built-in timing-safe comparison
    - Returns True/False without revealing WHY verification failed
    - This function is used during LOGIN only

    TIMING ATTACK DEFENSE:
    Even if the user doesn't exist in our DB, we should still run
    this function with a dummy hash to ensure constant response time.
    """
    try:
        password_bytes = plain_password.encode("utf-8")
        hashed_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except (ValueError, TypeError):
        # If the stored hash is invalid/malformed, fail closed
        return False


# A pre-computed hash of a random string, used for timing-attack defense.
# When a user tries to login with a non-existent email, we still perform
# a bcrypt comparison (against this dummy hash) so the response time is
# identical to a real login attempt, making user enumeration impossible.
DUMMY_HASH = hash_password("timing-attack-defense-placeholder")


# ---------------------------------------------------------------------------
# JWT (JSON WEB TOKEN) OPERATIONS
# ---------------------------------------------------------------------------

def create_access_token(subject: str | Any, expires_delta: timedelta = None) -> str:
    """
    Create a signed JWT access token.

    SECURITY:
    - Claims contain ONLY the user_id (sub) - no PII (email, name) in token
    - Short expiration (default 15 min from settings.jwt_access_token_expire_minutes)
    - HS256 algorithm signed with jwt_secret_key
    - "sub" claim is the standard for subject in JWT
    - "iat" (issued_at) is set explicitly (PyJWT does not auto-add it)
    - "exp" (expiration) is set explicitly

    POPIA:
    - By excluding PII from token payload, we minimize data exposure
      if a token is stolen or decoded.
    """
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(
            minutes=settings.jwt_access_token_expire_minutes
        )

    current_time = datetime.now(UTC)
    to_encode = {
        "exp": expire,
        "iat": current_time,       # issued-at: PyJWT does NOT auto-add it
        "sub": str(subject),
    }

    encoded_jwt = jwt.encode(
        to_encode,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    return encoded_jwt


def decode_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a JWT token.

    SECURITY:
    - Uses jwt_secret_key to verify signature (rejects tampered tokens)
    - Automatically validates 'exp' claim (rejects expired tokens)
    - Raises jwt.PyJWTError subclasses on failures:
      - jwt.ExpiredSignatureError: token is past expiration
      - jwt.InvalidTokenError: bad signature/format

    Caller is responsible for catching these exceptions and
    responding with appropriate HTTP 401/403 errors.
    """
    payload = jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
    )
    return payload

