"""tests/test_ai_summary_api.py

Month 2, Week 1, Day 1 — AI Summary Engine acceptance tests.

Covers (per SETUP_DAY1.md):
1. Daily quota enforcement -> 429 after 10 summaries.
2. SHA-256 cache hit -> cached:true without deducting a second credit.
3. Bounded input validation -> 422 for <50 or >32000 chars.
4. Tenant isolation -> one user's quota/cache never leak to another.
5. Authentication -> 401 without a token.

The Gemini provider call is mocked at `ai_service._call_gemini` so tests are
deterministic, offline, and never spend real API credits. The real HTTP path
is exercised separately (scripts/verify_staging_health.py / manual smoke).
"""

import pytest
from conftest import PASSWORD, unique_email, valid_signup_payload


def _signup_and_token(client):
    """Sign up a fresh user, log in as an API client, return the bearer token.

    Clears the client cookie jar first: the login response sets an auth cookie,
    and get_current_user prefers the cookie over the Authorization header, so
    a stale cookie would make two "different" users authenticate as the same
    person (a test-isolation footgun also used in test_auth_endpoints.py).
    """
    client.cookies.clear()
    email = unique_email("ai")
    signup = client.post(
        "/api/v1/auth/signup", json=valid_signup_payload(email)
    )
    assert signup.status_code == 201, signup.text
    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"X-Auth-Mode": "api"},
    )
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def _auth(client, token):
    return {"Authorization": f"Bearer {token}"}


def _post_summarize(client, token, module_code, content):
    """POST /ai/summarize as a specific user via Bearer header only.

    Clears the cookie jar first so a session cookie left by a prior login in
    the same TestClient cannot override the Authorization header (auth prefers
    the cookie, which would make two users authenticate as one).
    """
    client.cookies.clear()
    return client.post(
        "/api/v1/ai/summarize",
        json={"module_code": module_code, "content": content},
        headers=_auth(client, token),
    )


CONTENT_SHORT = (
    "Photosynthesis is the process plants use to convert light energy into "
    "chemical energy stored in glucose, releasing oxygen as a byproduct."
)
CONTENT_LONG = (
    "Photosynthesis is the process plants use to convert light energy into "
    "chemical energy stored in glucose, releasing oxygen as a byproduct."
)
CONTENT_UNIQUE = lambda n: (  # noqa: E731
    f"Lecture {n}: Photosynthesis converts light into chemical energy via "
    f"chlorophyll. The light-dependent reactions occur in the thylakoid and "
    f"produce ATP and NADPH used in the Calvin cycle to fix carbon {n}."
)


@pytest.fixture
def mock_gemini(monkeypatch):
    """Replace the real provider call with a deterministic one."""
    def fake_call(prompt):
        return "Key concepts: light reactions, Calvin cycle, chlorophyll.", 42
    monkeypatch.setattr(
        "app.services.ai_service._call_gemini", fake_call
    )
    return fake_call


def test_requires_authentication(client):
    resp = client.post(
        "/api/v1/ai/summarize",
        json={"module_code": "BIO101", "content": CONTENT_LONG},
    )
    assert resp.status_code == 401


class TestInputValidation:
    def test_content_too_short_422(self, client):
        token = _signup_and_token(client)
        resp = client.post(
            "/api/v1/ai/summarize",
            json={"module_code": "BIO101", "content": "too short"},
            headers=_auth(client, token),
        )
        assert resp.status_code == 422

    def test_content_over_32k_is_now_ACCEPTED(self, client, monkeypatch):
        """REGRESSION: long documents used to be silently truncated.

        Testers reported that a long document "only summarised a few lines".
        The cause was a 32,000 character ceiling: everything beyond it was
        discarded before the model saw it, so more than half of a 30-page guide
        never reached the AI.

        The ceiling is now 200,000 characters, and anything above the chunk size
        is split into overlapping parts, summarised, and merged. This test fails
        if anyone reintroduces a low bound.
        """
        from app.services import ai_service

        monkeypatch.setattr(
            ai_service, "_call_gemini", lambda prompt: ("## Guide", 5)
        )
        token = _signup_and_token(client)
        resp = client.post(
            "/api/v1/ai/summarize",
            json={"module_code": "BIO101", "content": "x" * 32_001},
            headers=_auth(client, token),
        )
        assert resp.status_code == 200, (
            "content between 32k and 200k must be summarised, not rejected"
        )

    def test_very_long_content_is_accepted_and_chunked(self, client, monkeypatch):
        """A 150,000 character document must be fully accepted."""
        from app.services import ai_service

        calls: list[str] = []

        def _capture(prompt):
            calls.append(prompt)
            return ("## Guide", 5)

        monkeypatch.setattr(ai_service, "_call_gemini", _capture)
        token = _signup_and_token(client)
        resp = client.post(
            "/api/v1/ai/summarize",
            json={"module_code": "BIO101", "content": "x" * 150_000},
            headers=_auth(client, token),
        )
        assert resp.status_code == 200
        # More than one provider call proves the document was chunked rather
        # than truncated.
        assert len(calls) > 1, "a long document must be chunked, not cut off"

    def test_content_beyond_the_schema_ceiling_is_rejected(self, client):
        # Defence in depth: the schema still bounds the request body.
        token = _signup_and_token(client)
        resp = client.post(
            "/api/v1/ai/summarize",
            json={"module_code": "BIO101", "content": "x" * 250_000},
            headers=_auth(client, token),
        )
        assert resp.status_code in (413, 422)

    def test_schema_bound_is_200k(self):
        # Direct schema check. The old 32k bound is gone; 200k is the ceiling.
        from pydantic import ValidationError

        from app.schemas.ai import AISummaryRequest

        ok = AISummaryRequest(module_code="BIO101", content="x" * 150_000)
        assert len(ok.content) == 150_000
        ok2 = AISummaryRequest(module_code="BIO101", content="x" * 200_000)
        assert len(ok2.content) == 200_000
        with pytest.raises(ValidationError):
            AISummaryRequest(module_code="BIO101", content="x" * 200_001)

    def test_module_too_short_422(self, client):
        token = _signup_and_token(client)
        resp = client.post(
            "/api/v1/ai/summarize",
            json={"module_code": "B", "content": CONTENT_LONG},
            headers=_auth(client, token),
        )
        assert resp.status_code == 422


class TestCacheHit:
    def test_duplicate_request_returns_cached_without_deducting(self, client, mock_gemini):
        token = _signup_and_token(client)
        headers = _auth(client, token)
        payload = {"module_code": "bio101", "content": CONTENT_LONG}

        first = client.post("/api/v1/ai/summarize", json=payload, headers=headers)
        assert first.status_code == 200, first.text
        body1 = first.json()
        assert body1["cached"] is False
        assert body1["daily_limit"] == 10
        assert body1["remaining_credits"] == 9

        second = client.post("/api/v1/ai/summarize", json=payload, headers=headers)
        assert second.status_code == 200, second.text
        body2 = second.json()
        assert body2["cached"] is True
        # Cache hit must NOT deduct another credit.
        assert body2["remaining_credits"] == 9
        assert body2["summary"] == body1["summary"]


class TestQuotaEnforcement:
    def test_429_after_daily_limit(self, client, mock_gemini):
        token = _signup_and_token(client)
        headers = _auth(client, token)

        for i in range(10):
            resp = client.post(
                "/api/v1/ai/summarize",
                json={"module_code": "BIO101", "content": CONTENT_UNIQUE(i)},
                headers=headers,
            )
            assert resp.status_code == 200, f"summary {i}: {resp.text}"

        # 11th distinct request must be rejected.
        resp = client.post(
            "/api/v1/ai/summarize",
            json={"module_code": "BIO101", "content": CONTENT_UNIQUE(99)},
            headers=headers,
        )
        assert resp.status_code == 429
        assert "limit" in resp.json()["detail"].lower()

    def test_quota_endpoint_reports_remaining(self, client, mock_gemini):
        token = _signup_and_token(client)
        headers = _auth(client, token)

        client.post(
            "/api/v1/ai/summarize",
            json={"module_code": "BIO101", "content": CONTENT_LONG},
            headers=headers,
        )

        q = client.get("/api/v1/ai/quota", headers=headers)
        assert q.status_code == 200, q.text
        body = q.json()
        assert body["summaries_used"] == 1
        assert body["daily_limit"] == 10
        assert body["remaining_credits"] == 9


class TestTenantIsolation:
    def test_quota_and_cache_are_per_user(self, client, mock_gemini):
        token_a = _signup_and_token(client)
        token_b = _signup_and_token(client)

        # User A generates once.
        a1 = _post_summarize(client, token_a, "BIO101", CONTENT_LONG)
        assert a1.status_code == 200
        assert a1.json()["cached"] is False

        # User B resolves the SAME content: must be a cache MISS (not a hit),
        # because the cache is per-user. It also must not share A's summary.
        b1 = _post_summarize(client, token_b, "BIO101", CONTENT_LONG)
        assert b1.status_code == 200
        assert b1.json()["cached"] is False

        # B's quota is independent of A's.
        client.cookies.clear()
        qb = client.get("/api/v1/ai/quota", headers=_auth(client, token_b))
        assert qb.json()["summaries_used"] == 1
