"""
app/core/rate_limiter.py

PURPOSE:
Centralized rate limiter configuration shared across all modules.

This module creates the single Limiter instance used globally.
Both app/main.py and individual route files (e.g., app/api/v1/auth.py)
import from here to apply consistent rate limiting across the API.

SECURITY:
- Single source of truth for rate limit strategy
- Auto-detects client IP for tracking
- Prevents brute-force, DoS, and scraping attacks

SCALING NOTE:
By default, slowapi stores rate limit counters in-memory per instance.
In a multi-instance deployment, this doesn't share state. For true
cross-instance limiting, swap in a Redis-compatible storage backend.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

# Global rate limiter - single instance shared across the app.
# Keyed by client IP address by default.
#
# SECURITY: We add a baseline default limit of 100 requests per minute per IP.
# This acts as a global safety net, protecting ALL endpoints (like health checks,
# profile routes) from abuse without requiring explicit decorators on every route.
# Endpoints can override this baseline with their own specific @limiter.limit.
#
# DISTRIBUTED (Week-2, architect feedback):
# If settings.redis_url is configured, slowapi stores counters in Redis so the
# limits are honoured across all horizontally-scaled instances. When unset it
# falls back to in-memory storage (single-instance development).
_limiter_kwargs = {
    "key_func": get_remote_address,
    "default_limits": ["100/minute"],
}
if settings.redis_url:
    _limiter_kwargs["storage_uri"] = settings.redis_url

limiter = Limiter(**_limiter_kwargs)


# ---------------------------------------------------------------------------
# Environment-aware limits for the credential endpoints.
#
# WHY THIS EXISTS: the production values (5/minute) are correct for a public
# deployment — they are what stops password brute-forcing. But they are hostile
# during a live demo: three mistyped passwords on stage means a 60 second
# lockout on the exact screen the judges are watching, with no way to recover.
#
# So the limits are relaxed outside production and kept strict in production.
# This is deliberately a single source of truth: the route modules import these
# strings rather than hard-coding numbers, so the policy cannot drift apart
# between signup, login and account deletion.
#
# Production is never relaxed. If ENVIRONMENT is anything other than
# "production" the app is not serving the public, so the brute-force risk is
# not present and the demo ergonomics win.
_IS_PRODUCTION = settings.environment == "production"

# Login and signup: the two endpoints a demo operator is most likely to retry.
AUTH_CREDENTIAL_LIMIT = "5/minute" if _IS_PRODUCTION else "30/minute"

# Account deletion is destructive and irreversible, so it stays tight even in
# development. A demo never needs to delete an account repeatedly.
ACCOUNT_DELETE_LIMIT = "5/minute"

# Logout is idempotent and harmless, so it is a little looser than login.
AUTH_LOGOUT_LIMIT = "10/minute"
