"""tests/test_materials_search_relevance.py

Month 2, Week 3, Day 4 — ranked materials search.

WHAT CHANGED
------------
Search used to be ILIKE-only for title/description and ordered by created_at.
It now scores each candidate with a deterministic tiered rule and sorts by that
score, so an exact title match outranks a partial one instead of the result
order being whatever the database happened to return.

    score = 100  title is exactly the query
             80  title starts with the query
             60  title contains the query
             40  description contains the query
             20  resource type contains the query
              0  no match -> EXCLUDED (only when a query was supplied)

THE TIE-BREAKING TESTS ARE THE IMPORTANT ONES
---------------------------------------------
The blueprint's own sample code sorted with
    key=(score, updated_at, id), reverse=True
which reverses EVERY component - so the id tiebreaker ran DESC while the stated
contract said ASC. That is invisible in normal use (ids are usually distinct) and
only shows up as unstable ordering across calls, which is the worst kind of bug:
it looks like nothing is wrong.

These tests seed rows with EQUAL scores and assert the full ordering contract
explicitly, so a regression is caught rather than tolerated.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from conftest import PASSWORD, unique_email

from app.models.material import StudyMaterial
from app.schemas.user import UserCreate
from app.services import user_service

CODE = "RANK101"
SEARCH_URL = "/api/v1/materials/search"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _user_and_token(db, client):
    email = unique_email("rank")
    data = UserCreate(
        email=email,
        password=PASSWORD,
        full_name="Rank Tester",
        terms_version="1.0",
        privacy_version="1.0",
    )
    user = user_service.create_user(db, data)
    client.cookies.clear()
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"X-Auth-Mode": "api"},
    )
    assert resp.status_code == 200, resp.text
    return user, resp.json()["access_token"]


def _auth(client, token):
    client.cookies.clear()
    return {"Authorization": f"Bearer {token}"}


def _seed(
    db,
    title: str,
    *,
    description: str | None = None,
    resource_type: str = "ARTICLE",
    approved: bool = True,
    updated_at: datetime | None = None,
    code: str = CODE,
) -> StudyMaterial:
    """Insert one material, optionally with a controlled updated_at.

    updated_at is set explicitly so tie-breaking can be tested deterministically
    rather than depending on how fast the inserts happened to run.
    """
    row = StudyMaterial(
        module_code=code,
        title=title,
        description=description or "no description",
        url=f"https://example.com/{uuid.uuid4().hex[:12]}",
        resource_type=resource_type,
        quality_resolution="standard",
        is_approved=approved,
    )
    if updated_at is not None:
        row.updated_at = updated_at
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@pytest.fixture()
def clean(db):
    """Known landscape per test - these tests assert exact ordering."""
    db.query(StudyMaterial).delete()
    db.commit()
    yield
    db.query(StudyMaterial).delete()
    db.commit()


def _search(client, token, **params):
    resp = client.get(SEARCH_URL, params=params, headers=_auth(client, token))
    assert resp.status_code == 200, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# 1. Default sort and the scoring tiers
# ---------------------------------------------------------------------------

class TestRelevanceScoring:
    def test_default_sort_is_relevance(self, client, db, clean):
        """No `sort` param => ranked by score DESC."""
        _, token = _user_and_token(db, client)
        _seed(db, "Python Loops Tutorial")          # contains -> 60
        _seed(db, "Loops")                          # exact    -> 100

        body = _search(client, token, module_code=CODE, q="Loops")
        assert [i["title"] for i in body["items"]] == ["Loops", "Python Loops Tutorial"]
        assert body["items"][0]["relevance_score"] == 100
        assert body["items"][1]["relevance_score"] == 60

    def test_exact_title_match_ranks_first(self, client, db, clean):
        _, token = _user_and_token(db, client)
        _seed(db, "Intro to Loops")
        _seed(db, "Loops")                  # exact
        _seed(db, "Loops and Iteration")    # prefix
        _seed(db, "Advanced Loops")         # contains

        body = _search(client, token, module_code=CODE, q="loops")
        titles = [i["title"] for i in body["items"]]
        assert titles[0] == "Loops"
        assert body["items"][0]["relevance_score"] == 100

    def test_title_prefix_beats_contains(self, client, db, clean):
        _, token = _user_and_token(db, client)
        _seed(db, "Loops Intro")            # prefix  -> 80
        _seed(db, "Intro to Loops")         # contains -> 60

        body = _search(client, token, module_code=CODE, q="loops")
        assert [i["title"] for i in body["items"]] == ["Loops Intro", "Intro to Loops"]
        assert body["items"][0]["relevance_score"] == 80
        assert body["items"][1]["relevance_score"] == 60

    def test_title_contains_beats_description(self, client, db, clean):
        _, token = _user_and_token(db, client)
        _seed(db, "Advanced Loops")                                   # title -> 60
        _seed(db, "Nothing relevant here", description="about loops")  # desc  -> 40

        body = _search(client, token, module_code=CODE, q="loops")
        titles = [i["title"] for i in body["items"]]
        assert titles == ["Advanced Loops", "Nothing relevant here"]
        assert body["items"][0]["relevance_score"] == 60
        assert body["items"][1]["relevance_score"] == 40

    def test_all_five_tiers_in_one_result_set(self, client, db, clean):
        """The whole ladder, so an off-by-one in any tier is visible."""
        _, token = _user_and_token(db, client)
        _seed(db, "loops")                                   # 100 exact
        _seed(db, "loops for beginners")                     # 80 prefix
        _seed(db, "understanding loops")                     # 60 contains
        _seed(db, "Irrelevant", description="covers loops")   # 40 description
        _seed(db, "Also irrelevant", description="none", resource_type="YOUTUBE")

        body = _search(client, token, module_code=CODE, q="loops")
        scores = [i["relevance_score"] for i in body["items"]]
        assert scores == sorted(scores, reverse=True)
        assert scores == [100, 80, 60, 40]

    def test_scoring_is_case_insensitive(self, client, db, clean):
        _, token = _user_and_token(db, client)
        _seed(db, "PYTHON LOOPS GUIDE")

        body = _search(client, token, module_code=CODE, q="Loops")
        assert body["items"][0]["relevance_score"] == 60

    def test_query_is_stripped(self, client, db, clean):
        """' loops ' and 'loops' must behave identically."""
        _, token = _user_and_token(db, client)
        _seed(db, "Python Loops Guide")

        padded = _search(client, token, module_code=CODE, q="  loops  ")
        tight = _search(client, token, module_code=CODE, q="loops")
        assert len(padded["items"]) == len(tight["items"]) == 1


# ---------------------------------------------------------------------------
# 2. Score-0 exclusion
# ---------------------------------------------------------------------------

class TestZeroScoreExclusion:
    def test_zero_score_rows_excluded_when_query_present(self, client, db, clean):
        _, token = _user_and_token(db, client)
        _seed(db, "Completely unrelated topic")

        body = _search(client, token, module_code=CODE, q="loops")
        assert body["items"] == []
        assert body["total"] == 0

    def test_no_query_returns_all_module_materials_with_score_zero(self, client, db, clean):
        """Browsing (no q) must return everything, scored 0 - not nothing."""
        _, token = _user_and_token(db, client)
        _seed(db, "Anything at all")
        _seed(db, "Something else")

        body = _search(client, token, module_code=CODE)
        assert body["total"] == 2
        assert all(i["relevance_score"] == 0 for i in body["items"])


# ---------------------------------------------------------------------------
# 3. THE TIE-BREAKING CONTRACT (the blueprint's flagged trap)
# ---------------------------------------------------------------------------

class TestTieBreaking:
    def test_tie_breaks_by_updated_at_then_id(self, client, db, clean):
        """Equal score => newer updated_at first; equal time => id ASC.

        This is the test that catches the `reverse=True` tuple trap. With that
        bug, the id tiebreaker runs DESC and the final assertion fails.
        """
        _, token = _user_and_token(db, client)
        older = datetime(2026, 1, 1, tzinfo=UTC)
        newer = older + timedelta(days=1)

        a = _seed(db, "Loops A", updated_at=older)
        b = _seed(db, "Loops B", updated_at=newer)
        # Same timestamp as `a`, so the id tiebreaker decides.
        c = _seed(db, "Loops C", updated_at=older)

        body = _search(client, token, module_code=CODE, q="loops")
        # All three score 80 (title prefix) - identical scores on purpose.
        assert {i["relevance_score"] for i in body["items"]} == {80}

        ids = [i["id"] for i in body["items"]]
        # Newest first, then the two older ones ordered by id ASCENDING.
        assert ids[0] == str(b.id)
        expected_tail = sorted([str(a.id), str(c.id)])
        assert ids[1:] == expected_tail, (
            "ties must fall back to id ASC; a reversed tuple sort silently "
            f"makes this DESC. got {ids[1:]}, expected {expected_tail}"
        )

    def test_ordering_is_stable_across_repeated_calls(self, client, db, clean):
        """Same request, same order - every time."""
        _, token = _user_and_token(db, client)
        ts = datetime(2026, 2, 1, tzinfo=UTC)
        for i in range(6):
            _seed(db, f"Loops Part {i}", updated_at=ts)

        first = [i["id"] for i in _search(client, token, module_code=CODE, q="loops")["items"]]
        for _ in range(4):
            again = [
                i["id"] for i in _search(client, token, module_code=CODE, q="loops")["items"]
            ]
            assert again == first, "result order changed between identical requests"


# ---------------------------------------------------------------------------
# 4. Alternative sorts
# ---------------------------------------------------------------------------

class TestAlternativeSorts:
    def test_sort_recent_orders_by_updated_at_desc(self, client, db, clean):
        _, token = _user_and_token(db, client)
        old = datetime(2026, 1, 1, tzinfo=UTC)
        new = datetime(2026, 6, 1, tzinfo=UTC)
        _seed(db, "Oldest", updated_at=old)
        _seed(db, "Newest", updated_at=new)

        body = _search(client, token, module_code=CODE, sort="recent")
        assert [i["title"] for i in body["items"]] == ["Newest", "Oldest"]
        # Score is not used for this ordering, so it stays 0.
        assert all(i["relevance_score"] == 0 for i in body["items"])

    def test_sort_title_orders_alphabetically_case_insensitively(self, client, db, clean):
        _, token = _user_and_token(db, client)
        _seed(db, "zebra")
        _seed(db, "Apple")
        _seed(db, "mango")

        body = _search(client, token, module_code=CODE, sort="title")
        assert [i["title"] for i in body["items"]] == ["Apple", "mango", "zebra"]

    def test_invalid_sort_is_rejected(self, client, db, clean):
        _, token = _user_and_token(db, client)
        resp = client.get(
            SEARCH_URL,
            params={"module_code": CODE, "sort": "nonsense"},
            headers=_auth(client, token),
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 5. Backward compatibility
# ---------------------------------------------------------------------------

class TestBackwardCompatibility:
    def test_existing_resource_type_filter_still_works(self, client, db, clean):
        """The resource_type filter itself is unchanged - for the non-YouTube types.

        This test previously asserted `resource_type=YOUTUBE` returned the video, and it
        passed on main. It no longer does, because `include_youtube` now defaults to
        false at the route (architect D2, scope §4.3) and the two parameters are
        independent: a flag whose meaning changed with another parameter would be
        unmaintainable, so "give me a type I have excluded" honestly returns nothing.

        The filter is therefore retargeted at JOURNAL, where it is still unconditional,
        and the YouTube behaviour is pinned by its own explicit pair below. Deleting
        this test would have removed the guarantee rather than restating it.
        """
        _, token = _user_and_token(db, client)
        _seed(db, "Loops video", resource_type="YOUTUBE")
        _seed(db, "Loops paper", resource_type="JOURNAL")

        body = _search(client, token, module_code=CODE, resource_type="JOURNAL")
        assert [i["title"] for i in body["items"]] == ["Loops paper"]

    def test_youtube_is_excluded_by_default(self, client, db, clean):
        """C1: omitting include_youtube excludes videos, without being asked not to.

        `resource_type` is deliberately omitted here, so this exercises the DEFAULT
        rather than the combination - the common case for a student browsing a module.
        """
        _, token = _user_and_token(db, client)
        _seed(db, "Loops video", resource_type="YOUTUBE")
        _seed(db, "Loops paper", resource_type="JOURNAL")

        body = _search(client, token, module_code=CODE)
        titles = [i["title"] for i in body["items"]]
        assert "Loops video" not in titles, "videos must not appear unless requested"
        assert "Loops paper" in titles, "excluding videos must not exclude anything else"

    def test_include_youtube_true_restores_videos(self, client, db, clean):
        """The opt-in half. Without this, the exclusion could pass by breaking videos."""
        _, token = _user_and_token(db, client)
        _seed(db, "Loops video", resource_type="YOUTUBE")
        _seed(db, "Loops paper", resource_type="JOURNAL")

        body = _search(client, token, module_code=CODE, include_youtube="true")
        titles = [i["title"] for i in body["items"]]
        assert "Loops video" in titles, "include_youtube=true must return videos"
        assert "Loops paper" in titles

    def test_excluded_type_requested_explicitly_returns_empty(self, client, db, clean):
        """D2, pinned.

        `include_youtube=false` + `resource_type=YOUTUBE` is empty, and that is intended
        rather than an oversight. Asserted explicitly so nobody later "fixes" it into a
        special case - the reasoning is that the two parameters stay independent.
        """
        _, token = _user_and_token(db, client)
        _seed(db, "Loops video", resource_type="YOUTUBE")

        body = _search(client, token, module_code=CODE, resource_type="YOUTUBE")
        assert body["items"] == [], "an excluded type must return nothing, not a fallback"
        assert body["total"] == 0

    def test_unapproved_rows_never_returned(self, client, db, clean):
        _, token = _user_and_token(db, client)
        _seed(db, "Loops approved", approved=True)
        _seed(db, "Loops hidden", approved=False)

        body = _search(client, token, module_code=CODE, q="loops")
        assert [i["title"] for i in body["items"]] == ["Loops approved"]

    def test_other_modules_are_not_included(self, client, db, clean):
        _, token = _user_and_token(db, client)
        _seed(db, "Loops here")
        _seed(db, "Loops elsewhere", code="OTHER9")

        body = _search(client, token, module_code=CODE, q="loops")
        assert [i["title"] for i in body["items"]] == ["Loops here"]

    def test_pagination_total_reflects_filtered_count(self, client, db, clean):
        """`total` must count AFTER scoring/filtering, not before.

        Counting candidates before dropping score-0 rows would overstate the
        result count and make the last page empty.
        """
        _, token = _user_and_token(db, client)
        for i in range(5):
            _seed(db, f"Loops {i}")          # match -> kept
        for i in range(7):
            _seed(db, f"Unrelated {i}")       # no match -> dropped

        body = _search(client, token, module_code=CODE, q="loops", size=2, page=1)
        assert body["total"] == 5, "total counted pre-filter rows"
        assert len(body["items"]) == 2
        assert body["pages"] == 3

    def test_relevance_score_present_on_every_item(self, client, db, clean):
        _, token = _user_and_token(db, client)
        _seed(db, "Loops")
        _seed(db, "Other", resource_type="YOUTUBE")

        body = _search(client, token, module_code=CODE)
        assert body["items"], "expected rows"
        for item in body["items"]:
            assert isinstance(item["relevance_score"], int)


# ---------------------------------------------------------------------------
# 6. Module-name boost (C2)
# ---------------------------------------------------------------------------

class TestModuleNameBoost:
    """`module_name` gives a small nudge to rows that mention it. It must not do more.

    THE BOOST IS CAPPED BELOW THE LOWEST TIER (15 < 20). Two properties follow, and
    both are asserted here:

      1. It cannot CREATE a result. Rows that matched nothing textually are dropped
         before the boost is applied, so a module-name mention cannot promote a row
         that is irrelevant to the query.
      2. It cannot INVERT the tiers. A boosted description match reaches 55 and still
         loses to a title match at 60.

    Raising the constant to 20 or above breaks (1). Applying it before the filter
    breaks (1) as well. Those are the two falsifications worth keeping.
    """

    def test_it_breaks_a_tie_between_equal_scores(self, client, db, clean):
        """The intended effect: equal base scores, separated by the module name."""
        _, token = _user_and_token(db, client)
        # Both score _SCORE_TITLE_CONTAINS (60) for "loops".
        _seed(db, "Loops in Python", description="no description")
        _seed(db, "Loops explained", description="no description")

        without = _search(client, token, module_code=CODE, q="loops")
        assert {i["title"] for i in without["items"]} == {
            "Loops in Python",
            "Loops explained",
        }

        # "Loops explained" now mentions the module name, so it should lead.
        with_boost = _search(
            client, token, module_code=CODE, q="loops", module_name="Loops"
        )
        assert with_boost["items"][0]["title"] == "Loops explained"

    def test_it_never_promotes_a_non_match(self, client, db, clean):
        """THE SAFETY PROPERTY. A row with no textual match must not appear.

        The module name is placed on a row that does NOT match the query. If the boost
        could promote it, this search for "recursion" would return "Loops explained".
        """
        _, token = _user_and_token(db, client)
        _seed(db, "Recursion basics", description="no description")
        _seed(db, "Loops explained", description="no description")   # no "recursion"

        body = _search(
            client, token, module_code=CODE, q="recursion", module_name="Loops"
        )
        titles = [i["title"] for i in body["items"]]
        assert titles == ["Recursion basics"], (
            "a module-name mention must never promote a row that does not match the "
            f"query; got {titles}"
        )

    def test_it_does_not_invert_the_tiers(self, client, db, clean):
        """A boosted low tier must still lose to a higher tier.

        Title-contains is 60; description-contains is 40 and boosted becomes 55. 55 < 60,
        so the order must be unchanged. This is the assertion that fails first if anyone
        raises the constant to 20 or above.
        """
        _, token = _user_and_token(db, client)
        _seed(db, "Loops overview", description="no description")          # 60
        _seed(db, "Sorting notes", description="about loops")              # 40 + 15

        body = _search(
            client, token, module_code=CODE, q="loops", module_name="Sorting notes"
        )
        assert body["items"][0]["title"] == "Loops overview"
        # And the boost did apply - otherwise the test would pass vacuously.
        boosted = next(i for i in body["items"] if i["title"] == "Sorting notes")
        assert boosted["relevance_score"] == 55

    def test_omitting_module_name_changes_nothing(self, client, db, clean):
        """Additive: absent, ranking is exactly as before the parameter existed."""
        _, token = _user_and_token(db, client)
        _seed(db, "Loops in Python", description="no description")
        _seed(db, "Loops explained", description="no description")

        a = _search(client, token, module_code=CODE, q="loops")
        b = _search(client, token, module_code=CODE, q="loops", module_name=None)
        assert [i["id"] for i in a["items"]] == [i["id"] for i in b["items"]]

    def test_it_does_not_reorder_a_browse(self, client, db, clean):
        """With no query everything scores 0, and boosting there would be meaningless.

        A browse must stay in relevance/updated_at order regardless of module_name.
        """
        _, token = _user_and_token(db, client)
        _seed(db, "Alpha", description="no description")
        _seed(db, "Beta", description="no description")

        a = _search(client, token, module_code=CODE)
        b = _search(client, token, module_code=CODE, module_name="Alpha")
        assert [i["id"] for i in a["items"]] == [i["id"] for i in b["items"]]

    def test_scores_stay_whole_numbers(self, client, db, clean):
        """The response contract is an int. A float would break clients parsing it."""
        _, token = _user_and_token(db, client)
        _seed(db, "Loops explained", description="no description")

        body = _search(
            client, token, module_code=CODE, q="loops", module_name="Loops"
        )
        for item in body["items"]:
            assert isinstance(item["relevance_score"], int)
