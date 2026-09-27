"""scripts/ingest_real_materials.py

PURPOSE
-------
Populate the study-materials library with REAL, reachable resources for any
module a student has created.

WHY THIS IS DYNAMIC (no hardcoded modules)
------------------------------------------
An earlier version of this script listed module codes (INF154, COS212, ...).
That is wrong for this product: students enter their own modules, so any module
the author did not happen to enumerate — INS2702, MAT233, anything at another
university — silently got zero resources and Find Materials looked broken.

Instead this script:
  1. reads the modules that actually exist in the database (any user, any code),
  2. asks the AI to derive core topics from each module's NAME (the name is the
     primary identifier per the product rules), with a keyword fallback if the
     AI is unavailable,
  3. searches Wikipedia, arXiv and Open Library for those topics,
  4. validates every candidate URL and DISCARDS anything that does not answer
     successfully,
  5. upserts what survives.

LEGALITY / SOURCE POLICY
------------------------
Only sources that permit programmatic access:
  * Wikipedia / Wikimedia REST API — CC BY-SA, attributed in the description.
  * arXiv API over https — open-access preprints.
  * Open Library API — open bibliographic data.
  * YouTube — never scraped. Candidate IDs are validated through the official
    oEmbed endpoint; only 200 responses are kept, and the title comes from
    YouTube rather than being invented.

No search-engine scraping and no robots.txt evasion.

USAGE
-----
    # every module in the database
    venv/bin/python scripts/ingest_real_materials.py

    # one module (e.g. after a student adds it)
    venv/bin/python scripts/ingest_real_materials.py --module INS2702

    # preview without writing
    venv/bin/python scripts/ingest_real_materials.py --dry-run

Idempotent: upserts on (module_code, url), so re-running adds nothing twice.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass

# --- Politeness: identify ourselves and pace requests ------------------------
USER_AGENT = (
    "VarsityCompanion/1.0 (student hackathon project; educational use; "
    "contact: varsity-companion@example.com)"
)
REQUEST_DELAY = 0.7  # seconds between calls; the Wikimedia API rate-limits hard
TIMEOUT = 20
MAX_RETRIES = 3

# How many topics to derive per module, and how many items to take per source.
TOPIC_COUNT = 6
ARXIV_PER_MODULE = 3
BOOKS_PER_MODULE = 2

# Verified-embeddable video IDs, keyed by TOPIC KEYWORD (never by module code).
# A module matches a bucket when one of its derived topics contains the keyword,
# so a brand-new module still receives relevant videos without being listed
# anywhere. Every ID here was checked against the YouTube oEmbed endpoint
# (HTTP 200); the stored title is fetched from YouTube, never invented.
VIDEO_BUCKETS: dict[str, list[str]] = {
    # programming / software
    "programming": ["zOjov-2OZ0E", "rfscVS0vtbw", "t8pPdKYpowI", "vLnPwxZdW4Y"],
    "algorithm": ["8hly31xKli0", "RBSGKlAvoiM", "0IAPZzGSbME"],
    "complexity": ["v4cd1O4zkGw"],
    "data structure": ["RBSGKlAvoiM", "8hly31xKli0"],
    "dynamic programming": ["oBt53YbR9Kk"],
    "python": ["rfscVS0vtbw", "t8pPdKYpowI"],
    # mathematics
    "calculus": ["WUvTyaaNkzM"],
    "linear algebra": ["WUvTyaaNkzM"],
}


@dataclass
class Candidate:
    """A resource we intend to store, pending validation."""

    module_code: str
    resource_type: str  # YOUTUBE | JOURNAL | PDF | ARTICLE
    title: str
    url: str
    description: str


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------

def _fetch(url: str, *, accept: str | None = None) -> bytes | None:
    """GET a URL with the project User-Agent, retrying on transient failures.

    Returns the body, or None when the resource is unavailable. None means the
    caller DISCARDS the candidate — nothing unverified is ever stored.
    """
    for attempt in range(MAX_RETRIES):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        if accept:
            req.add_header("Accept", accept)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                if 200 <= resp.status < 300:
                    return resp.read()
                return None
        except urllib.error.HTTPError as exc:
            # 429 = rate limited: back off and retry. Other 4xx = permanently bad.
            if exc.code == 429 and attempt < MAX_RETRIES - 1:
                time.sleep(2 ** (attempt + 2))
                continue
            return None
        except Exception:
            if attempt < MAX_RETRIES - 1:
                time.sleep(1.5 ** (attempt + 1))
                continue
            return None
    return None


def is_url_alive(url: str) -> bool:
    """True only if the URL answers successfully. This is the validation gate."""
    time.sleep(REQUEST_DELAY)
    return _fetch(url) is not None


def is_youtube_real(video_id: str) -> tuple[bool, str]:
    """Validate a YouTube ID via the OFFICIAL oEmbed endpoint.

    oEmbed returning 200 proves the video exists and is embeddable — far
    stronger than trusting a guessed ID.
    """
    url = (
        "https://www.youtube.com/oembed?url="
        f"https://www.youtube.com/watch?v={video_id}&format=json"
    )
    body = _fetch(url)
    if not body:
        return False, ""
    try:
        return True, json.loads(body).get("title", "")
    except Exception:
        return False, ""


# ---------------------------------------------------------------------------
# Topic derivation — works for ANY module name
# ---------------------------------------------------------------------------

_STOPWORDS = {
    "for", "and", "the", "of", "in", "to", "an", "a", "introduction", "intro",
    "principles", "fundamentals", "advanced", "topics", "selected", "special",
}


def fallback_topics(module_name: str) -> list[str]:
    """Keyword fallback used when the AI is unavailable.

    Strips common filler words from the module name and searches with the
    meaningful words plus the whole name. Crude, but it always yields something
    searchable so a module is never left with zero resources.
    """
    words = re.findall(r"[A-Za-z][A-Za-z\-]+", module_name)
    meaningful = [w for w in words if w.lower() not in _STOPWORDS and len(w) > 2]

    topics: list[str] = []
    if module_name.strip():
        topics.append(module_name.strip())
    if len(meaningful) >= 2:
        topics.append(" ".join(meaningful[:3]))
    topics.extend(meaningful[:4])

    seen: set[str] = set()
    unique: list[str] = []
    for t in topics:
        if t.lower() not in seen:
            seen.add(t.lower())
            unique.append(t)
    return unique[:TOPIC_COUNT] or [module_name.strip() or "study skills"]


def derive_topics(module_code: str, module_name: str) -> list[str]:
    """Derive core study topics from a module NAME.

    Primary path: ask the AI, which handles arbitrary real-world module names
    (it produced correct topics for both INS2702 and MAT233 in testing).
    Fallback: keyword extraction, so this never hard-fails.
    """
    try:
        sys.path.insert(0, ".")
        from app.services import ai_service

        prompt = (
            "You convert a university module into search keywords for finding "
            "study resources on Wikipedia, arXiv and Open Library.\n"
            f"Module code: {module_code}\nModule name: {module_name}\n\n"
            f"Return ONLY a JSON array of {TOPIC_COUNT} short English search "
            "phrases (2-4 words each) naming the core academic topics of this "
            "module. No prose, no markdown fences.\n"
            'Example: ["binary search tree","hash table","graph traversal",'
            '"dynamic programming","sorting algorithm","time complexity"]'
        )
        text, _tokens = ai_service._call_gemini(prompt)
        cleaned = (
            text.strip()
            .removeprefix("```json")
            .removeprefix("```")
            .removesuffix("```")
            .strip()
        )
        topics = [str(t).strip() for t in json.loads(cleaned) if str(t).strip()]
        if topics:
            return topics[:TOPIC_COUNT]
    except Exception as exc:  # noqa: BLE001 - any failure falls back
        print(f"    ai topics unavailable ({type(exc).__name__}); using keywords")
    return fallback_topics(module_name)


# ---------------------------------------------------------------------------
# Source collectors
# ---------------------------------------------------------------------------

def collect_wikipedia(module_code: str, topics: list[str]) -> list[Candidate]:
    """Fetch real Wikipedia summaries (CC BY-SA) for each derived topic."""
    out: list[Candidate] = []
    for topic in topics:
        slug = urllib.parse.quote(topic.replace(" ", "_"))
        body = _fetch(f"https://en.wikipedia.org/api/rest_v1/page/summary/{slug}")
        if not body:
            continue
        try:
            data = json.loads(body)
        except Exception:
            continue
        page = data.get("content_urls", {}).get("desktop", {}).get("page")
        extract = (data.get("extract") or "").strip().replace("\n", " ")
        # Skip disambiguation pages and stubs — they are not useful material.
        if not page or len(extract) < 120 or data.get("type") == "disambiguation":
            continue
        summary = extract[:220] + ("…" if len(extract) > 220 else "")
        out.append(
            Candidate(
                module_code=module_code,
                resource_type="ARTICLE",
                title=data.get("title", topic),
                url=page,
                description=f"{summary} (Source: Wikipedia, CC BY-SA)",
            )
        )
    return out


def collect_arxiv(module_code: str, query: str) -> list[Candidate]:
    """Fetch real open-access papers from the arXiv API."""
    q = urllib.parse.quote(f'all:"{query}"')
    api = (
        f"https://export.arxiv.org/api/query?search_query={q}"
        f"&max_results={ARXIV_PER_MODULE}&sortBy=relevance"
    )
    body = _fetch(api)
    if not body:
        return []
    try:
        root = ET.fromstring(body)
    except Exception:
        return []

    ns = {"a": "http://www.w3.org/2005/Atom"}
    out: list[Candidate] = []
    for entry in root.findall("a:entry", ns):
        title_el = entry.find("a:title", ns)
        id_el = entry.find("a:id", ns)
        sum_el = entry.find("a:summary", ns)
        if title_el is None or id_el is None:
            continue
        title = " ".join((title_el.text or "").split())
        # Normalise to https (the API returns http, which redirects).
        link = (id_el.text or "").strip().replace("http://", "https://", 1)
        abstract = " ".join((sum_el.text or "").split()) if sum_el is not None else ""
        if not title or not link:
            continue
        out.append(
            Candidate(
                module_code=module_code,
                resource_type="JOURNAL",
                title=title[:200],
                url=link,
                description=(
                    (abstract[:200] + "…" if len(abstract) > 200 else abstract)
                    or "Open-access paper via arXiv"
                ),
            )
        )
    return out


def collect_openlibrary(module_code: str, query: str) -> list[Candidate]:
    """Fetch real book records from the Open Library API."""
    api = (
        f"https://openlibrary.org/search.json?q={urllib.parse.quote(query)}"
        f"&limit={BOOKS_PER_MODULE}"
        "&fields=title,key,author_name,first_publish_year"
    )
    body = _fetch(api)
    if not body:
        return []
    try:
        docs = json.loads(body).get("docs", [])
    except Exception:
        return []
    out: list[Candidate] = []
    for d in docs:
        key, title = d.get("key"), d.get("title")
        if not key or not title:
            continue
        authors = ", ".join(d.get("author_name") or []) or "Unknown author"
        year = d.get("first_publish_year")
        out.append(
            Candidate(
                module_code=module_code,
                resource_type="PDF",  # book/reference record
                title=title[:200],
                url=f"https://openlibrary.org{key}",
                description=(
                    f"{authors}"
                    + (f" · first published {year}" if year else "")
                    + " (Source: Open Library)"
                ),
            )
        )
    return out


def collect_youtube(module_code: str, topics: list[str]) -> list[Candidate]:
    """Pick validated videos whose BUCKET KEYWORD matches a derived topic.

    Matching by topic (not module code) is what lets an arbitrary, previously
    unseen module still receive relevant videos.
    """
    joined = " ".join(topics).lower()
    wanted: list[str] = []
    for keyword, ids in VIDEO_BUCKETS.items():
        if keyword in joined:
            wanted.extend(ids)

    seen: set[str] = set()
    ordered = [v for v in wanted if not (v in seen or seen.add(v))][:3]

    out: list[Candidate] = []
    for vid in ordered:
        time.sleep(REQUEST_DELAY)
        ok, title = is_youtube_real(vid)
        if not ok or not title:
            continue
        out.append(
            Candidate(
                module_code=module_code,
                resource_type="YOUTUBE",
                title=title[:200],
                url=f"https://www.youtube.com/watch?v={vid}",
                description=f"Video · {title[:120]} (Source: YouTube)",
            )
        )
    return out


# ---------------------------------------------------------------------------
# Module discovery — reads the DB, never a hardcoded list
# ---------------------------------------------------------------------------

def discover_modules(db, only: str | None = None) -> list[tuple[str, str]]:
    """Return distinct (code, name) pairs for every module in the database.

    This is the crux of being module-agnostic: whatever students have created is
    what gets resources, with no code changes required.
    """
    from app.models.academic import Module

    query = db.query(Module.code, Module.name)
    if only:
        query = query.filter(Module.code == only.upper())
    # Distinct because many users may register the same module code.
    return [(r[0], r[1]) for r in query.distinct().all()]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="preview only")
    parser.add_argument("--module", help="limit to a single module code")
    parser.add_argument(
        "--max-modules",
        type=int,
        default=0,
        help="cap how many modules to process (0 = all)",
    )
    args = parser.parse_args()

    sys.path.insert(0, ".")
    from app.db.session import SessionLocal
    from app.models.material import StudyMaterial

    db = SessionLocal()
    try:
        modules = discover_modules(db, args.module)
    except Exception as exc:
        print(f"Could not read modules: {exc}")
        db.close()
        return 1

    if args.max_modules:
        modules = modules[: args.max_modules]

    if not modules:
        print("No modules found in the database. Nothing to ingest.")
        db.close()
        return 0

    print(
        "Discovered %d module(s): %s"
        % (len(modules), ", ".join(c for c, _ in modules))
    )

    candidates: list[Candidate] = []
    for code, name in modules:
        print(f"\n=== {code} — {name}")
        topics = derive_topics(code, name)
        print(f"  topics: {topics}")

        print("  Wikipedia (CC BY-SA)…")
        candidates += collect_wikipedia(code, topics)
        print("  arXiv (open access)…")
        candidates += collect_arxiv(code, topics[0] if topics else name)
        print("  Open Library…")
        candidates += collect_openlibrary(code, " ".join(topics[:3]) or name)
        print("  YouTube (oEmbed-validated)…")
        candidates += collect_youtube(code, topics)

    print(f"\nCollected {len(candidates)} candidates. Validating every URL…")
    validated: list[Candidate] = []
    for c in candidates:
        if is_url_alive(c.url):
            validated.append(c)
            print(f"  PASS {c.resource_type:8} {c.title[:58]}")
        else:
            print(f"  DROP (dead)      {c.title[:58]}")
    print(f"\nValidated {len(validated)}/{len(candidates)} resources.")

    if args.dry_run:
        print("\n--dry-run: nothing written.")
        db.close()
        return 0

    inserted = updated = 0
    try:
        for c in validated:
            existing = (
                db.query(StudyMaterial)
                .filter(
                    StudyMaterial.module_code == c.module_code,
                    StudyMaterial.url == c.url,
                )
                .first()
            )
            if existing:
                existing.title = c.title
                existing.description = c.description
                existing.resource_type = c.resource_type
                existing.is_approved = True
                updated += 1
            else:
                db.add(
                    StudyMaterial(
                        module_code=c.module_code,
                        title=c.title,
                        description=c.description,
                        url=c.url,
                        resource_type=c.resource_type,
                        quality_resolution="standard",
                        is_approved=True,
                    )
                )
                inserted += 1
        db.commit()
    finally:
        db.close()

    print(f"\nDone. inserted={inserted} updated={updated}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
