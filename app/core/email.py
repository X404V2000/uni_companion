"""
app/core/email.py

PURPOSE
-------
Non-blocking transactional email dispatcher (Week 2, Day 4).

DESIGN
------
- Uses plain httpx against the Resend REST API (no provider SDK), keeping
  the zero-budget dependency surface small.
- `send_welcome_email` is intentionally SAFE for background execution: it
  catches every exception so a failed outbound call can never propagate into
  (or roll back) a successful user registration.
- When EMAIL_API_KEY is unset (local dev / CI), it logs and returns as a
  no-op so signup still succeeds.
- Logging never emits the API key, the full email body, or sensitive fields.
"""
from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"


def _welcome_html(full_name: str) -> str:
    """Build the welcome email HTML body (name is HTML-escaped)."""
    name = full_name.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return (
        f"<h1>Welcome, {name}!</h1>"
        "<p>Your Varsity Companion account is ready.</p>"
    )


def send_welcome_email(
    to_email: str,
    full_name: str,
    *,
    client: httpx.Client | None = None,
) -> bool:
    """Send (or no-op skip) the welcome email. Returns True if dispatched.

    SECURITY/RESILIENCY:
    - Missing api key -> no-op (returns False), signup still succeeds.
    - Any httpx/HTTP error -> logged as a warning with only the exception
      TYPE (never the key/body) and returns False; never raised.
    """
    if not settings.email_api_key:
        logger.info("email_api_key unset; skipping welcome email (no-op)")
        return False

    subject = "Welcome to Varsity Companion!"
    html_content = _welcome_html(full_name)

    try:
        own_client = client is None
        if client is None:
            client = httpx.Client(timeout=5.0)
        try:
            response = client.post(
                RESEND_ENDPOINT,
                headers={"Authorization": f"Bearer {settings.email_api_key}"},
                json={
                    "from": settings.email_from,
                    "to": [to_email],
                    "subject": subject,
                    "html": html_content,
                },
            )
        finally:
            if own_client:
                client.close()

        response.raise_for_status()
        logger.info("welcome email dispatched to %s", to_email)
        return True
    except Exception as exc:  # noqa: BLE001 - deliberately broad
        # Never log the API key or body; type + target only.
        logger.warning(
            "welcome email failed for %s: %s", to_email, type(exc).__name__
        )
        return False
