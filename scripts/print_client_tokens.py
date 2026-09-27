"""scripts/print_client_tokens.py

PURPOSE
-------
Authenticate the fixture user against a local server and print ready-to-paste
cookie + bearer auth materials for the offshore Flutter team.

Usage:
  python scripts/print_client_tokens.py [BASE_URL]
"""
from __future__ import annotations

import sys

import httpx

from scripts.seed_client_fixture import FIXTURE_EMAIL, FIXTURE_PASSWORD

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"


def main() -> None:
    login_body = {"email": FIXTURE_EMAIL, "password": FIXTURE_PASSWORD}

    # API-mode: bearer token (mobile / Flutter path). Header MUST be exact
    # lowercase "api" — strict, case-sensitive (see docs/API_CONTRACT_V1.md).
    api = httpx.post(
        f"{BASE_URL}/api/v1/auth/login",
        json=login_body,
        headers={"x-auth-mode": "api"},
        timeout=10.0,
    )
    api.raise_for_status()
    token = api.json()["access_token"]

    # Browser-mode: cookie (web preview path).
    browser = httpx.post(
        f"{BASE_URL}/api/v1/auth/login",
        json=login_body,
        timeout=10.0,
    )
    browser.raise_for_status()
    cookie = browser.cookies.get("access_token")

    print("=== API MODE (Flutter) ===")
    print(f"Authorization: Bearer {token}")
    print()
    print("=== BROWSER MODE (web preview) ===")
    print(f"Cookie: access_token={cookie}")
    print()
    print("=== curl smoke test ===")
    print(f'curl -s {BASE_URL}/api/v1/auth/me -H "Authorization: Bearer {token}" | jq')
    print(
        f'curl -s {BASE_URL}/api/v1/academic/dashboard '
        f'-H "Authorization: Bearer {token}" | jq'
    )


if __name__ == "__main__":
    main()
