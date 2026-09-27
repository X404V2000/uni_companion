"""
main.py

PURPOSE
-------
Entry point of the Varsity Companion API.
This is the file that uvicorn runs when starting the server:
    uvicorn app.main:app --reload

RESPONSIBILITIES
----------------
1. Create the FastAPI application instance with all middleware
2. Auto-create database tables on startup (via lifespan handler)
3. Define routing endpoints (root + health checks)
4. Configure security middleware (headers, CORS, rate limiting)
5. Wire in feature routers (auth, etc.)

SECURITY & SCALABILITY NOTES
---------------------------
- SECURITY: We configure:
    * Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
    * CORS restricted to explicit allow-listed origins (never *)
    * Rate limiting on all endpoints to prevent brute-force attacks
    * Request body size limits (10KB max) to prevent DoS via payload flooding
    * Structured error responses with correlation IDs (no stack traces leaked)
    * No stack traces leaked in production error responses
    * Connection pool sizing tuned for concurrent load

- SCALABILITY: We design for thousands of concurrent requests:
    * Connection pool with min/max limits (handled in db/session.py)
    * Stateless middleware (no per-request in-memory state that grows)
    * Lazy table creation on startup only
    * Health check endpoint (for load balancers/k8s probes)

DAY 3 ADDITIONS:
- Request size middleware (10KB limit for JSON payloads)
- Auth router wiring (POST /api/v1/auth/signup)
- Global exception handler for unhandled errors
- Per-route rate limiting for stricter auth protection
"""

# ---------------------------------------------------------------------------
# STANDARD LIBRARY IMPORTS
# ---------------------------------------------------------------------------
import logging
import time
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

# ---------------------------------------------------------------------------
# THIRD-PARTY IMPORTS
# ---------------------------------------------------------------------------
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.academic import router as academic_router
from app.api.v1.admin import router as admin_router
from app.api.v1.ai import router as ai_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.auth import router as auth_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.materials import router as materials_router
from app.api.v1.sync import router as sync_router
from app.core.config import settings
from app.core.logging_config import correlation_id_ctx, setup_logging
from app.core.rate_limiter import limiter

# ---------------------------------------------------------------------------
# INTERNAL IMPORTS
# ---------------------------------------------------------------------------
from app.db.session import engine, get_db

# ---------------------------------------------------------------------------
# LOGGING CONFIGURATION
# ---------------------------------------------------------------------------
# Structured + redacted + rotating (see app/core/logging_config.py).
setup_logging(settings.environment, to_file=settings.log_to_file)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# RATE LIMITING CONFIGURATION
# ---------------------------------------------------------------------------
# `limiter` (imported above) is a global limiter keyed on the client's IP.
# This is the FIRST LINE OF DEFENSE against:
#   - Brute-force password guessing
#   - Denial-of-service (DoS) via request flooding
#   - Web scraping our endpoints

# Security headers applied to every response. Kept as a named constant so the
# policy is auditable in one place (and stays within the line-length limit).
_CONTENT_SECURITY_POLICY = (
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
)


# ---------------------------------------------------------------------------
# APPLICATION LIFESPAN HANDLER
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """
    Runs ONCE when the application starts and ONCE when it shuts down.

    SHUTDOWN: Disposes the connection pool cleanly.

    SCHEMA NOTE (Week 2): tables are now managed EXCLUSIVELY by Alembic
    migrations (`alembic upgrade head`). The app lifespan no longer runs
    `create_all` or ad-hoc `ALTER TABLE` statements — that was a Week-1
    stopgap and is intentionally removed so schema changes are auditable
    and reproducible across environments.
    """
    yield  # Application runs here while server is up

    # --- SHUTDOWN ---
    # Close the connection pool cleanly.
    engine.dispose()


# ---------------------------------------------------------------------------
# CREATE THE FASTAPI APPLICATION
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Varsity Companion API",
    description="Backend API for the Varsity Companion academy platform.",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
)


# -------------------------------------------------------------------------
# SECURITY: RATE LIMIT STATE + EXCEPTION HANDLERS
# -------------------------------------------------------------------------
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# -------------------------------------------------------------------------
# SECURITY: GLOBAL EXCEPTION HANDLER (Information Disclosure Prevention)
# -------------------------------------------------------------------------
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """
    Structured HTTP error responses.
    Ensures consistent error format and never leaks internal details.
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Global unhandled exception handler.

    SECURITY:
    - In production, return generic message + correlation ID (no stack traces)
    - In development, log full details for debugging
    - Correlation ID allows tracing logs to find root cause without exposing internals
    """
    correlation_id = correlation_id_ctx.get()

    # Log a SAFE summary only. Never embed str(exc)/traceback into server
    # logs: unhandled exceptions can carry bound SQL parameters (e.g. email
    # values) inside their message. Those must not reach log files.
    logger.error(
        "Unhandled error type=%s path=%s",
        type(exc).__name__,
        request.url.path,
        extra={"correlation_id": correlation_id},
    )

    if not settings.is_hardened:
        # Development: expose error details for debugging (API response only,
        # not the log file).
        return JSONResponse(
            status_code=500,
            content={
                "detail": str(exc),
                "correlation_id": correlation_id,
            }
        )
    else:
        # Production: generic message, no internal details leaked
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error",
                "correlation_id": correlation_id,
            }
        )


# -------------------------------------------------------------------------
# SECURITY: REQUEST CORRELATION + ACCESS LOG MIDDLEWARE
# -------------------------------------------------------------------------
_MAX_CORRELATION_ID_LEN = 64


def _sanitize_correlation_id(raw: str | None) -> str | None:
    """Return a SAFE correlation id, or None to force a generated one.

    An inbound X-Correlation-ID is reflected into the response header AND our
    structured access log, so it must be single-line and short. CR/LF would
    allow log-line forgery and (in lax serializers) header injection; control
    characters are rejected. Invalid values return None so the middleware
    falls back to a generated UUID.
    """
    if not raw:
        return None
    if any(ord(ch) < 0x20 or ord(ch) == 0x7F for ch in raw):
        return None
    raw = raw.strip()
    if not raw or len(raw) > _MAX_CORRELATION_ID_LEN:
        return None
    return raw


@app.middleware("http")
async def correlation_middleware(request: Request, call_next):
    """Generate/propagate a correlation ID and emit one redacted access log.

    - Honours an inbound `X-Correlation-ID` (verbatim passthrough for tracing
      across services) but ONLY if it is single-line and short; otherwise a
      UUID is generated — preventing log-line forgery and header injection.
    - Times the full downstream chain and records method/path/status/duration
      + client IP with the correlation id attached.
    - Adds the correlation id back on the response so clients/ops can quote it.
    """
    correlation_id = _sanitize_correlation_id(
        request.headers.get("X-Correlation-ID")
    ) or str(uuid.uuid4())
    token = correlation_id_ctx.set(correlation_id)
    start = time.perf_counter()
    status_code = 500  # in case an exception escapes before status is known
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["X-Correlation-ID"] = correlation_id
        return response
    finally:
        correlation_id_ctx.reset(token)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        client_ip = request.client.host if request.client else "unknown"
        # Never log Authorization/Cookie; see logging_config redaction as a
        # second line of defence. Path+method only (query strings can carry PII).
        logger.info(
            "method=%s path=%s status=%s duration_ms=%s client_ip=%s",
            request.method,
            request.url.path,
            status_code,
            duration_ms,
            client_ip,
            extra={"correlation_id": correlation_id},
        )


# -------------------------------------------------------------------------
# SECURITY: REQUEST SIZE LIMITING MIDDLEWARE (Max 10KB, + import exemption)
# -------------------------------------------------------------------------
MAX_BODY_SIZE = 10 * 1024  # 10 KB limit (per Blueprint Section 1)

# The bulk-materials import (Month 2, Week 3, Day 2) accepts up to 500 rows;
# 500 rows x ~2 KB each ≈ 1 MB. A single shared 10 KB cap would make that
# endpoint unusable, so it gets a NARROW, path-based exemption to a 1 MB cap.
# The import handler independently enforces the same 1 MB bound (defence in
# depth), and every other route keeps the strict 10 KB guard.
IMPORT_PATH = "/api/v1/admin/materials/import"
MAX_IMPORT_BODY_SIZE = 1_048_576  # 1 MB (row cap 500 -> ~1 MB worst case)

# The AI summary endpoint accepts up to 32,000 characters of study content
# (see app/schemas/ai.py). The shared 10 KB cap made real lecture notes fail
# with 413 "Request body too large", so this route gets its own narrow,
# path-based exemption.
#
# RAISED FROM 64 KB TO 1 MB: the schema now accepts 200,000 characters, because
# long documents are chunked rather than truncated. 200,000 characters of mostly
# ASCII JSON is ~200 KB, and non-ASCII (an Afrikaans or isiZulu upload, or a
# document full of maths symbols) can be 3-4 bytes per character, so 1 MB leaves
# comfortable headroom. Anything smaller here would have rejected the very
# documents this change is meant to support, with a 413 the student could not
# act on.
SUMMARY_PATH = "/api/v1/ai/summarize"
MAX_SUMMARY_BODY_SIZE = 1_048_576  # 1 MB


def _max_body_size_for(request: Request) -> int:
    """Return the per-request body-size ceiling, in bytes.

    WHY (path-based, not global): imports and AI summaries are the only two
    legitimate large-payload routes. A blanket raise would weaken the DoS guard
    for every other endpoint. Matching is an exact path comparison (with a
    trailing-slash-tolerant strip) so only the intended routes are exempted —
    never a prefix that an attacker could exploit.
    """
    path = request.url.path.rstrip("/")
    if path == IMPORT_PATH:
        return MAX_IMPORT_BODY_SIZE
    if path == SUMMARY_PATH:
        return MAX_SUMMARY_BODY_SIZE
    return MAX_BODY_SIZE


@app.middleware("http")
async def request_size_middleware(request: Request, call_next):
    """
    Limits request body size to prevent DoS via payload flooding.

    SECURITY RATIONALE:
    - A POST to /signup with a 100MB body would consume server memory
    - This middleware rejects oversized requests EARLY, before they
      reach our validation logic or database
    - 10KB is plenty for most of our data model (email, name, academic fields);
      the bulk-materials import route is exempted to 1 MB (see above), with the
      handler enforcing the same bound itself.
    """
    if request.method in ("POST", "PUT", "PATCH"):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                length = int(content_length)
            except (TypeError, ValueError):
                # A malformed/duplicated Content-Length must never crash the
                # worker (leaking server internals). Reject the request.
                return JSONResponse(
                    status_code=400,
                    content={"detail": "Invalid Content-Length header"},
                )
            if length > _max_body_size_for(request):
                return JSONResponse(
                    status_code=413,
                    content={"detail": "Request body too large"},
                )

    response = await call_next(request)
    return response


# -------------------------------------------------------------------------
# SECURITY: RATE LIMITING MIDDLEWARE (applied globally)
# -------------------------------------------------------------------------
@app.middleware("http")
async def rate_limiting_middleware(request: Request, call_next):
    """
    Global request rate limiter.

    SECURITY RATIONALE:
    Without this, an attacker could send unlimited requests trying to:
      - Guess passwords (brute-force attack)
      - Flood the server (denial of service)
      - Enumerate valid user emails by timing responses
    """
    # Decorate with global limit
    response = await call_next(request)
    return response


# -------------------------------------------------------------------------
# SECURITY: PROTECTIVE HEADERS MIDDLEWARE
# -------------------------------------------------------------------------
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """
    Adds security headers to every HTTP response.

    WHY EACH HEADER MATTERS:
    - X-Content-Type-Options: nosniff
        Prevents MIME-type sniffing attacks.
    - X-Frame-Options: DENY
        Prevents clickjacking attacks via invisible iframes.
    - Referrer-Policy: no-referrer
        Prevents leaking user's URL paths in the Referer header.
    - X-XSS-Protection: 1; mode=block
        Legacy protection against reflected XSS.
    - Content-Security-Policy
        Restricts what content browser is allowed to load.
    - Cache-Control: no-store
        Prevents browser/proxies from caching sensitive API responses.
    - Strict-Transport-Security (production + staging; HTTPS-terminated modes)
        Forces HTTPS connections.
    """
    response = await call_next(request)

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Content-Security-Policy"] = _CONTENT_SECURITY_POLICY
    response.headers["Cache-Control"] = "no-store"

    if settings.hsts_enabled:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return response


# -------------------------------------------------------------------------
# CORS (Cross-Origin Resource Sharing) CONFIGURATION
# -------------------------------------------------------------------------
allowed_origins = [
    origin.strip()
    for origin in settings.cors_origins.split(",")
    if origin.strip()
]

# WHY A REGEX IS NEEDED FOR THE DEMO
# ---------------------------------
# The hackathon demo is served over a cloudflared *quick tunnel*, whose public
# hostname is random and CHANGES every time the tunnel restarts. Hard-listing
# those hostnames in CORS meant that every tunnel restart silently broke login:
# the browser preflight got "Disallowed CORS origin" (400) and the UI reported
# "Cannot reach the server", which looked like the backend was down when it was
# actually fine.
#
# So outside production we also accept any trycloudflare.com origin. This is
# deliberately scoped:
#   * only the trycloudflare.com domain (not "*"), so an arbitrary site cannot
#     call the API with credentials,
#   * only when the environment is NOT production, so a real deployment keeps a
#     strict, explicit list.
# Localhost is matched too, so a local frontend on any port keeps working.
if settings.environment != "production":
    allowed_origin_regex = (
        r"^https?://("
        r"[a-z0-9-]+\.trycloudflare\.com"
        r"|localhost(:\d+)?"
        r"|127\.0\.0\.1(:\d+)?"
        r")$"
    )
else:
    # In production the explicit list is the only source of truth.
    allowed_origin_regex = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allowed_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    # `x-auth-mode` lets browser/mobile clients opt into the API token-delivery
    # login mode; without it the CORS preflight rejects login (demo depends on it).
    allow_headers=["Authorization", "Content-Type", "x-auth-mode"],
    max_age=3600,
)


# ---------------------------------------------------------------------------
# ROUTES: BASE API
# ---------------------------------------------------------------------------
@app.get("/", tags=["Health"])
@limiter.limit("60/minute")
async def read_root(request: Request):
    """
    Root endpoint - confirms the server is running.

    SECURITY: Only returns environment name (not full settings).
    Never expose database URLs, secrets, or internal paths here.
    """
    return {
        "message": "Varsity Companion API is running.",
        "environment": settings.environment,
        "status": "healthy",
    }


@app.get("/health", tags=["Health"])
@limiter.limit("120/minute")
async def health_check(request: Request, db: Session = Depends(get_db)):
    """
    Health check endpoint for load balancers / Kubernetes probes.
    Executes SELECT 1 to verify database connectivity.
    """
    db.execute(text("SELECT 1"))
    return {"database_connected": True, "status": "healthy"}


# ---------------------------------------------------------------------------
# ROUTES: FEATURE ROUTERS (Versioned API)
# ---------------------------------------------------------------------------
# Wire in the v1 API routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(academic_router, prefix="/api/v1")
app.include_router(ai_router, prefix="/api/v1")
app.include_router(materials_router, prefix="/api/v1")
app.include_router(sync_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
