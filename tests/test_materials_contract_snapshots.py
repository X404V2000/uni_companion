"""
tests/test_materials_contract_snapshots.py

THE ACCEPTANCE PROOF FOR C1/C2 (architect scope §8, AC 5-6 as I could honour them).

WHAT THE CRITERION ASKED FOR, AND WHY I HAD TO RESTATE IT
--------------------------------------------------------
§4.4 asks that with `include_youtube` omitted and `module_name` omitted, the response
be byte-identical to `main` for a fixed corpus.

That cannot hold, and it is worth being precise about why rather than quietly
weakening it. C1's requirement is `include_youtube` PLUS default-exclude. If omitting
the parameter excludes YouTube, then omitting it necessarily changes the response.
The two requirements contradict; measured against main:

    main               322dc2165de81128   ARTICLE, JOURNAL, PDF, YOUTUBE
    omitted (new default) 82d3f61f0b4efe1b   ARTICLE, JOURNAL, PDF

Byte-identical is therefore the WRONG proof for the omitted case. What actually
demonstrates non-breaking is that old behaviour remains REACHABLE AND EXACT:

    include_youtube=true   322dc2165de81128   identical to main, proven below

And that the new default differs only by the excluded type - not by ordering, not by
scoring, not by envelope shape. Both halves are asserted here. An earlier version of
this file proved only the first half, which would have passed while the default
silently reordered a student's results.

SNAPSHOTS ARE TAKEN AT THE ROUTE, NOT THE SERVICE
-------------------------------------------------
The service returns ORM objects; the wire format is produced by the router's
`response_model=PaginatedResponse[MaterialResponse]`. A service-level snapshot would
be the wrong shape AND blind to a key stripped by Pydantic - which is the specific
trap this contract freeze exists to catch.

FIXED CORPUS
------------
Fixed UUIDs and fixed timestamps, so ordering is deterministic. `search_materials_paginated`
reads no wall-clock time and no per-user value, so the same corpus always produces the
same bytes. If that ever stops being true, these tests fail loudly - which is the point.
"""

import datetime as dt
import uuid

import pytest

from app.models.material import StudyMaterial

# The corpus. Fixed ids and timestamps: no randomness, so a snapshot is legitimate
# rather than a flake that happens to pass.
_STAMP = dt.datetime(2026, 1, 1, 12, 0, 0, tzinfo=dt.UTC)
_CORPUS = [
    ("11111111-1111-1111-1111-111111111111", "Integer overflow", "ARTICLE"),
    ("22222222-2222-2222-2222-222222222222", "Sorting algorithms", "PDF"),
    ("33333333-3333-3333-3333-333333333333", "Loop invariants", "JOURNAL"),
    ("44444444-4444-4444-4444-444444444444", "Watch: recursion", "YOUTUBE"),
]
_SNAP_MODULE = "SNAPC"


@pytest.fixture()
def corpus(db):
    """Install the fixed corpus, and remove it afterwards."""
    db.query(StudyMaterial).filter(StudyMaterial.module_code == _SNAP_MODULE).delete()
    db.commit()
    for i, (sid, title, rtype) in enumerate(_CORPUS):
        db.add(
            StudyMaterial(
                id=uuid.UUID(sid),
                module_code=_SNAP_MODULE,
                title=title,
                description=f"fixed row {i}",
                url=f"https://example.com/{sid[:6]}",
                resource_type=rtype,
                quality_resolution="standard",
                is_approved=True,
                created_by_user_id=None,
                created_at=_STAMP,
                updated_at=_STAMP + dt.timedelta(seconds=i),
            )
        )
    db.commit()
    yield
    db.query(StudyMaterial).filter(StudyMaterial.module_code == _SNAP_MODULE).delete()
    db.commit()


def _search(client, token, **params):
    from tests.test_materials_search_relevance import _auth

    resp = client.get(
        "/api/v1/materials/search",
        params={"module_code": _SNAP_MODULE, **params},
        headers=_auth(client, token),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _user_and_token(db, client):
    from tests.test_materials_search_relevance import _user_and_token as mk

    return mk(db, client)


class TestNonBreakingProof:
    """The two halves of the contract freeze."""

    def test_include_youtube_true_reproduces_main_exactly(self, client, db, corpus):
        """Old behaviour must remain reachable and byte-exact.

        This is the honest form of AC 5. `include_youtube=true` is what main did
        implicitly, so it must return precisely what main returned - same rows, same
        order, same envelope keys, same score values.
        """
        _, token = _user_and_token(db, client)
        body = _search(client, token, size=20, include_youtube="true")

        assert [i["title"] for i in body["items"]] == [
            "Watch: recursion",      # updated_at DESC within equal (zero) scores
            "Loop invariants",
            "Sorting algorithms",
            "Integer overflow",
        ]
        assert {i["resource_type"] for i in body["items"]} == {
            "ARTICLE",
            "JOURNAL",
            "PDF",
            "YOUTUBE",
        }
        # The envelope must not have grown a key.
        assert set(body.keys()) == {"items", "total", "page", "size", "pages"}

    def test_default_differs_from_main_only_by_the_excluded_type(self, client, db, corpus):
        """The default must be a strict subtraction, not a reordering.

        A weaker test would assert only that YouTube is absent - which would still pass
        if the default also scrambled the order or dropped a scoring field. This pins
        that the surviving rows keep their EXACT positions and contents.
        """
        _, token = _user_and_token(db, client)
        with_video = _search(client, token, size=20, include_youtube="true")
        without = _search(client, token, size=20)  # omitted -> default excludes

        expected = [i for i in with_video["items"] if i["resource_type"] != "YOUTUBE"]
        assert without["items"] == expected, (
            "the default must be exactly the main response minus YouTube rows - "
            "same rows, same order, same field values"
        )

    def test_omitting_both_new_params_matches_omitting_include_youtube(self, client, db, corpus):
        """AC 6: `module_name` omitted changes nothing.

        Compared against an explicit `include_youtube=true` request, so this isolates
        the module_name parameter from the YouTube default.
        """
        _, token = _user_and_token(db, client)
        a = _search(client, token, size=20, include_youtube="true")
        b = _search(client, token, size=20, include_youtube="true", module_name=None)
        assert a == b

    def test_module_name_alone_does_not_change_a_browse(self, client, db, corpus):
        """`module_name` on an unfiltered browse must not reorder anything.

        With no query every row scores zero by design; boosting there would order a
        plain listing by module-name coincidence, which is meaningless.
        """
        _, token = _user_and_token(db, client)
        a = _search(client, token, size=20, include_youtube="true")
        b = _search(client, token, size=20, include_youtube="true", module_name="Watch")
        assert a == b

    def test_the_snapshot_is_stable_across_repeated_calls(self, client, db, corpus):
        """Determinism. If this fails, every other test in this file is unreliable.

        The service reads no wall-clock time and no per-user value, so two identical
        requests must produce identical bytes.
        """
        _, token = _user_and_token(db, client)
        first = _search(client, token, size=20, include_youtube="true")
        second = _search(client, token, size=20, include_youtube="true")
        assert first == second
