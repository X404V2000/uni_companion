"""tests/test_credit_accounting.py

Tests that a student is never charged for a summary they did not receive.

WHY THIS MATTERS
----------------
The daily allowance is a student's revision budget. Two failure modes would
quietly steal from it:

  1. The AI provider fails or times out, and the credit stays spent even though
     no guide was produced.
  2. Two requests race and both consume a credit for what is really one unit of
     work (or overshoot the daily cap entirely).

The product stance is that the free allowance is a safety rail, not a paywall:
it exists to stop runaway spending, not to squeeze students. So the refund path
must be correct and its reverse - silently keeping the credit on failure - must
be impossible.

No network calls: the provider is stubbed.
"""
from __future__ import annotations

import uuid

import pytest

from app.db.session import get_db
from app.models.ai import UserAIQuota
from app.models.user import User
from app.services import ai_service


def _auth(client, email: str) -> tuple[dict, str]:
    unique = f"{email.split('@')[0]}+{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/api/v1/auth/signup",
        json={
            "email": unique,
            "password": "MyPassword2026",
            "full_name": "Credit Tester",
            "terms_version": "1.0",
            "privacy_version": "1.0",
        },
    )
    tok = client.post(
        "/api/v1/auth/login",
        json={"email": unique, "password": "MyPassword2026"},
        headers={"x-auth-mode": "api"},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}, unique


def _used(client, headers) -> int:
    return client.get("/api/v1/ai/quota", headers=headers).json()["summaries_used"]


_CONTENT = (
    "Cell biology covers the structure and function of cells. The nucleus stores "
    "DNA while mitochondria produce ATP through respiration. Ribosomes "
    "synthesise proteins and the membrane controls what enters the cell."
)


def test_fresh_account_has_a_full_allowance(client):
    headers, _ = _auth(client, "credit.fresh@example.com")
    body = client.get("/api/v1/ai/quota", headers=headers).json()
    assert body["summaries_used"] == 0
    assert body["remaining_credits"] == body["daily_limit"]


def test_successful_summary_costs_exactly_one(client, monkeypatch):
    monkeypatch.setattr(
        ai_service, "_call_gemini", lambda prompt: ("## Guide\n\nContent.", 42)
    )
    headers, _ = _auth(client, "credit.one@example.com")

    before = _used(client, headers)
    resp = client.post(
        "/api/v1/ai/summarize",
        json={"module_code": "BIO110", "content": _CONTENT},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert _used(client, headers) == before + 1


def test_provider_failure_refunds_the_credit(client, monkeypatch):
    """The student must not pay for a summary that was never produced."""

    def _boom(prompt):
        raise ai_service.AIProviderUnavailableError("provider down")

    monkeypatch.setattr(ai_service, "_call_gemini", _boom)
    headers, _ = _auth(client, "credit.refund@example.com")

    before = _used(client, headers)
    resp = client.post(
        "/api/v1/ai/summarize",
        json={"module_code": "BIO110", "content": _CONTENT},
        headers=headers,
    )
    assert resp.status_code >= 500, resp.text
    assert _used(client, headers) == before, "a failed request must not cost a credit"


def test_repeat_request_is_free(client, monkeypatch):
    """Identical content is cached, so re-reading a guide never costs again."""
    calls = {"n": 0}

    def _count(prompt):
        calls["n"] += 1
        return ("## Guide\n\nContent.", 10)

    monkeypatch.setattr(ai_service, "_call_gemini", _count)
    headers, _ = _auth(client, "credit.cache@example.com")

    payload = {"module_code": "BIO110", "content": _CONTENT}
    first = client.post("/api/v1/ai/summarize", json=payload, headers=headers)
    assert first.status_code == 200
    assert first.json()["cached"] is False
    after_first = _used(client, headers)

    second = client.post("/api/v1/ai/summarize", json=payload, headers=headers)
    assert second.status_code == 200
    assert second.json()["cached"] is True
    assert _used(client, headers) == after_first, "a cache hit must be free"
    assert calls["n"] == 1, "the provider must not be called twice"


def test_quota_is_never_exceeded(client, monkeypatch):
    """Once exhausted, further requests are refused rather than silently billed."""
    monkeypatch.setattr(
        ai_service, "_call_gemini", lambda prompt: ("## Guide", 5)
    )
    headers, _ = _auth(client, "credit.cap@example.com")

    limit = client.get("/api/v1/ai/quota", headers=headers).json()["daily_limit"]

    # Burn the whole allowance with DISTINCT content so nothing is cached.
    for i in range(limit):
        resp = client.post(
            "/api/v1/ai/summarize",
            json={"module_code": "BIO110", "content": f"{_CONTENT} variant {i}"},
            headers=headers,
        )
        assert resp.status_code == 200, f"request {i} failed: {resp.text}"

    body = client.get("/api/v1/ai/quota", headers=headers).json()
    assert body["summaries_used"] == limit
    assert body["remaining_credits"] == 0

    # The next one is refused, and the counter does not move.
    over = client.post(
        "/api/v1/ai/summarize",
        json={"module_code": "BIO110", "content": f"{_CONTENT} one too many"},
        headers=headers,
    )
    assert over.status_code == 429, over.text
    assert _used(client, headers) == limit


def test_quota_rows_are_per_user(client, monkeypatch):
    """One student's usage must never count against another's allowance."""
    monkeypatch.setattr(
        ai_service, "_call_gemini", lambda prompt: ("## Guide", 5)
    )
    a, _ = _auth(client, "credit.userA@example.com")
    b, _ = _auth(client, "credit.userB@example.com")

    client.post(
        "/api/v1/ai/summarize",
        json={"module_code": "BIO110", "content": _CONTENT},
        headers=a,
    )

    assert _used(client, a) == 1
    assert _used(client, b) == 0, "another student's usage must not appear here"
