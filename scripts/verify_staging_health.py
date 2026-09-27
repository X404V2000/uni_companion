"""scripts/verify_staging_health.py

Week 4, Day 4 — adversarial live smoke test for a staging deployment.

Runs against a live staging URL and verifies the acceptance criteria:

  1. GET /health            -> 200 and {"database_connected": true}
  2. GET /docs              -> 404 (docs disabled outside development)
  3. GET /openapi.json      -> 404 (schema disabled outside development)
  4. Security headers       -> nosniff, DENY, CSP, HSTS present
  5. Auth cookie flags      -> HttpOnly + SameSite=Lax + Secure (staging)

Usage:
    python scripts/verify_staging_health.py <STAGING_URL>

Example:
    python scripts/verify_staging_health.py https://staging-api.varsitycompanion.co.za

Exit code is 0 only if EVERY check passes (so it can gate a deploy).
"""

from __future__ import annotations

import sys
from pathlib import Path

import httpx

# Ensure the repo root is importable so `app.*` resolves regardless of the
# directory this script is invoked from.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.legal import CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION  # noqa: E402


def _check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    suffix = f"  ({detail})" if detail and not condition else ""
    print(f"[{status}] {name}{suffix}")
    if not condition:
        raise SystemExit(1)


def verify_staging(staging_url: str) -> None:
    base = staging_url.rstrip("/")
    print(f"[*] Verifying staging: {base}\n")

    # Follow redirects off so we can detect a Cloudflare challenge / misrouted
    # origin rather than silently passing through a redirect.
    with httpx.Client(base_url=base, timeout=10.0, follow_redirects=False) as c:
        # --- 1. Liveness + DB -------------------------------------------------
        try:
            health = c.get("/health")
        except httpx.HTTPError as exc:
            _check("GET /health (connection)", False, f"{type(exc).__name__}: {exc}")
            return  # unreachable; nothing further can be checked
        _check("GET /health -> 200", health.status_code == 200, str(health.status_code))
        try:
            body = health.json()
        except ValueError:
            body = {}
        _check(
            "database_connected is true",
            body.get("database_connected") is True,
            repr(body),
        )

        # --- 2. Docs disabled -------------------------------------------------
        docs = c.get("/docs")
        _check("GET /docs -> 404", docs.status_code == 404, str(docs.status_code))
        openapi = c.get("/openapi.json")
        _check(
            "GET /openapi.json -> 404",
            openapi.status_code == 404,
            str(openapi.status_code),
        )

        # --- 3. Security headers ----------------------------------------------
        h = health.headers
        _check(
            "X-Content-Type-Options: nosniff",
            h.get("x-content-type-options", "").lower() == "nosniff",
        )
        _check(
            "X-Frame-Options: DENY",
            h.get("x-frame-options", "").upper() == "DENY",
        )
        _check(
            "Content-Security-Policy present",
            "content-security-policy" in h,
        )
        _check(
            "Strict-Transport-Security present (staging)",
            "strict-transport-security" in h,
        )

    with httpx.Client(base_url=base, timeout=10.0, follow_redirects=False) as c:
        # --- 4. Auth cookie flags (real signup -> login round-trip) ----------
        # The auth cookie is only set on a SUCCESSFUL login, so do an actual
        # signup then login. A unique throwaway email keeps this idempotent
        # across re-runs (duplicate email -> 400 is handled below).
        import uuid

        email = f"verify-{uuid.uuid4().hex[:8]}@example.com"
        password = "VerifyStaging!2026"
        signup = c.post(
            "/api/v1/auth/signup",
            json={
                "email": email,
                "password": password,
                "full_name": "Staging Verifier",
                "terms_version": CURRENT_TERMS_VERSION,
                "privacy_version": CURRENT_PRIVACY_VERSION,
            },
        )
        # 201 = created; 400 = already existed (idempotent re-run).
        if signup.status_code not in (201, 400):
            _check(
                "signup for cookie check succeeds",
                False,
                f"status {signup.status_code}",
            )
            return

        login = c.post(
            "/api/v1/auth/login",
            json={"email": email, "password": password},
        )
        _check("login returns 200", login.status_code == 200, str(login.status_code))
        set_cookie = login.headers.get("set-cookie", "")
        _check("auth cookie present", bool(set_cookie))
        low = set_cookie.lower()
        _check("auth cookie HttpOnly", "httponly" in low)
        _check("auth cookie SameSite=Lax", "samesite=lax" in low)
        _check("auth cookie Secure", "secure" in low)

    print(f"\n[SUCCESS] Staging {base} verified ready.")


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python scripts/verify_staging_health.py <STAGING_URL>")
        sys.exit(2)
    verify_staging(sys.argv[1])


if __name__ == "__main__":
    main()
