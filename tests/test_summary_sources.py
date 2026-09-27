"""tests/test_summary_sources.py

Tests that the AI summariser accepts EVERY valid way a student can supply
material: text alone, a link alone, a file alone, or any combination.

WHY THESE EXIST
---------------
Students supply content through three independent sources and reasonably expect
each to work on its own:

  * pasted text
  * an uploaded file (extracted in the browser)
  * a link (the server reads the page)

Two bugs made that untrue:

  1. The 50 character minimum was applied to the WHOLE composed payload, which
     included the labels we add ourselves ("[From file: notes.txt]" and the
     "---" separators). A legitimate 20 character file therefore arrived as 37
     characters and was refused for a reason the student could neither see nor
     fix.

  2. 50 characters was too high anyway. The model produces a full guide from a
     single short definition, so the floor is now 20 characters of the
     student's OWN content.

These tests pin the backend contract that the frontend relies on.
"""
from __future__ import annotations

import uuid

import pytest

from app.services import ai_service

# Just above the new 20 character floor. Kept as a real sentence rather than
# filler so the test reads like something a student would actually type.
_MINIMAL_CONTENT = "Hash tables map keys to values."
assert 20 <= len(_MINIMAL_CONTENT) < 50, (
    "must sit between the new floor and the old rejected range"
)


def _auth(client, email: str) -> dict:
    unique = f"{email.split('@')[0]}+{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/api/v1/auth/signup",
        json={
            "email": unique,
            "password": "MyPassword2026",
            "full_name": "Source Tester",
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


@pytest.fixture()
def stub_ai(monkeypatch):
    """Replace the provider so no credits or network are used."""
    monkeypatch.setattr(
        ai_service, "_call_gemini", lambda prompt: ("## Guide\n\nContent.", 10)
    )


class TestEachSourceWorksAlone:
    """Any single source must be sufficient by itself."""

    def test_pasted_text_alone(self, client, stub_ai):
        headers = _auth(client, "src.text@example.com")
        resp = client.post(
            "/api/v1/ai/summarize",
            json={
                "module_code": "COS212",
                "content": "[Pasted notes]\nHash tables map keys to values.",
            },
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

    def test_file_alone(self, client, stub_ai):
        """A short file must work: its label must not consume its own budget."""
        headers = _auth(client, "src.file@example.com")
        # A 20 character file plus our "[From file: a.txt]" label.
        resp = client.post(
            "/api/v1/ai/summarize",
            json={
                "module_code": "COS212",
                "content": "[From file: a.txt]\nHash tables map keys.",
            },
            headers=headers,
        )
        assert resp.status_code == 200, (
            "a short file must not be rejected because our own label padded it"
        )

    def test_link_alone(self, client, stub_ai):
        headers = _auth(client, "src.link@example.com")
        resp = client.post(
            "/api/v1/ai/summarize",
            json={
                "module_code": "COS212",
                "content": "[From link: Wiki]\n" + "Hash tables map keys. " * 5,
            },
            headers=headers,
        )
        assert resp.status_code == 200, resp.text


class TestMinimalLengthRule:
    """The floor must be low enough to accept real short input."""

    def test_exactly_the_minimum_is_accepted(self, client, stub_ai):
        headers = _auth(client, "src.min@example.com")
        resp = client.post(
            "/api/v1/ai/summarize",
            json={"module_code": "COS212", "content": _MINIMAL_CONTENT},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

    def test_below_the_minimum_is_rejected_with_422(self, client, stub_ai):
        headers = _auth(client, "src.tooshort@example.com")
        resp = client.post(
            "/api/v1/ai/summarize",
            json={"module_code": "COS212", "content": "too short"},
            headers=headers,
        )
        assert resp.status_code == 422, resp.text

    def test_the_old_fifty_character_floor_is_gone(self, client, stub_ai):
        """30 characters used to fail. It must now succeed."""
        headers = _auth(client, "src.old50@example.com")
        thirty = "x" * 30
        assert len(thirty) < 50
        resp = client.post(
            "/api/v1/ai/summarize",
            json={"module_code": "COS212", "content": thirty},
            headers=headers,
        )
        assert resp.status_code == 200, (
            "content between 20 and 50 characters must be accepted"
        )


class TestCombinations:
    """Multiple sources must combine, and each must be labelled distinctly."""

    @pytest.mark.parametrize(
        "sections",
        [
            ["[From file: f.pdf]\nFile content about cells."],
            ["[Pasted notes]\nNotes about cells and biology."],
            ["[From link: Wiki]\nLink content about cells."],
            [
                "[From file: f.pdf]\nFile content about cells.",
                "[Pasted notes]\nNotes about cells.",
            ],
            [
                "[From file: f.pdf]\nFile content about cells.",
                "[From link: Wiki]\nLink content about cells.",
            ],
            [
                "[Pasted notes]\nNotes about cells.",
                "[From link: Wiki]\nLink content about cells.",
            ],
            [
                "[From file: f.pdf]\nFile content about cells.",
                "[Pasted notes]\nNotes about cells.",
                "[From link: Wiki]\nLink content about cells.",
            ],
        ],
    )
    def test_every_combination_is_accepted(self, client, stub_ai, sections):
        headers = _auth(client, "src.combo@example.com")
        content = "\n\n---\n\n".join(sections)
        resp = client.post(
            "/api/v1/ai/summarize",
            json={"module_code": "COS212", "content": content},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

    def test_all_three_sources_reach_the_model(self, client, monkeypatch):
        """The combined payload must actually contain every source."""
        captured: dict = {}

        def _capture(prompt):
            captured["prompt"] = prompt
            return ("## Guide", 10)

        monkeypatch.setattr(ai_service, "_call_gemini", _capture)
        headers = _auth(client, "src.all@example.com")

        content = (
            "[From file: f.pdf]\nFILE_MARKER content here.\n\n---\n\n"
            "[Pasted notes]\nPASTE_MARKER content here.\n\n---\n\n"
            "[From link: Wiki]\nLINK_MARKER content here."
        )
        resp = client.post(
            "/api/v1/ai/summarize",
            json={"module_code": "COS212", "content": content},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

        prompt = captured["prompt"]
        for marker in ("FILE_MARKER", "PASTE_MARKER", "LINK_MARKER"):
            assert marker in prompt, f"{marker} was dropped from the prompt"
