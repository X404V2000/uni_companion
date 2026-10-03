"""app/services/material_ingest_service.py

PURPOSE
-------
Fetch REAL study resources for a module the student typed in themselves.

WHY THIS LIVES IN THE APP (not only in a script)
------------------------------------------------
Modules are created manually by students, so any module can exist with no
resources yet. Rather than requiring an operator to run a script, the student
can press "Find resources" and the server populates their module on demand.

SECURITY — THE IMPORTANT PART
-----------------------------
This is a SERVER-SIDE FETCH, so it is an SSRF risk if done carelessly. The
design avoids that entirely:

  * The caller provides only a MODULE CODE that must already belong to them.
    They cannot supply a URL, a host, or a search query.
  * Every outbound request goes to a FIXED, ALLOW-LISTED set of source hosts
    (Wikipedia, arXiv, Open Library, YouTube oEmbed). Nothing is derived from
    user input except the words used in a query string.
  * Module ownership is verified before any work happens, so a student cannot
    trigger fetches for someone else's module or for a code that does not exist.
  * Concurrency is capped per module so repeated pressing cannot hammer the
    upstream APIs (which would get our User-Agent blocked).

LEGALITY
--------
Only sources that permit programmatic access are used, and every candidate URL
must answer successfully before it is stored — nothing unverified is ever
written (see _validate).

COST
----
No LLM credits are spent unless the AI topic-derivation path is used; if the AI
is unavailable the keyword fallback runs, so this always produces something.
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time
from urllib.parse import quote_plus
import urllib.error
import urllib.parse
import urllib.request
import uuid
import xml.etree.ElementTree as ET
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.academic import Module
from app.models.material import StudyMaterial

logger = logging.getLogger(__name__)

# --- Politeness --------------------------------------------------------------
USER_AGENT = (
    "VarsityCompanion/1.0 (student hackathon project; educational use; "
    "contact: varsity-companion@example.com)"
)
REQUEST_DELAY = 0.5  # seconds between upstream calls (Wikimedia rate-limits)
TIMEOUT = 15
MAX_RETRIES = 3

TOPIC_COUNT = 6
ARXIV_PER_MODULE = 3
BOOKS_PER_MODULE = 2
MAX_VIDEOS = 3

# ALLOW-LISTED source hosts. A request is only ever made to one of these, and
# the URL is always constructed here — never taken from user input.
ALLOWED_SOURCE_HOSTS = frozenset(
    {
        "en.wikipedia.org",
        "export.arxiv.org",
        "openlibrary.org",
        "www.youtube.com",
    }
)

# Verified-embeddable video IDs keyed by TOPIC KEYWORD (never module code), so
# an unseen module still gets relevant videos. Each ID was checked through the
# YouTube oEmbed endpoint (HTTP 200); titles are fetched, never invented.
VIDEO_BUCKETS: dict[str, list[str]] = {
    "programming": ["zOjov-2OZ0E", "rfscVS0vtbw", "t8pPdKYpowI", "vLnPwxZdW4Y"],
    "algorithm": ["8hly31xKli0", "RBSGKlAvoiM", "0IAPZzGSbME"],
    "complexity": ["v4cd1O4zkGw"],
    "data structure": ["RBSGKlAvoiM", "8hly31xKli0"],
    "dynamic programming": ["oBt53YbR9Kk"],
    "python": ["rfscVS0vtbw", "t8pPdKYpowI"],
    "calculus": ["WUvTyaaNkzM"],
    "linear algebra": ["WUvTyaaNkzM"],
    "mechanics": ["WUvTyaaNkzM"],
}

# Per-module ingest lock. A student mashing the button must not spawn parallel
# crawl storms against Wikipedia/arXiv (which would get us rate-limited).
_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()

# How long a module's ingest result is considered fresh. A second press within
# this window is a no-op, which keeps the endpoint cheap and idempotent.
_COOLDOWN_SECONDS = 120
_last_run: dict[str, float] = {}


class ModuleNotFoundForUserError(Exception):
    """The module does not exist, or does not belong to the caller."""


class IngestBusyError(Exception):
    """An ingest for this module is already running."""


@dataclass
class Candidate:
    module_code: str
    resource_type: str  # YOUTUBE | JOURNAL | PDF | ARTICLE
    title: str
    url: str
    description: str


# ---------------------------------------------------------------------------
# HTTP (allow-listed hosts only)
# ---------------------------------------------------------------------------

def _assert_allowed(url: str) -> None:
    """Refuse to fetch anything outside the allow-listed scheme + hosts.

    Defence in depth: even if a future edit let user data reach a URL, this
    stops the request. Guards against SSRF and against reaching internal
    addresses (169.254.169.254 cloud metadata, localhost, etc).

    BOTH the scheme AND the host are checked. Checking only the host is
    insufficient: `ftp://en.wikipedia.org/x` would pass a host-only check while
    speaking a protocol we never intend to use, and non-http schemes can behave
    unexpectedly in the urlopen chain.
    """
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        raise ValueError(f"refusing non-https scheme: {parsed.scheme!r}")
    host = parsed.hostname or ""
    if host not in ALLOWED_SOURCE_HOSTS:
        raise ValueError(f"refusing to fetch non-allow-listed host: {host!r}")


def _fetch(url: str) -> bytes | None:
    """GET an allow-listed URL with retries. None means 'discard this candidate'."""
    _assert_allowed(url)
    for attempt in range(MAX_RETRIES):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                if 200 <= resp.status < 300:
                    return resp.read()
                return None
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < MAX_RETRIES - 1:
                time.sleep(2 ** (attempt + 2))
                continue
            return None
        except Exception:
            if attempt < MAX_RETRIES - 1:
                time.sleep(1.2 ** (attempt + 1))
                continue
            return None
    return None


def _is_alive(url: str) -> bool:
    """THE VALIDATION GATE: true only if the URL answers successfully.

    Nothing is stored without passing this, which is what prevents the library
    regressing to the dead example.org links it used to contain.
    """
    if urllib.parse.urlparse(url).hostname not in ALLOWED_SOURCE_HOSTS:
        return False
    time.sleep(REQUEST_DELAY)
    return _fetch(url) is not None


# ---------------------------------------------------------------------------
# Topic derivation (module NAME -> search topics)
# ---------------------------------------------------------------------------

_STOPWORDS = {
    "for", "and", "the", "of", "in", "to", "an", "a", "introduction", "intro",
    "principles", "fundamentals", "advanced", "topics", "selected", "special",
    # "General" reads like a subject but is not one: searching it returns
    # near-arbitrary results, so it must never become a topic on its own.
    "general", "basic", "basics", "survey", "overview", "applied",
}


def _fallback_topics(module_name: str) -> list[str]:
    """Keyword extraction used when the AI is unavailable.

    Always yields something searchable, so a module is never left empty. Multi
    word phrases come first (they search better than single generic words), and
    single words are only used as a last resort — a topic like "General" would
    match almost anything and gives the student useless results.
    """
    words = re.findall(r"[A-Za-z][A-Za-z\-]+", module_name)
    meaningful = [w for w in words if w.lower() not in _STOPWORDS and len(w) > 2]

    topics: list[str] = []
    if module_name.strip():
        topics.append(module_name.strip())
    # Pair adjacent meaningful words into phrases: "Chemical Bonding" and
    # "General Chemistry" beat the single word "General".
    for i in range(len(meaningful) - 1):
        topics.append(f"{meaningful[i]} {meaningful[i + 1]}")
    if len(meaningful) >= 3:
        topics.append(" ".join(meaningful[:3]))
    # Single words last, and only reasonably specific ones (length >= 5) so we
    # do not search for "the", "and" or four-letter filler.
    topics.extend(w for w in meaningful if len(w) >= 5)

    seen: set[str] = set()
    unique: list[str] = []
    for t in topics:
        if t.lower() not in seen:
            seen.add(t.lower())
            unique.append(t)
    return unique[:TOPIC_COUNT] or [module_name.strip() or "study skills"]


def _parse_topics(raw: str) -> list[str]:
    """Extract topics from a model response, tolerating imperfect JSON.

    The model occasionally returns a response truncated mid-string (a transient
    upstream hiccup). Strict json.loads() then raises and we lose good topics
    that were already present earlier in the array, so this:

      1. tries strict parsing (the normal path),
      2. otherwise pulls out every COMPLETE quoted string it can find, which
         recovers the topics before the truncation point.
    """
    text = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [str(t).strip() for t in parsed if str(t).strip()]
    except Exception:
        pass

    # Salvage: complete double-quoted strings only (an unterminated final string
    # has no closing quote, so it is naturally skipped).
    salvaged = re.findall(r'"([^"\\]{2,60})"', text)
    return [s.strip() for s in salvaged if s.strip()]


def derive_topics(module_code: str, module_name: str) -> list[str]:
    """Derive core study topics from the student's module NAME.

    Tries the AI up to two times: the provider sometimes returns 503 or a
    truncated body transiently, and a second attempt usually succeeds. Falls
    back to keyword extraction so a module is never left with nothing.
    """
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

    for attempt in range(2):
        try:
            from app.services import ai_service

            text, _tokens = ai_service._call_gemini(prompt)
            topics = _parse_topics(text)
            # Require at least a few usable topics; a single stray string is not
            # worth trusting over the deterministic fallback.
            if len(topics) >= 3:
                return topics[:TOPIC_COUNT]
            logger.info(
                "topic AI returned only %d usable topics (attempt %d)",
                len(topics), attempt + 1,
            )
        except Exception as exc:  # noqa: BLE001 - degrade, never fail the request
            logger.info(
                "topic AI unavailable (%s) on attempt %d", exc, attempt + 1
            )
        if attempt == 0:
            time.sleep(1.5)  # brief pause before the single retry

    logger.info("using keyword fallback topics for %s", module_code)
    return _fallback_topics(module_name)


# ---------------------------------------------------------------------------
# Source collectors (URLs built here, never supplied by the caller)
# ---------------------------------------------------------------------------

def _collect_wikipedia(code: str, topics: list[str]) -> list[Candidate]:
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
        # Skip disambiguation pages and stubs — not useful material.
        if not page or len(extract) < 120 or data.get("type") == "disambiguation":
            continue
        out.append(
            Candidate(
                module_code=code,
                resource_type="ARTICLE",
                title=str(data.get("title", topic))[:200],
                url=page,
                description=(
                    extract[:220] + ("…" if len(extract) > 220 else "")
                    + " (Source: Wikipedia, CC BY-SA)"
                ),
            )
        )
    return out


def _collect_arxiv(code: str, query: str) -> list[Candidate]:
    q = urllib.parse.quote(f'all:"{query}"')
    body = _fetch(
        "https://export.arxiv.org/api/query?search_query="
        f"{q}&max_results={ARXIV_PER_MODULE}&sortBy=relevance"
    )
    if not body:
        return []
    try:
        root = ET.fromstring(body)
    except Exception:
        return []
    ns = {"a": "http://www.w3.org/2005/Atom"}
    out: list[Candidate] = []
    for entry in root.findall("a:entry", ns):
        title_el, id_el = entry.find("a:title", ns), entry.find("a:id", ns)
        if title_el is None or id_el is None:
            continue
        title = " ".join((title_el.text or "").split())
        link = (id_el.text or "").strip().replace("http://", "https://", 1)
        if not title or not link:
            continue
        sum_el = entry.find("a:summary", ns)
        abstract = " ".join((sum_el.text or "").split()) if sum_el is not None else ""
        out.append(
            Candidate(
                module_code=code,
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


def _collect_openlibrary(code: str, query: str) -> list[Candidate]:
    body = _fetch(
        "https://openlibrary.org/search.json?q="
        f"{urllib.parse.quote(query)}&limit={BOOKS_PER_MODULE}"
        "&fields=title,key,author_name,first_publish_year"
    )
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
                module_code=code,
                resource_type="PDF",
                title=str(title)[:200],
                url=f"https://openlibrary.org{key}",
                description=(
                    f"{authors}"
                    + (f" · first published {year}" if year else "")
                    + " (Source: Open Library)"
                ),
            )
        )
    return out


def _collect_youtube(code: str, topics: list[str]) -> list[Candidate]:
    """Match videos by TOPIC KEYWORD so an unseen module still gets them."""
    joined = " ".join(topics).lower()
    wanted: list[str] = []
    for keyword, ids in VIDEO_BUCKETS.items():
        if keyword in joined:
            wanted.extend(ids)
    seen: set[str] = set()
    ordered = [v for v in wanted if not (v in seen or seen.add(v))][:MAX_VIDEOS]

    out: list[Candidate] = []
    for vid in ordered:
        time.sleep(REQUEST_DELAY)
        body = _fetch(
            "https://www.youtube.com/oembed?url="
            f"https://www.youtube.com/watch?v={vid}&format=json"
        )
        if not body:
            continue
        try:
            title = json.loads(body).get("title", "")
        except Exception:
            continue
        if not title:
            continue
        out.append(
            Candidate(
                module_code=code,
                resource_type="YOUTUBE",
                title=str(title)[:200],
                url=f"https://www.youtube.com/watch?v={vid}",
                description=f"Video · {title[:120]} (Source: YouTube)",
            )
        )

    # ALWAYS add a search link per topic, even when curated videos were found.
    #
    # WHY THIS EXISTS, AND WHY IT IS NOT A COMPROMISE
    # -----------------------------------------------
    # The buckets above cover nine hard-science keywords. This product is built for
    # thousands of students across thousands of modules - SA universities, UNISA,
    # TVET - so all but a handful would have matched nothing and seen no videos at
    # all. Adding more buckets does not close that gap: roughly 80 disciplines would
    # need researching and verifying, and a student taking Marine Biology or Setswana
    # Syntax would still fall outside them.
    #
    # Asking the AI to name video IDs was tried and REVERTED. For library science it
    # returned Rick Astley, "Me at the zoo" and Gangnam Style - real IDs, so the
    # oEmbed check passed them, and the failure was invisible to verification. A
    # checker can confirm an artefact is well formed; it cannot confirm it is correct.
    #
    # A search URL needs no key, no quota and no maintenance, and it works for every
    # module that will ever exist - because YouTube does the matching. The YouTube
    # Data API is not an option: search.list costs 100 of a 10,000 unit daily quota,
    # so 100 searches a day for every user combined.
    #
    # The honest cost is that we do not choose the result. That is why the title says
    # "Search YouTube" rather than presenting it as a recommendation - the student is
    # being handed a search, and it should not pretend to be curation.
    #
    # Bounded to MAX_VIDEOS so a module with many derived topics does not fill the
    # list with search links.
    for topic in topics[:MAX_VIDEOS]:
        cleaned = " ".join(str(topic).split())
        if not cleaned:
            continue
        out.append(
            Candidate(
                module_code=code,
                resource_type="YOUTUBE",
                title=f'Search YouTube: "{cleaned}"'[:200],
                url=(
                    "https://www.youtube.com/results?search_query="
                    + quote_plus(f"{cleaned} lecture tutorial")
                ),
                description=(
                    f"Search · YouTube picks these results for “{cleaned}”. "
                    "Curated videos appear above when we have them. (Source: YouTube)"
                )[:400],
            )
        )

    return out


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def _lock_for(code: str) -> threading.Lock:
    with _locks_guard:
        if code not in _locks:
            _locks[code] = threading.Lock()
        return _locks[code]


def ingest_for_module(db: Session, user_id: uuid.UUID, module_code: str) -> dict:
    """Fetch and store real resources for ONE of the caller's own modules.

    Returns a summary dict. Raises ModuleNotFoundForUserError when the module is
    not the caller's, and IngestBusyError when a run is already in progress.

    Strictly serialised per module and rate-limited by a short cooldown, so the
    endpoint cannot be used to hammer the upstream APIs.
    """
    code = module_code.strip().upper()

    # OWNERSHIP CHECK FIRST — before any outbound request. A student can only
    # populate their own modules, and an unknown code never triggers a fetch.
    owned = (
        db.query(Module)
        .filter(Module.user_id == user_id, Module.code == code)
        .first()
    )
    if owned is None:
        raise ModuleNotFoundForUserError("Module not found in your account.")

    # Cooldown: a second press shortly after the first is a cheap no-op.
    now = time.time()
    if now - _last_run.get(code, 0) < _COOLDOWN_SECONDS:
        existing = (
            db.query(StudyMaterial)
            .filter(
                StudyMaterial.module_code == code,
                StudyMaterial.is_approved.is_(True),
            )
            .count()
        )
        return {
            "module_code": code,
            "inserted": 0,
            "updated": 0,
            "total": existing,
            "skipped": True,
            "message": "Resources were found for this module recently.",
        }

    lock = _lock_for(code)
    if not lock.acquire(blocking=False):
        raise IngestBusyError("Already finding resources for this module.")
    try:
        topics = derive_topics(code, owned.name)
        candidates: list[Candidate] = []
        candidates += _collect_wikipedia(code, topics)
        candidates += _collect_arxiv(code, topics[0] if topics else owned.name)
        candidates += _collect_openlibrary(code, " ".join(topics[:3]) or owned.name)
        candidates += _collect_youtube(code, topics)

        inserted = updated = 0
        for c in candidates:
            if not _is_alive(c.url):  # validation gate
                continue
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
        _last_run[code] = time.time()

        total = (
            db.query(StudyMaterial)
            .filter(
                StudyMaterial.module_code == code,
                StudyMaterial.is_approved.is_(True),
            )
            .count()
        )
        return {
            "module_code": code,
            "inserted": inserted,
            "updated": updated,
            "total": total,
            "skipped": False,
            "topics": topics,
            "message": (
                f"Found {inserted + updated} resource"
                f"{'' if inserted + updated == 1 else 's'} for {code}."
            ),
        }
    finally:
        lock.release()
