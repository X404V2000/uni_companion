"""tests/test_material_ingest.py

Tests for on-demand resource finding ("Find resources for this module").

The security-relevant properties matter most here, because this endpoint makes
the SERVER fetch external URLs:

  * a student can only ingest their OWN module
  * the caller cannot make the server fetch an arbitrary host (SSRF)
  * repeated presses are throttled rather than hammering upstream APIs
  * nothing is stored unless it passes the validation gate

Network calls are stubbed out: the tests must never depend on Wikipedia/arXiv
being reachable, and must never actually crawl them.
"""
from __future__ import annotations

import uuid

import pytest

from app.services import material_ingest_service as ingest

# ---------------------------------------------------------------------------
# Pure unit tests — no DB, no network
# ---------------------------------------------------------------------------

class TestAllowList:
    """The SSRF guard: only fixed, allow-listed hosts may ever be fetched."""

    @pytest.mark.parametrize(
        "url",
        [
            "https://en.wikipedia.org/api/rest_v1/page/summary/Python",
            "https://export.arxiv.org/api/query?search_query=all:test",
            "https://openlibrary.org/search.json?q=test",
            "https://www.youtube.com/oembed?url=x",
        ],
    )
    def test_allowed_hosts_pass(self, url):
        ingest._assert_allowed(url)  # must not raise

    @pytest.mark.parametrize(
        "url",
        [
            "http://127.0.0.1:8000/admin",              # loopback
            "http://169.254.169.254/latest/meta-data/",  # cloud metadata
            "http://localhost/internal",
            "https://evil.example.com/steal",
            "https://en.wikipedia.org.evil.com/x",       # suffix trick
            "file:///etc/passwd",
            "ftp://en.wikipedia.org/x",
        ],
    )
    def test_disallowed_hosts_are_refused(self, url):
        with pytest.raises(ValueError):
            ingest._assert_allowed(url)

    def test_validation_gate_rejects_non_allowlisted_host(self):
        # _is_alive must refuse to even attempt a non-allow-listed URL.
        assert ingest._is_alive("http://127.0.0.1:8000/health") is False


class TestTopicDerivation:
    """Topic derivation must work for ANY module name the student types."""

    def test_fallback_always_returns_something(self):
        for name in [
            "General Chemistry and Chemical Bonding",
            "Classical Mechanics and Waves",
            "Information Communication and Technology",
            "X",  # degenerate
            "",
        ]:
            topics = ingest._fallback_topics(name)
            assert topics, f"no topics for {name!r}"

    def test_fallback_drops_generic_words(self):
        topics = ingest._fallback_topics("General Chemistry and Chemical Bonding")
        lowered = [t.lower() for t in topics]
        # "General" alone would match almost anything — it must not survive.
        assert "general" not in lowered

    def test_fallback_prefers_multi_word_phrases(self):
        topics = ingest._fallback_topics("Classical Mechanics and Waves")
        # A phrase such as "Classical Mechanics" is far more searchable than
        # the single word "Waves".
        assert any(" " in t for t in topics)

    def test_parse_topics_handles_clean_json(self):
        assert ingest._parse_topics('["a b","c d","e f"]') == ["a b", "c d", "e f"]

    def test_parse_topics_recovers_from_truncated_json(self):
        # A truncated body used to raise and lose every topic. Complete strings
        # before the cut must be salvaged.
        truncated = '["chemical bonding","molecular geometry","periodic tren'
        got = ingest._parse_topics(truncated)
        assert got == ["chemical bonding", "molecular geometry"]

    def test_parse_topics_strips_markdown_fences(self):
        assert ingest._parse_topics('```json\n["x y","z w"]\n```') == ["x y", "z w"]

    def test_parse_topics_tolerates_prose(self):
        assert ingest._parse_topics('Sure: ["a b","c d"]') == ["a b", "c d"]


class TestVideoMatching:
    """Videos are matched by TOPIC, so an unseen module still gets them."""

    def test_matches_by_topic_keyword_not_module_code(self, monkeypatch):
        # Stub the oEmbed call so no network is touched.
        monkeypatch.setattr(
            ingest, "_fetch", lambda url: b'{"title":"Some Real Video"}'
        )
        got = ingest._collect_youtube(
            "ZZZ999", ["data structure", "algorithm analysis"]
        )
        assert got, "a previously unseen module must still match videos"
        assert all(c.module_code == "ZZZ999" for c in got)

    def test_no_topics_means_no_videos(self, monkeypatch):
        monkeypatch.setattr(ingest, "_fetch", lambda url: b'{"title":"x"}')
        assert ingest._collect_youtube("ZZZ999", ["underwater basket weaving"]) == []


# ---------------------------------------------------------------------------
# API tests — ownership and scoping (network fully stubbed)
# ---------------------------------------------------------------------------

def _auth(client, email: str) -> dict:
    unique = f"{email.split('@')[0]}+{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/api/v1/auth/signup",
        json={
            "email": unique,
            "password": "MyPassword2026",
            "full_name": "Ingest Tester",
            "terms_version": "1.0",
            "privacy_version": "1.0",
        },
    )
    tok = client.post(
        "/api/v1/auth/login",
        json={"email": unique, "password": "MyPassword2026"},
        headers={"x-auth-mode": "api"},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def _module(client, headers, code: str) -> str:
    uniq = f"{code[:5]}{uuid.uuid4().hex[:4].upper()}"
    resp = client.post(
        "/api/v1/academic/modules",
        json={"code": uniq, "name": "Test Module"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return uniq


@pytest.fixture()
def no_network(monkeypatch):
    """Replace every outbound fetch with a deterministic stub.

    Returns a canned Wikipedia summary so the full ingest path runs end to end
    without touching the internet.
    """
    wiki = b'{"title":"Stub Topic","extract":"' + b"x" * 200 + b'","content_urls":{"desktop":{"page":"https://en.wikipedia.org/wiki/Stub_Topic"}}}'

    def fake_fetch(url, *a, **kw):
        if "wikipedia.org" in url:
            return wiki
        if "arxiv.org" in url:
            return b"<feed xmlns='http://www.w3.org/2005/Atom'></feed>"
        if "openlibrary.org" in url:
            return b'{"docs":[]}'
        if "youtube.com" in url:
            return b'{"title":"Stub Video"}'
        return None

    monkeypatch.setattr(ingest, "_fetch", fake_fetch)
    # The validation gate calls _is_alive -> _fetch; make the delay a no-op so
    # tests stay fast.
    monkeypatch.setattr(ingest, "REQUEST_DELAY", 0)
    # Force the deterministic fallback so no AI credit is spent in tests.
    monkeypatch.setattr(
        ingest, "derive_topics", lambda code, name: ["stub topic one", "stub topic two", "stub topic three"]
    )
    # Clear the cooldown so each test starts clean.
    ingest._last_run.clear()
    return fake_fetch


def test_ingest_requires_authentication(client):
    assert client.post("/api/v1/materials/modules/ABC123/ingest").status_code == 401


def test_cannot_ingest_a_module_you_do_not_own(client, no_network):
    """The critical scoping rule: no triggering fetches for other people's modules."""
    owner = _auth(client, "ingest.owner@example.com")
    intruder = _auth(client, "ingest.intruder@example.com")
    code = _module(client, owner, "OWNED")

    resp = client.post(
        f"/api/v1/materials/modules/{code}/ingest", headers=intruder
    )
    assert resp.status_code == 404, "must not act on another user's module"


def test_unknown_module_code_is_404(client, no_network):
    headers = _auth(client, "ingest.unknown@example.com")
    resp = client.post(
        "/api/v1/materials/modules/NOPE999/ingest", headers=headers
    )
    assert resp.status_code == 404


def test_ingest_stores_only_validated_resources(client, no_network):
    headers = _auth(client, "ingest.happy@example.com")
    code = _module(client, headers, "HAPPY")

    resp = client.post(f"/api/v1/materials/modules/{code}/ingest", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["module_code"] == code
    assert body["total"] >= 1, "validated resources should be stored"

    # And they are immediately searchable.
    found = client.get(
        f"/api/v1/materials/search?module_code={code}", headers=headers
    ).json()
    assert found["total"] >= 1
    # Every stored URL must be from an allow-listed source host.
    for item in found["items"]:
        ingest._assert_allowed(item["url"])  # raises if not allow-listed


def test_second_press_is_throttled(client, no_network):
    headers = _auth(client, "ingest.repeat@example.com")
    code = _module(client, headers, "REPEAT")

    first = client.post(f"/api/v1/materials/modules/{code}/ingest", headers=headers)
    assert first.status_code == 200

    second = client.post(f"/api/v1/materials/modules/{code}/ingest", headers=headers)
    assert second.status_code == 200
    # The cooldown makes the second call a cheap no-op rather than a fresh crawl.
    assert second.json()["skipped"] is True
    assert second.json()["inserted"] == 0
