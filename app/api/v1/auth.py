"""
app/api/v1/auth.py

PURPOSE:
Authentication & Onboarding endpoints (Signup, Login, Me, Logout, Delete).

Each handler here is deliberately THIN (architect Week-2 feedback): it only
- declares the schema/status contract,
- enforces rate limits,
- calls the service layer (app/services/user_service.py),
- translates domain outcomes into HTTP responses.

All DB access, bcrypt hashing, timing-defences, token issuance, and POPIA
soft-delete semantics live in the service layer.
"""
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Header,
    HTTPException,
    Request,
    Response,
    status,
)
from sqlalchemy.orm import Session

from app.api.deps import ACCESS_TOKEN_COOKIE_NAME, get_current_user, require_role
from app.core.config import settings
from app.core.rate_limiter import (
    ACCOUNT_DELETE_LIMIT,
    AUTH_CREDENTIAL_LIMIT,
    AUTH_LOGOUT_LIMIT,
    limiter,
)
from app.core.roles import UserRole
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    AccountDeleteRequest,
    LoginRequest,
    RefreshRequest,
    TokenResponse,
)
from app.schemas.user import UserCreate, UserResponse
from app.services import refresh_token_service, user_service

# Route module router
router = APIRouter(prefix="/auth", tags=["Authentication"])

# Request header that marks a client as API/mobile. When present with an
# EXACT value of `api`, the login response body ALSO carries the raw JWT so
# the client can send it as `Authorization: Bearer <token>` on later requests.
# Browsers (which use the HttpOnly cookie) must NOT send this header.
#
# Value matching is STRICT (case-sensitive, after trimming whitespace): we
# only ever write the literal "api" ourselves in our native/web clients, and
# being conservative about an opt-in exposure of a raw bearer token means no
# accidental or unusual casing can trigger it.
API_CLIENT_HEADER_NAME = "x-auth-mode"
API_CLIENT_HEADER_VALUE = "api"


def _is_api_client(request: Request) -> bool:
    """True when the request opts into exact 'api' token-delivery mode."""
    value = (request.headers.get(API_CLIENT_HEADER_NAME) or "").strip()
    return value == API_CLIENT_HEADER_VALUE


def _clear_access_token_cookie(response: Response) -> None:
    """Expire/clear the auth cookie with the attributes that originally set it."""
    response.delete_cookie(
        key=ACCESS_TOKEN_COOKIE_NAME,
        path="/",
        secure=settings.cookie_secure,
        httponly=True,
        samesite="lax",
    )


@router.post(
    "/signup",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new student account",
    description="Registers a user, hashes password via bcrypt, records POPIA legal consent.",
)
@limiter.limit(AUTH_CREDENTIAL_LIMIT)
async def signup(
    request: Request,
    user_in: UserCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Register a user; persistence/hashing delegated to the service layer.

    A welcome email is scheduled via BackgroundTasks and runs AFTER the 201
    response is sent — email latency/failure can never block registration.
    """
    try:
        user = user_service.create_user(
            db, user_in, background_tasks=background_tasks
        )
    except user_service.DuplicateEmailError:
        # Uniform message: do not reveal whether the email already exists.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration failed. Please check your details and try again.",
        ) from None
    return user


@router.post(
    "/login",
    summary="Log in and receive access credentials",
    description=(
        "Authenticates a user. Always sets an HttpOnly+SameSite=Lax cookie. "
        "By default returns user metadata only (browser-safe). If the request "
        "sends the exact header `X-Auth-Mode: api`, the body ALSO includes "
        "the raw JWT for `Authorization: Bearer` authentication by "
        "mobile/API clients."
    ),
    responses={
        200: {"description": "Successful login"},
        401: {"description": "Invalid credentials or inactive account"},
        429: {"description": "Too many login attempts"},
    },
)
@limiter.limit(AUTH_CREDENTIAL_LIMIT)
async def login(
    request: Request,
    response: Response,
    login_in: LoginRequest,
    db: Session = Depends(get_db),
    x_auth_mode: str | None = Header(
        default=None,
        description=(
            "Set to the EXACT lowercase value 'api' for mobile/API clients to "
            "receive the raw JWT in the response body. Browsers must OMIT this "
            "header and use the HttpOnly cookie instead. Matching is strict and "
            "case-sensitive."
        ),
    ),
):
    """Authenticate and issue a short-lived JWT via HttpOnly cookie (+ API mode)."""
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        user = user_service.authenticate_user(db, login_in)
    except user_service.InvalidCredentialsError:
        raise credentials_error from None

    token = user_service.issue_access_token(user)

    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE_NAME,
        value=f"Bearer {token}",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
        max_age=settings.jwt_access_token_expire_minutes * 60,
    )

    if _is_api_client(request):
        # Issue the long-lived half of the session, in API mode only.
        #
        # WHY ONLY API MODE: browsers use the HttpOnly cookie and need no refresh
        # token yet. A JS-readable long-lived credential in a JSON body would be a
        # downgrade from the cookie, so only a client that can store it securely -
        # the mobile app, in expo-secure-store - receives one.
        raw_refresh = refresh_token_service.issue_refresh_token(
            db,
            user.id,
            device_hint=(request.headers.get("user-agent") or "")[:120] or None,
        )
        db.commit()
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            expires_in=settings.jwt_access_token_expire_minutes * 60,
            refresh_token=raw_refresh,
            refresh_expires_in=settings.jwt_refresh_token_expire_days * 86_400,
        )
    return UserResponse.model_validate(user)


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get the currently authenticated user",
    description="Returns the authenticated user's profile. Requires a valid JWT.",
)
async def read_me(
    current_user: User = Depends(get_current_user),
):
    """Return the authenticated user's own profile (protected by get_current_user)."""
    return current_user


@router.post(
    "/logout",
    summary="Sign out and clear the auth cookie",
    description=(
        "Idempotent sign-out. Clears the HttpOnly access cookie so shared "
        "or public machines don't carry a reusable login."
    ),
    responses={
        200: {"description": "Signed out; cookie cleared"},
        429: {"description": "Too many requests"},
    },
)
@limiter.limit(AUTH_LOGOUT_LIMIT)
async def logout(
    request: Request,
    response: Response,
    payload: RefreshRequest | None = None,
    db: Session = Depends(get_db),
):
    """
    End the session: clear the cookie AND revoke the refresh token.

    Clearing the cookie alone was sufficient when the access token was the only
    credential, because it expired within 15 minutes regardless. Now that a refresh
    token can live for days, a "logout" that leaves it valid is not a logout - the
    next app open would silently mint a new access token and the student would
    still be signed in.

    Revocation is best-effort and never raises. A student trying to sign out must
    not be blocked because we do not recognise their token.
    """
    _clear_access_token_cookie(response)
    if payload is not None and payload.refresh_token:
        refresh_token_service.revoke_refresh_token(db, payload.refresh_token)
        db.commit()
    return {"status": "ok"}


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Exchange a refresh token for a new access token",
    description=(
        "Rotates the session: the presented refresh token is consumed and a new "
        "access + refresh pair is issued. Refresh tokens are single-use. Presenting "
        "an already-consumed token is treated as theft and revokes every session for "
        "that account, forcing a fresh sign-in."
    ),
    responses={
        200: {"description": "New token pair issued"},
        401: {"description": "Refresh token unknown, expired, revoked, or reused"},
        429: {"description": "Too many refresh attempts"},
    },
)
@limiter.limit(AUTH_CREDENTIAL_LIMIT)
async def refresh(
    request: Request,
    payload: RefreshRequest,
    db: Session = Depends(get_db),
):
    """
    Rotate a refresh token. This is what ends the 15-minute logout.

    A client calls this when an access token is rejected. The response is a fresh
    pair, so a student can study for hours without retyping a password.

    Both failure modes return an identical 401, deliberately: a caller must not be
    able to tell "expired" from "replayed", because that distinction is useful to
    someone probing the endpoint and to us only in the logs.
    """
    try:
        new_refresh, user_id = refresh_token_service.rotate_refresh_token(
            db,
            payload.refresh_token,
            device_hint=(request.headers.get("user-agent") or "")[:120] or None,
        )
    except refresh_token_service.RefreshTokenReuseError:
        # The service has already revoked the whole chain and committed. This is a
        # security event worth logging; the client sees the same 401 as any other
        # failure, so the endpoint leaks nothing about which case occurred.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session is no longer valid. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    except refresh_token_service.InvalidRefreshTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session is no longer valid. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    user = db.query(User).filter(User.id == user_id).one_or_none()
    if user is None or not user.is_active:
        # The account was deactivated between issue and refresh. The FK cascade
        # would normally have removed the token already; this is belt and braces.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session is no longer valid. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    db.commit()
    return TokenResponse(
        access_token=user_service.issue_access_token(user),
        token_type="bearer",
        expires_in=settings.jwt_access_token_expire_minutes * 60,
        refresh_token=new_refresh,
        refresh_expires_in=settings.jwt_refresh_token_expire_days * 86_400,
    )


@router.delete(
    "/account",
    summary="Deactivate your own account (POPIA right-to-delete baseline)",
    description=(
        "Soft-deletes the authenticated account. Requires the current "
        "password as re-authentication. Marks the user inactive with a "
        "deleted_at tombstone and scrubs the stored credential. The auth "
        "cookie is cleared so the session ends immediately. "
        "Role-restricted: STUDENT and ADMIN may self-deactivate."
    ),
    responses={
        200: {"description": "Account deactivated"},
        401: {"description": "Wrong password / not authenticated"},
        403: {"description": "Operation not permitted (role)"},
        429: {"description": "Too many attempts"},
    },
)
@limiter.limit(ACCOUNT_DELETE_LIMIT)
async def delete_account(
    request: Request,
    response: Response,
    delete_in: AccountDeleteRequest,
    current_user: User = Depends(
        require_role([UserRole.STUDENT, UserRole.ADMIN])
    ),
    db: Session = Depends(get_db),
):
    """Soft-delete the caller's account after password re-authentication."""
    try:
        user_service.deactivate_user(db, current_user, delete_in.password)
    except user_service.InvalidCredentialsError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    _clear_access_token_cookie(response)
    return {
        "status": "deactivated",
        "deleted_at": current_user.deleted_at.isoformat(),
    }
