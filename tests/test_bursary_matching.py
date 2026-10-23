"""tests/test_bursary_matching.py

PURPOSE
-------
Prove the bursary matching does what the design says, and prove the two things
that matter most about it:

  1. A bursary that has CLOSED is never shown. A dead application link is the
     single worst thing this feature can do - it sends a student to a page where
     they cannot apply, after they may have relied on it.
  2. A bursary the student is NOT ELIGIBLE for never appears. Showing a
     postgraduate-only fund to a first-year wastes the one thing the feature is
     for: their attention.

The scoring is unit-tested directly, without a database, because it is pure.
"""
from __future__ import annotations

from datetime import date

import pytest

from app.models.bursary import Bursary
from app.models.user import User
from app.services import bursary_service as svc

TODAY = date(2026, 10, 23)


def _user(**kw) -> User:
    """A student, with only the fields matching actually reads."""
    defaults = dict(
        email="student@example.com",
        full_name="Test Student",
        hashed_password="x",
        university="University of Cape Town",
        field_of_study="Computer Science",
        year_of_study=2,
    )
    defaults.update(kw)
    return User(**defaults)


def _bursary(**kw) -> Bursary:
    defaults = dict(
        name="Test Fund",
        provider="Test Provider",
        description="A fund.",
        url="https://example.org/apply",
        is_active=True,
    )
    defaults.update(kw)
    return Bursary(**defaults)


class TestEligibility:
    """Hard requirements. Failing one means EXCLUDED, not down-ranked."""

    def test_closed_bursary_is_excluded(self):
        closed = _bursary(application_closes=date(2026, 10, 22))
        assert svc.eligible(closed, _user(), TODAY) is False

    def test_bursary_closing_today_is_still_eligible(self):
        """Closing TODAY must still show - the student can still apply today."""
        today = _bursary(application_closes=TODAY)
        assert svc.eligible(today, _user(), TODAY) is True

    def test_bursary_with_no_closing_date_is_eligible(self):
        """Unknown is not the same as closed. Do not hide it."""
        rolling = _bursary(application_closes=None)
        assert svc.eligible(rolling, _user(), TODAY) is True

    def test_inactive_bursary_is_excluded(self):
        retired = _bursary(is_active=False)
        assert svc.eligible(retired, _user(), TODAY) is False

    def test_year_below_minimum_is_excluded(self):
        third_year_only = _bursary(min_year=3)
        assert svc.eligible(third_year_only, _user(year_of_study=1), TODAY) is False

    def test_year_above_maximum_is_excluded(self):
        first_and_second = _bursary(max_year=2)
        assert svc.eligible(first_and_second, _user(year_of_study=4), TODAY) is False

    def test_year_inside_range_is_eligible(self):
        for_year = _bursary(min_year=2, max_year=3)
        assert svc.eligible(for_year, _user(year_of_study=2), TODAY) is True

    def test_unknown_year_is_not_excluded(self):
        """A student who has not set a year must still see open bursaries.

        Excluding them would punish an incomplete profile with an empty screen,
        which is the worst possible first impression of the feature.
        """
        restricted = _bursary(min_year=3)
        assert svc.eligible(restricted, _user(year_of_study=None), TODAY) is True


class TestScoring:
    def test_matching_field_of_study_scores_and_explains(self):
        # 'computer science' appears in the seed as its own phrase. The matcher
        # no longer punts from 'computing' to 'Computer Science' - see
        # TestFieldMatchingPrecision for why that was removed.
        computing = _bursary(fields_of_study=["computer science", "engineering"])
        score, reasons = svc.score(computing, _user(field_of_study="Computer Science"), TODAY)
        assert score > 0
        # The reason must name the student's own field so it reads as personal,
        # not as a generic "matches your field". Assert the meaning, not a
        # particular phrasing: the copy may be reworded, the guarantee may not.
        assert any("Computer Science" in r for r in reasons), reasons

    def test_unrelated_field_still_eligible_but_scores_zero(self):
        """A computing student may still apply to an open commerce fund."""
        commerce = _bursary(fields_of_study=["commerce"])
        score, _ = svc.score(commerce, _user(field_of_study="Computer Science"), TODAY)
        assert score == 0

    def test_instituion_match_scores(self):
        uct = _bursary(institutions=["University of Cape Town"])
        score, reasons = svc.score(uct, _user(), TODAY)
        assert score > 0
        assert reasons

    def test_closing_soon_adds_urgency(self):
        soon = _bursary(application_closes=date(2026, 11, 5))   # 13 days
        later = _bursary(application_closes=date(2027, 6, 1))   # months away
        soon_score, soon_reasons = svc.score(soon, _user(), TODAY)
        later_score, _ = svc.score(later, _user(), TODAY)
        assert soon_score > later_score
        assert any("days" in r.lower() for r in soon_reasons), soon_reasons

    def test_restricted_bursary_outranks_unrestricted(self):
        """A fund aimed at this student beats one that targets everyone."""
        targeted = _bursary(
            fields_of_study=["computing"], institutions=["University of Cape Town"]
        )
        open_to_all = _bursary()
        targeted_score, _ = svc.score(targeted, _user(), TODAY)
        open_score, _ = svc.score(open_to_all, _user(), TODAY)
        assert targeted_score > open_score


class TestFieldMatchingPrecision:
    """Regression: the prefix matcher matched unrelated fields.

    Measured 2026-10-23 against the seeded data: a Computer Science student was
    shown a Nursing bursary with the reason "For Computer Science students",
    because "Computer SCience" and "health SCIences" share "sci". A false
    claim printed next to a bursary destroys the feature's credibility.
    """

    def test_computer_science_does_not_match_nursing(self):
        nursing = _bursary(
            name="Nursing Bursary", fields_of_study=["nursing", "health sciences", "medicine"]
        )
        score, _ = svc.score(nursing, _user(field_of_study="Computer Science"), TODAY)
        assert score == 0

    def test_generic_science_words_alone_do_not_match(self):
        """'Science' is too generic to identify a field by itself."""
        health = _bursary(fields_of_study=["health sciences"])
        score, _ = svc.score(health, _user(field_of_study="Political Science"), TODAY)
        assert score == 0

    def test_plural_folding_matches(self):
        """'Computer Science' and 'computer sciences' are the same field."""
        fund = _bursary(fields_of_study=["computer sciences"])
        score, _ = svc.score(fund, _user(field_of_study="Computer Science"), TODAY)
        assert score > 0

    def test_real_field_match_still_works(self):
        accounting = _bursary(fields_of_study=["accounting", "commerce"])
        score, reasons = svc.score(accounting, _user(field_of_study="Accounting"), TODAY)
        assert score > 0
        assert any("Accounting" in r for r in reasons)

    def test_engineering_matches_sub_discipline(self):
        """A Chemical Engineering student must match an engineering bursary."""
        eng = _bursary(fields_of_study=["engineering"])
        score, _ = svc.score(eng, _user(field_of_study="Chemical Engineering"), TODAY)
        assert score > 0


class TestRanking:
    def test_rank_drops_closed_and_orders_by_score(self):
        closed = _bursary(name="Closed", application_closes=date(2026, 1, 1))
        targeted = _bursary(
            name="Targeted",
            fields_of_study=["computing"],
            application_closes=date(2027, 1, 31),
        )
        open_fund = _bursary(name="Open", application_closes=date(2027, 3, 31))

        result = svc.rank([closed, targeted, open_fund], _user(), TODAY)
        names = [b.name for b, _s, _r in result]

        assert "Closed" not in names
        assert names == ["Targeted", "Open"], names

    def test_rank_is_deterministic(self):
        a = _bursary(name="A", application_closes=date(2027, 1, 31))
        b = _bursary(name="B", application_closes=date(2027, 1, 31))
        first = [x[0].name for x in svc.rank([a, b], _user(), TODAY)]
        second = [x[0].name for x in svc.rank([a, b], _user(), TODAY)]
        assert first == second

    def test_ties_close_sooner_first(self):
        soon = _bursary(name="Soon", application_closes=date(2026, 12, 1))
        later = _bursary(name="Later", application_closes=date(2027, 6, 1))
        result = [b.name for b, _s, _r in svc.rank([later, soon], _user(), TODAY)]
        assert result == ["Soon", "Later"]

    def test_empty_input(self):
        assert svc.rank([], _user(), TODAY) == []


@pytest.mark.parametrize(
    "field,year,expected",
    [
        ("Computer Science", 1, True),
        ("Computer Science", 4, True),
        ("Law", 2, True),
    ],
)
def test_open_bursary_matches_anyone(field, year, expected):
    open_fund = _bursary()
    user = _user(field_of_study=field, year_of_study=year)
    assert svc.eligible(open_fund, user, TODAY) is expected
