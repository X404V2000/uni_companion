"""
tests/test_youtube_search_links.py

WHY THIS EXISTS
---------------
Videos matched a hand-maintained map of nine hard-science keywords. For a product
aimed at thousands of students across thousands of modules, that meant all but a
handful of modules showed no videos at all - silently. Adding buckets does not close
the gap: ~80 disciplines would need research and verification, and a student taking
Marine Biology or Setswana Syntax would still fall outside them.

An AI-proposed-ID approach was implemented and REVERTED. Asked for library-science
videos it returned Rick Astley, "Me at the zoo" and Gangnam Style - all real IDs, so
the oEmbed check passed them. Verification can confirm a thing exists; it cannot
confirm it is relevant. That is the lesson these tests encode.

So every module now gets a YouTube SEARCH link, which needs no key, no quota and no
maintenance, and works for any module that will ever exist. Curated videos still
appear when a topic matches a verified bucket.
"""

import json
from unittest.mock import patch

from app.services import material_ingest_service as ingest


def _oembed_ok(url):
    return json.dumps({"title": f"Verified {url[-11:]}"})


class TestSearchLinksAlwaysPresent:
    """A search link is added for every topic, whatever else was found."""

    def test_a_module_matching_no_bucket_still_gets_videos(self):
        # THE REGRESSION TEST. This is the case that produced zero videos: a module
        # whose topics match none of the nine buckets.
        topics = ["integrated library system", "digital preservation"]
        with patch.object(ingest, "_fetch", side_effect=_oembed_ok), patch.object(
            ingest.time, "sleep"
        ):
            out = ingest._collect_youtube("AIS2604", topics)
        assert out, "a module matching no bucket must still get something"
        assert all(c.resource_type == "YOUTUBE" for c in out)

    def test_search_links_are_added_even_when_curated_videos_were_found(self):
        # Both, not either: a student on a covered module still benefits from a
        # search link for the topic their curated video may not address.
        topics = ["data structure", "algorithm"]
        with patch.object(ingest, "_fetch", side_effect=_oembed_ok), patch.object(
            ingest.time, "sleep"
        ):
            out = ingest._collect_youtube("COS 212", topics)
        search = [c for c in out if "results?search_query=" in c.url]
        assert search, "search links must accompany curated videos, not replace them"

    def test_the_url_is_a_real_youtube_search(self):
        topics = ["integrated library system"]
        with patch.object(ingest, "_fetch", side_effect=_oembed_ok), patch.object(
            ingest.time, "sleep"
        ):
            out = ingest._collect_youtube("AIS2604", topics)
        link = next(c for c in out if "search_query=" in c.url)
        assert link.url.startswith("https://www.youtube.com/results?search_query=")
        # Spaces must be encoded - a raw space produces a URL a browser truncates.
        assert " " not in link.url
        assert "integrated+library+system" in link.url

    def test_the_title_says_it_is_a_search_not_a_recommendation(self):
        # The honest part. We did not choose these results, so the label must not
        # imply that we did.
        topics = ["library science"]
        with patch.object(ingest, "_fetch", side_effect=_oembed_ok), patch.object(
            ingest.time, "sleep"
        ):
            out = ingest._collect_youtube("AIS2604", topics)
        link = next(c for c in out if "search_query=" in c.url)
        assert link.title.startswith("Search YouTube:")
        assert "YouTube picks" in link.description

    def test_the_number_of_search_links_is_bounded(self):
        # A module with many derived topics must not fill the list with links.
        topics = [f"topic number {n}" for n in range(12)]
        with patch.object(ingest, "_fetch", side_effect=_oembed_ok), patch.object(
            ingest.time, "sleep"
        ):
            out = ingest._collect_youtube("X100", topics)
        search = [c for c in out if "search_query=" in c.url]
        assert len(search) == ingest.MAX_VIDEOS

    def test_whitespace_in_a_topic_does_not_break_the_url(self):
        topics = ["  graph   traversal  "]
        with patch.object(ingest, "_fetch", side_effect=_oembed_ok), patch.object(
            ingest.time, "sleep"
        ):
            out = ingest._collect_youtube("COS 212", topics)
        link = next(c for c in out if "search_query=" in c.url)
        assert "  " not in link.url
        assert link.url.count("+") >= 2

    def test_empty_topics_produce_no_search_links(self):
        with patch.object(ingest, "_fetch", side_effect=_oembed_ok), patch.object(
            ingest.time, "sleep"
        ):
            assert ingest._collect_youtube("X100", []) == []
