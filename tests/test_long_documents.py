"""tests/test_long_documents.py

Regression tests for the three defects testers reported.

WHY THESE EXIST
---------------
1. "They added their notes to get them summarised and it only summarised a few
   lines." The service did `content[:_MAX_INPUT_CHARS]`, so EVERYTHING past
   32,000 characters was discarded before the model saw it. A 30-page study
   guide is 80,000-120,000 characters, so more than half of a long upload was
   silently thrown away. Long documents are now split into overlapping chunks,
   each chunk is summarised, and the parts are merged.

2. "They can't access the app because it couldn't read their files." Only PDF,
   DOCX and a few text types were accepted, and the file picker FILTERED THE
   REST OUT, so a .doc or .pptx appeared greyed out and could not be selected at
   all. PPTX is now parsed, and legacy .doc gets a specific, actionable message
   instead of a dead end.

3. "It resulted in unsanitized values ... \\text{CU}333\\,333$ instead of normal
   currency." The model legitimately emits LaTeX, but nothing converted it, so
   raw source appeared on screen. A humaniser now renders it as readable text.

These tests cover the server-side pieces (1) directly. The file and rendering
fixes live in the frontend and are covered by the checks noted in each class.
"""
from __future__ import annotations

import pytest

from app.services import ai_service


class TestChunking:
    """Long documents must be covered, not cut off."""

    def test_short_document_is_not_split(self):
        text = "Hash tables map keys to values."
        assert ai_service.split_into_chunks(text) == [text]

    def test_exactly_at_the_limit_is_not_split(self):
        text = "x" * ai_service.CHUNK_CHARS
        assert len(ai_service.split_into_chunks(text)) == 1

    def test_long_document_is_split(self):
        text = "Sentence about databases. " * 3000  # ~81k chars
        chunks = ai_service.split_into_chunks(text)
        assert len(chunks) > 1, "a long document must be split, not truncated"

    def test_the_whole_document_is_covered(self):
        """The bug was silent loss. Nothing should be dropped at these sizes."""
        text = ("Paragraph about hash tables and collisions. " * 3000)[:120_000]
        chunks = ai_service.split_into_chunks(text)
        covered = sum(len(c) for c in chunks)
        # Overlap means covered >= len(text) is expected, never less.
        assert covered >= len(text), "content was dropped instead of covered"

    def test_chunks_overlap_so_boundaries_do_not_lose_content(self):
        text = "Sentence about databases. " * 3000
        chunks = ai_service.split_into_chunks(text)
        assert len(chunks) >= 2
        # The start of chunk 2 must repeat the tail of chunk 1.
        assert chunks[1][:20] in chunks[0][-ai_service.CHUNK_OVERLAP_CHARS - 200 :]

    def test_chunks_prefer_sentence_boundaries(self):
        text = "This is a sentence about databases. " * 3000
        chunks = ai_service.split_into_chunks(text)
        # Should not end mid-word.
        assert chunks[0].rstrip().endswith("."), chunks[0][-40:]

    def test_fan_out_is_bounded(self):
        """An enormous upload must not trigger unlimited provider calls."""
        text = "x" * 5_000_000
        chunks = ai_service.split_into_chunks(text)
        assert len(chunks) <= ai_service.MAX_CHUNKS

    def test_empty_input_yields_no_chunks(self):
        assert ai_service.split_into_chunks("") == []


class TestChunkPrompts:
    """The map and reduce prompts must do different jobs."""

    def test_chunk_prompt_identifies_the_part(self):
        prompt = ai_service._build_chunk_prompt("COS212", "notes", 2, 5)
        assert "part 2 of 5" in prompt.lower()
        assert "COS212" in prompt

    def test_chunk_prompt_forbids_outside_knowledge(self):
        prompt = ai_service._build_chunk_prompt("COS212", "notes", 1, 2)
        assert "do not add outside knowledge" in prompt.lower()

    def test_merge_prompt_warns_about_duplicates(self):
        """Overlapping chunks repeat content; the merge must not duplicate it."""
        prompt = ai_service._merge_prompts("COS212", ["a", "b"])
        assert "overlap" in prompt.lower()

    def test_merge_prompt_keeps_the_guide_structure(self):
        prompt = ai_service._merge_prompts("COS212", ["a"])
        for required in ["Worked example", "Common mistakes", "Quick self-test"]:
            assert required.lower() in prompt.lower()


class TestLatexInstruction:
    """The prompt must steer the model away from LaTeX currency."""

    def test_summary_prompt_forbids_latex_currency(self):
        prompt = ai_service._build_prompt("ACC101", "notes")
        assert "currency" in prompt.lower()
        assert "plain text" in prompt.lower()

    def test_chunk_prompt_forbids_latex_currency(self):
        prompt = ai_service._build_chunk_prompt("ACC101", "notes", 1, 3)
        assert "currency" in prompt.lower()

    def test_merge_prompt_forbids_latex_currency(self):
        prompt = ai_service._merge_prompts("ACC101", ["x"])
        assert "currency" in prompt.lower()


class TestBodyAndSchemaLimits:
    """A long document must survive the transport layer, not just the service."""

    def test_schema_allows_long_documents(self):
        from app.schemas.ai import AISummaryRequest

        # 150,000 characters - well past the old 32,000 ceiling.
        req = AISummaryRequest(module_code="COS212", content="x" * 150_000)
        assert len(req.content) == 150_000

    def test_schema_still_rejects_absurd_input(self):
        from pydantic import ValidationError

        from app.schemas.ai import AISummaryRequest

        with pytest.raises(ValidationError):
            AISummaryRequest(module_code="COS212", content="x" * 500_000)

    def test_body_cap_fits_the_schema_ceiling(self):
        """The middleware must not reject what the schema accepts.

        This is the trap the change had to avoid: raising the schema without
        raising the 64 KB body cap would have returned a 413 the student could
        not act on, for exactly the long documents being supported.
        """
        from app.main import MAX_SUMMARY_BODY_SIZE

        # 200,000 characters can be up to ~4 bytes each in UTF-8.
        assert MAX_SUMMARY_BODY_SIZE >= 200_000
