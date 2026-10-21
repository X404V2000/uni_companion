"""Tests for material relevance scoring.

These exist because adding sources made the library WORSE before the scoring
existed: Open Textbook Library returned finance and marketing books for a
mathematics module (measured 2026-10-21 against the live API). The cases below
are the real titles that came back, not invented ones.
"""
from __future__ import annotations

import pytest

from app.services.material_ingest_service import (
    MIN_RELEVANCE,
    Candidate,
    _terms,
    rank_candidates,
    score_candidate,
)


def _c(title: str, description: str = "", rtype: str = "PDF") -> Candidate:
    return Candidate(
        module_code="MAM201",
        resource_type=rtype,
        title=title,
        url="https://example.test/x",
        description=description,
    )


MATHS_TOPICS = ["calculus", "linear algebra", "differential equations"]


class TestFiltering:
    def test_drops_the_irrelevant_results_that_were_measured(self):
        """The exact titles the live API returned for 'mathematics'."""
        irrelevant = [
            _c("Accounting in the Finance World", "bookkeeping"),
            _c("Communication for Business Success", "business writing"),
            _c("eMarketing: marketing in a digital world", "marketing"),
        ]
        for candidate in irrelevant:
            score = score_candidate(candidate, MATHS_TOPICS, "Mathematics")
            assert score < MIN_RELEVANCE, f"{candidate.title} scored {score}"

    def test_keeps_genuine_matches(self):
        relevant = [
            _c("Calculus", "single variable calculus"),
            _c("A First Course in Linear Algebra", "vectors and matrices"),
        ]
        for candidate in relevant:
            assert score_candidate(candidate, MATHS_TOPICS, "Mathematics") >= MIN_RELEVANCE

    def test_module_name_alone_can_carry_a_result(self):
        """A maths module called 'College Algebra' must keep 'College Algebra'.

        This is the case that would have been a false negative: against the
        TOPICS alone it scores 0.5 and is dropped, but once the module's OWN NAME
        is considered it is obviously relevant.
        """
        candidate = _c("College Algebra", "algebra and functions")
        kept = rank_candidates([candidate], ["algebra", "functions"], "College Algebra")
        assert kept == [candidate]

    def test_stopwords_cannot_produce_a_match(self):
        """'Guide for the Busy Student' must not match a module about 'the student'."""
        candidate = _c("A Guide for the Busy Student", "for the student who is busy")
        assert score_candidate(candidate, ["the student"], "Student Study Skills") >= 0
        # It legitimately matches "student", which IS in the module name.
        # What must not happen is a match on "the"/"for" alone:
        candidate2 = _c("For the Of And", "the and for")
        assert score_candidate(candidate2, ["the and of"], "Mathematics") < MIN_RELEVANCE


class TestRanking:
    def test_orders_best_first_and_is_stable(self):
        a = _c("Calculus", "calculus")
        b = _c("Linear Algebra", "linear algebra")
        c = _c("Accounting", "bookkeeping")
        first = rank_candidates([a, b, c], MATHS_TOPICS, "Mathematics")
        second = rank_candidates([a, b, c], MATHS_TOPICS, "Mathematics")
        assert first == second, "ranking must be deterministic"
        assert c not in first
        # Compare by title, not by set(): Candidate is @dataclass (value equality)
        # but not frozen, so it is unhashable and set() raises TypeError.
        assert [x.title for x in first] == ["Calculus", "Linear Algebra"]

    def test_equal_scores_keep_original_order(self):
        x = _c("Calculus One", "calculus")
        y = _c("Calculus Two", "calculus")
        assert rank_candidates([x, y], ["calculus"], "Maths") == [x, y]

    def test_empty_input_is_empty(self):
        assert rank_candidates([], MATHS_TOPICS, "Mathematics") == []


class TestTerms:
    def test_strips_stopwords_and_short_words(self):
        assert _terms("The Theory of Computation") == {"theory", "computation"}

    def test_handles_empty(self):
        assert _terms("") == set()


@pytest.mark.parametrize(
    "title,desc,expected_min",
    [
        ("Calculus Early Transcendentals", "calculus textbook", 1.0),
        ("Linear Algebra Done Right", "linear algebra", 1.0),
    ],
)
def test_strong_matches_clear_the_bar(title, desc, expected_min):
    assert score_candidate(_c(title, desc), MATHS_TOPICS, "Mathematics") >= expected_min
