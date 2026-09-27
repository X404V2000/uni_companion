"""
app/api/deps.py

PURPOSE:
Shared FastAPI dependencies, primarily authentication/authorization
for protecting API routes.

SECURITY:
- get_current_user extracts JWT from the Authorization header, else the
  httpOnly cookie (explicit credential wins over the ambient one)
- Validates token signature & expiration
- Checks user is_active in DB on every request (revocation support)
- Returns 401 on any failure (never leaks WHY)
"""

from collections.abc import Iterable

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.roles import UserRole
from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User

# Cookie name for the access token
ACCESS_TOKEN_COOKIE_NAME = "access_token"


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """
    Extract and validate JWT, then load the corresponding User from DB.

    Extraction Strategy (explicit beats ambient):
    1. Use Authorization: Bearer <token> if present
    2. Otherwise fall back to the httpOnly "access_token" cookie

    Validation Pipeline:
    1. Decode token with jwt_secret_key (HS256)
    2. Verify exp claim (automatically by PyJWT)
    3. Extract "sub" claim (user_id)
    4. Query DB for user, verify is_active == True
    5. Return User object

    SECURITY DECISIONS:
    - Token contains ONLY user_id (sub) - no PII
    - DB check on every request means deactivated users lose
      access IMMEDIATELY (no waiting for token expiry)
    - Same generic 401 for all failures - no information leak
    - Never log token contents or full user objects
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # 1. Extract token, preferring the EXPLICIT header over the ambient cookie.
    token: str | None = None

    # PRECEDENCE: an `Authorization: Bearer <token>` header WINS over the
    # httpOnly cookie. An explicit credential the caller deliberately sent must
    # never be overridden by an ambient one — otherwise a stale (or
    # another-user) cookie silently authenticates a request that asked to act
    # as somebody else. That is a confused-deputy / session-mixup risk, and it
    # also bites API clients that share a cookie jar between accounts.
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]

    # Fall back to the cookie when no header was supplied (browser clients that
    # rely on the httpOnly cookie alone).
    if not token:
        cookie_token = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)
        if cookie_token:
            # Cookie format: "Bearer <token>" or just "<token>"
            token = (
                cookie_token[7:]
                if cookie_token.startswith("Bearer ")
                else cookie_token
            )

    if not token:
        raise credentials_exception

    # 2. Decode and validate token
    try:
        payload = decode_token(token)
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except jwt.PyJWTError:
        # Includes ExpiredSignatureError, InvalidTokenError, etc.
        # `from None` suppresses the chained traceback so no token/internal
        # detail can leak through exception chaining.
        raise credentials_exception from None

    # 3. Load user from DB, check is_active
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        raise credentials_exception

    return user


def require_role(allowed_roles: Iterable[UserRole]):
    """Dependency factory: gate a route to a set of roles.

    SECURITY (architect Week-2 Day-3 decision):
    - Always built ON TOP of get_current_user (authN before authZ).
    - Forbidden response is a uniform 403 {"detail": "Operation not
      permitted"} with NO mention of the required role, preventing role
      enumeration.
    - Never rely on frontend role checks; every protected route must declare
      this gate explicitly.
    """
    allowed = set(allowed_roles)

    def role_verifier(current_user: User = Depends(get_current_user)) -> User:
        current_role = current_user.role
        if current_role not in {r.value for r in allowed}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation not permitted",
            )
        return current_user

    return role_verifier

