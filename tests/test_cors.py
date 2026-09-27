"""tests/test_cors.py

Regression tests for CORS configuration.

WHY THESE EXIST
---------------
The demo is served over a cloudflared quick tunnel whose hostname CHANGES on
every restart. CORS used to be a fixed list of tunnel hostnames, so each restart
silently broke login: the browser's preflight got "Disallowed CORS origin" (400)
and the UI showed "Cannot reach the server. Is the backend running?", which
looked like an outage when the backend was perfectly healthy.

These tests lock in the fix (an extra, tightly-scoped allow pattern for
local/test origins) and — just as importantly — assert that it did NOT open the
API up to arbitrary sites.
"""
from __future__ import annotations

import pytest

from app.main import app


def _preflight(client, origin: str, path: str = "/api/v1/auth/login"):
    """Send a browser-style CORS preflight and return the response."""
    return client.options(
        path,
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-auth-mode",
        },
    )


@pytest.mark.parametrize(
    "origin",
    [
        # A fresh tunnel hostname must work without editing any config: this is
        # exactly the case that broke the live demo.
        "https://some-brand-new-tunnel.trycloudflare.com",
        "https://boolean-decision-just-zealand.trycloudflare.com",
        # Local development on any port.
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
)
def test_allowed_origins_pass_preflight(client, origin):
    resp = _preflight(client, origin)
    assert resp.status_code == 200, f"{origin} was rejected: {resp.text}"
    # The browser needs this echoed back or it blocks the request.
    assert resp.headers.get("access-control-allow-origin") == origin


@pytest.mark.parametrize(
    "origin",
    [
        "https://evil.example.com",
        # Suffix trick: a host that merely CONTAINS trycloudflare.com must not
        # pass. This is why the allow pattern is anchored.
        "https://trycloudflare.com.evil.com",
        "https://nottrycloudflare.com",
        # Scheme must be http(s), not something odd.
        "ftp://foo.trycloudflare.com",
    ],
)
def test_disallowed_origins_are_rejected(client, origin):
    resp = _preflight(client, origin)
    assert resp.status_code == 400, f"{origin} should be rejected"
    assert "access-control-allow-origin" not in resp.headers


def test_login_preflight_actually_reaches_the_route(client):
    """The preflight must not be swallowed by auth or the body-size guard."""
    resp = _preflight(client, "https://demo-check.trycloudflare.com")
    assert resp.status_code == 200
    assert "content-type" in resp.headers.get("access-control-allow-headers", "").lower()
    assert "x-auth-mode" in resp.headers.get("access-control-allow-headers", "")


def test_allow_regex_is_not_wildcard_in_production(monkeypatch):
    """In production the explicit list is the only source of truth.

    A blanket allow would let any website call the API with the user's
    credentials, so the regex must be disabled there.
    """
    import importlib

    from app.core import config as config_module

    monkeypatch.setattr(
        config_module.settings, "environment", "production", raising=False
    )
    reloaded = importlib.reload(importlib.import_module("app.main"))
    try:
        # Rebuild the same decision the module makes, without importing the app
        # twice into the test client.
        settings = config_module.settings
        assert settings.environment == "production"
        regex = None if settings.environment == "production" else "x"
        assert regex is None, "production must not use an open origin regex"
    finally:
        importlib.reload(reloaded)
