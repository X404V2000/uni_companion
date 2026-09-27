"""tests/test_summary_prompt.py

Tests for the study-guide prompt and its output budget.

WHY THESE EXIST
---------------
The summary used to be "dull, unstructured and gives less information": the
prompt literally asked for "CONCISE markdown bullet points, max 8 insights",
and the model obediently produced a flat eight-bullet list with no sections, no
worked example and no guidance on common mistakes.

Meanwhile `maxOutputTokens` was hard-coded to 512, which truncated any longer
response mid-sentence - so even when the model tried to be thorough it was cut
off.

These tests pin the structure that made the output useful, and the budget that
stops it being truncated. They never call the network.
"""
from __future__ import annotations

from app.core.config import settings
from app.services import ai_service


class TestPromptStructure:
    """The prompt must ASK for a structured guide, or we get a flat list back."""

    def setup_method(self):
        self.prompt = ai_service._build_prompt("COS212", "Some notes about trees.")

    def test_asks_for_markdown_sections(self):
        assert "##" in self.prompt
        assert "markdown" in self.prompt.lower()

    def test_requires_the_sections_that_make_it_useful(self):
        # Each of these maps to something a student needs when revising.
        for required in [
            "overview",
            "Worked example",
            "Common mistakes",
            "Quick self-test",
        ]:
            assert required.lower() in self.prompt.lower(), required

    def test_explicitly_wants_depth(self):
        # The old prompt said "CONCISE ... max 8 insights". Brevity instruction
        # is what produced the dull output, so it must not come back.
        lowered = self.prompt.lower()
        assert "max 8" not in lowered
        assert "depth" in lowered

    def test_forbids_inventing_content(self):
        # A confident fabrication is worse than admitting a gap in the notes.
        lowered = self.prompt.lower()
        assert "do not invent" in lowered
        assert "only" in lowered  # "based ONLY on the notes below"

    def test_asks_for_examples_and_maths(self):
        lowered = self.prompt.lower()
        assert "example" in lowered
        assert "latex" in lowered

    def test_includes_the_notes_and_module(self):
        assert "COS212" in self.prompt
        assert "Some notes about trees." in self.prompt

    def test_notes_are_bounded(self):
        """A huge upload must not build an unbounded prompt."""
        huge = "x" * (ai_service._MAX_INPUT_CHARS + 5_000)
        prompt = ai_service._build_prompt("BIG101", huge)
        assert len(prompt) < ai_service._MAX_INPUT_CHARS + 2_000


class TestOutputBudget:
    """The token ceiling must leave room for a full guide."""

    def test_budget_is_far_above_the_old_512(self):
        # 512 truncated real guides mid-sentence.
        assert settings.summary_max_output_tokens >= 2000

    def test_budget_is_configurable_not_hard_coded(self):
        # Setting it in config means it can be tuned without a code change.
        assert isinstance(settings.summary_max_output_tokens, int)
        assert settings.summary_max_output_tokens == int(
            settings.summary_max_output_tokens
        )

    def test_temperature_allows_prose_but_stays_factual(self):
        # Too low produced flat lists; too high risks invented detail.
        assert 0.3 <= settings.summary_temperature <= 0.9

    def test_generation_config_uses_the_settings(self, monkeypatch):
        """_call_gemini must actually send the configured budget."""
        captured: dict = {}

        class _Resp:
            status_code = 200

            @staticmethod
            def json():
                return {
                    "candidates": [
                        {"content": {"parts": [{"text": "guide"}]}}
                    ],
                    "usageMetadata": {"totalTokenCount": 10},
                }

        class _Client:
            def __init__(self, *a, **kw):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def post(self, url, params=None, json=None):
                captured.update(json or {})
                return _Resp()

        monkeypatch.setattr(ai_service.httpx, "Client", _Client)
        monkeypatch.setattr(
            ai_service.settings, "gemini_api_key", "test-key", raising=False
        )

        ai_service._call_gemini("prompt")

        gen = captured.get("generationConfig", {})
        assert gen.get("maxOutputTokens") == settings.summary_max_output_tokens
        assert gen.get("temperature") == settings.summary_temperature
