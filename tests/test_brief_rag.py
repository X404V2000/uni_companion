"""tests/test_brief_rag.py

Unit + API tests for "Chat with your brief" (RAG).

Focus:
  * chunking is deterministic and bounded
  * retrieval ranks the right chunk first
  * retrieval NEVER crosses tenants (the security property that matters most)
  * oversize documents are refused
  * an out-of-scope question is not answered from thin air
"""
from __future__ import annotations

import uuid

from app.services import brief_rag_service as rag

# ---------------------------------------------------------------------------
# Pure unit tests (no DB, no network)
# ---------------------------------------------------------------------------

def test_chunking_is_deterministic_and_overlapping():
    text = "Sentence one. " * 200
    a = rag.chunk_text(text)
    b = rag.chunk_text(text)
    assert a == b, "chunking must be deterministic for stable citations"
    assert len(a) > 1, "long text must produce multiple chunks"
    assert all(len(c) <= rag.CHUNK_SIZE + 50 for c in a)


def test_chunking_handles_empty_and_short_text():
    assert rag.chunk_text("") == []
    assert rag.chunk_text("   \n  ") == []
    assert rag.chunk_text("Short note.") == ["Short note."]


def test_chunking_respects_chunk_cap():
    huge = "word " * (rag.CHUNK_SIZE * (rag.MAX_CHUNKS + 50))
    assert len(rag.chunk_text(huge)) <= rag.MAX_CHUNKS


def test_scoring_prefers_the_relevant_chunk():
    """The exam sentence must outrank generic filler."""
    terms = rag._tokenize("when is the final exam worth")
    filler = "Section covers " + "background material about concepts. " * 30
    relevant = "The final exam is worth 60 percent and takes place in November."
    assert rag._score(terms, "when is the final exam worth", relevant) > rag._score(
        terms, "when is the final exam worth", filler
    )


def test_scoring_returns_zero_without_overlap():
    assert rag._score(rag._tokenize("quantum chromodynamics"), "quantum", "cats and dogs") == 0.0


def test_prompt_instructs_grounding_only():
    class _C:
        ordinal = 0
        chunk_text = "The literature review is worth 15 percent."

    prompt = rag.build_prompt("How much is the literature review?", [_C()])
    # The model must be told to use ONLY the excerpts (bounds hallucination).
    assert "Use ONLY the excerpts" in prompt
    assert "literature review" in prompt
    assert "Excerpt 1" in prompt


# ---------------------------------------------------------------------------
# API tests (auth + tenant isolation + ingest/ask)
# ---------------------------------------------------------------------------

BRIEF_TEXT = (
    "INF154 Assignment 1 Brief. The assignment is worth 30 percent of the "
    "final mark. The literature review section is worth 15 percent of the "
    "assignment total. Submit by 23:59 on 2 October. Late submissions lose "
    "10 percent per day. The marking rubric weights correctness 40, code "
    "quality 30 and report 30."
)


def _auth_headers(client, email: str) -> dict:
    """Sign up + log in, returning an Authorization header.

    The supplied address is suffixed with a fresh token so every RUN gets a
    brand-new account. The test database is shared and persists between runs,
    and each account has a daily AI-credit allowance — reusing a fixed address
    meant that after ten runs the account had spent its quota and the ask test
    failed with 429 for reasons unrelated to the code under test.
    """
    unique = f"{email.split('@')[0]}+{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/api/v1/auth/signup",
        json={
            "email": unique,
            "password": "MyPassword2026",
            "full_name": "RAG Tester",
            "terms_version": "1.0",
            "privacy_version": "1.0",
        },
    )
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": unique, "password": "MyPassword2026"},
        headers={"x-auth-mode": "api"},
    )
    token = resp.json().get("access_token", "")
    return {"Authorization": f"Bearer {token}"}


def test_brief_requires_authentication(client):
    assert client.get("/api/v1/ai/briefs").status_code == 401
    assert client.post(
        "/api/v1/ai/briefs", json={"source_name": "x", "content": "y" * 100}
    ).status_code == 401


def test_ingest_then_ask_with_citation(client):
    headers = _auth_headers(client, "rag.ingest@example.com")
    created = client.post(
        "/api/v1/ai/briefs",
        json={"source_name": "INF154_brief.txt", "content": BRIEF_TEXT},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["chunk_count"] >= 1

    listed = client.get("/api/v1/ai/briefs", headers=headers).json()
    assert any(b["id"] == body["id"] for b in listed["items"])

    asked = client.post(
        f"/api/v1/ai/briefs/{body['id']}/ask",
        json={"question": "How much is the literature review worth?"},
        headers=headers,
    )
    assert asked.status_code == 200, asked.text
    payload = asked.json()
    # Retrieval always yields citations, even if the LLM is unavailable in CI.
    assert len(payload["citations"]) >= 1
    assert "literature review" in payload["citations"][0]["text"].lower()


def test_oversize_document_is_rejected(client):
    headers = _auth_headers(client, "rag.big@example.com")
    resp = client.post(
        "/api/v1/ai/briefs",
        json={"source_name": "huge.txt", "content": "a" * 200_001},
        headers=headers,
    )
    # Pydantic bounds it at 200_000 -> 422; the service would also 413.
    assert resp.status_code in (413, 422), resp.text


def test_tenant_isolation_on_ask_and_list(client):
    """The critical security property: no cross-tenant access, ever."""
    owner = _auth_headers(client, "rag.owner@example.com")
    intruder = _auth_headers(client, "rag.intruder@example.com")

    created = client.post(
        "/api/v1/ai/briefs",
        json={"source_name": "private.txt", "content": BRIEF_TEXT},
        headers=owner,
    ).json()

    # Intruder cannot ask about the owner's brief...
    denied = client.post(
        f"/api/v1/ai/briefs/{created['id']}/ask",
        json={"question": "What is the deadline?"},
        headers=intruder,
    )
    assert denied.status_code == 404, "must not reveal another user's brief"

    # ...and cannot see it in their own list.
    listed = client.get("/api/v1/ai/briefs", headers=intruder).json()
    assert all(b["id"] != created["id"] for b in listed["items"])


def test_ask_unknown_brief_returns_404(client):
    headers = _auth_headers(client, "rag.unknown@example.com")
    resp = client.post(
        "/api/v1/ai/briefs/00000000-0000-0000-0000-000000000000/ask",
        json={"question": "Anything?"},
        headers=headers,
    )
    assert resp.status_code == 404
