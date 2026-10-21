"""app/services/link_fetch_service.py

PURPOSE
-------
Fetch the readable text of a web page so a student can summarise a lecture link,
a journal article page, or an online reading — without copy-pasting it.

SECURITY — READ THIS BEFORE CHANGING ANYTHING
---------------------------------------------
This is a server-side fetch of a URL SUPPLIED BY THE USER, which is the classic
Server-Side Request Forgery (SSRF) shape. Left naive, an attacker can make our
server:

  * probe the internal network (http://10.0.0.1/admin, http://localhost:8000),
  * read cloud metadata credentials (http://169.254.169.254/...),
  * reach services bound only to loopback,
  * or use us as a proxy to attack a third party.

So the defences below are layered and all of them matter:

  1. SCHEME allow-list: only http and https. Blocks file://, ftp://, gopher://
     and friends.
  2. HOST resolution + private-range blocking: the hostname is RESOLVED and
     every resulting IP is checked against private, loopback, link-local,
     reserved and multicast ranges. Checking the hostname string alone is not
     enough — 'localhost', '127.0.0.1', '::1' and DNS names that resolve to
     internal addresses must all be refused.
  3. REDIRECTS are followed MANUALLY with the same checks applied at every hop.
     Following redirects automatically is a well-known bypass: a public URL can
     302 to http://169.254.169.254/ and the initial check is worthless.
  4. SIZE cap while streaming, so a huge or endless response cannot exhaust
     memory.
  5. TIMEOUT on connect/read so a hanging host cannot tie up a worker.
  6. CONTENT-TYPE must be textual; binaries are rejected rather than decoded
     into garbage.

The extracted text is then treated as untrusted input like any other, and the
existing summary validation still applies downstream.
"""
from __future__ import annotations

import ipaddress
import logging
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

logger = logging.getLogger(__name__)

# Only these schemes are ever fetched.
ALLOWED_SCHEMES = frozenset({"http", "https"})

# Ceilings. The summary schema accepts 32k characters, so there is no point
# downloading far more than that; 2 MB of HTML is a generous page.
MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024
MAX_TEXT_CHARS = 40_000
TIMEOUT_SECONDS = 12
MAX_REDIRECTS = 5

# Content types we can turn into text. Anything else is refused so we never
# decode a PDF or an image as if it were HTML.
_TEXTUAL_CONTENT_TYPES = (
    "text/",
    "application/json",
    "application/xml",
    "application/xhtml",
)


class LinkFetchError(Exception):
    """The link could not be fetched, with a message safe to show a student."""


# ---------------------------------------------------------------------------
# HTML -> text
# ---------------------------------------------------------------------------

# Containers that hold the actual article on the overwhelming majority of sites
# (Wikipedia, most blogs, most news sites, most docs platforms). Narrowing to
# these BEFORE extracting text is what keeps menus, language pickers and cookie
# banners out of the summary.
_MAIN_CONTENT_PATTERNS = (
    r"<main[^>]*>(.*?)</main>",
    r"<article[^>]*>(.*?)</article>",
    r'<div[^>]+id=["\']?(?:mw-content-text|content|main-content|article)["\']?[^>]*>(.*?)</div>\s*</div>',
)


def _narrow_to_main_content(html: str) -> str:
    """Return only the main content region, if one can be identified.

    Falls back to the full document when no known container is present, so an
    unusual site still yields something rather than nothing.
    """
    for pattern in _MAIN_CONTENT_PATTERNS:
        match = re.search(pattern, html, flags=re.IGNORECASE | re.DOTALL)
        if match and len(match.group(1)) > 500:
            return match.group(1)
    return html


class _TextExtractor(HTMLParser):
    """Pull readable text out of HTML, dropping scripts, styles and chrome.

    A regex would be simpler but wrong: script and style CONTENTS would leak
    into the summary and dominate it with JavaScript and CSS.
    """

    # Tags whose CONTENT must never reach the summary. "head" is included
    # because it carries metadata; nav/aside/footer are site chrome that would
    # otherwise dominate the text with menus and cookie notices.
    _SKIP = {
        "script", "style", "noscript", "svg", "head", "nav", "footer",
        "aside", "form", "button", "select", "iframe", "template",
    }
    _BLOCK = {
        "p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6",
        "section", "article", "header", "blockquote", "pre",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []
        # Prose lives in <p> tags on virtually every content site, while menus,
        # language pickers and footers live in <li>/<div>. Tracking the
        # paragraph text separately lets us prefer real prose and ignore chrome
        # without needing per-site rules.
        self._paragraphs: list[str] = []
        self._skip_depth = 0
        self._p_depth = 0
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in self._SKIP:
            self._skip_depth += 1
        elif tag == "title":
            self._in_title = True
        elif tag == "p":
            self._p_depth += 1
            self._parts.append("\n")
        elif tag in self._BLOCK:
            self._parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self._SKIP and self._skip_depth:
            self._skip_depth -= 1
        elif tag == "title":
            self._in_title = False
        elif tag == "p":
            self._p_depth = max(0, self._p_depth - 1)
            self._parts.append("\n")
        elif tag in self._BLOCK:
            self._parts.append("\n")

    def handle_data(self, data):
        if self._in_title:
            self.title += data
            return
        if self._skip_depth:
            return
        text = data.strip()
        if text:
            self._parts.append(text + " ")
            if self._p_depth:
                self._paragraphs.append(text)

    def text(self) -> str:
        # Prefer real paragraphs when the page has a reasonable amount of them;
        # otherwise fall back to everything, so an unusual page (or one built
        # entirely from <div>s) still yields content.
        prose = " ".join(self._paragraphs)
        raw = prose if len(prose) >= 200 else "".join(self._parts)
        # Collapse the whitespace the page uses for layout.
        raw = re.sub(r"[ \t\r\f\v]+", " ", raw)
        raw = re.sub(r"\n\s*\n\s*\n+", "\n\n", raw)
        return raw.strip()


# ---------------------------------------------------------------------------
# SSRF defences
# ---------------------------------------------------------------------------

def _is_public_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """True only for addresses that are safe to call on the public internet."""
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local          # 169.254.0.0/16 (cloud metadata), fe80::/10
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
        # 100.64.0.0/10 carrier-grade NAT is not flagged by is_private on all
        # Python versions, but is never a legitimate public destination.
        or ip in ipaddress.ip_network("100.64.0.0/10")
    )


def validate_url(url: str) -> str:
    """Validate a user-supplied URL, or raise LinkFetchError.

    Returns the normalised URL (with a scheme added if the student typed a bare
    domain). Never performs a request — safe to call for immediate feedback.
    """
    candidate = (url or "").strip()
    if not candidate:
        raise LinkFetchError("Enter a link first.")

    # Reject a dangerous scheme EXPLICITLY, before the "add https://" shortcut.
    #
    # Without this, "javascript:alert(1)" contains no "://", so it would be
    # prefixed into "https://javascript:alert(1)" and rejected only later for an
    # unrelated reason ("address could not be found"), which is both a confusing
    # message and a fragile guarantee that depends on a urlparse quirk.
    explicit_scheme = ""
    if ":" in candidate.split("/", 1)[0]:
        explicit_scheme = candidate.split(":", 1)[0].lower()
    if explicit_scheme and explicit_scheme not in ALLOWED_SCHEMES:
        raise LinkFetchError("Only http and https links can be read.")

    # Be forgiving about a missing scheme: "wikipedia.org/x" is a normal thing
    # to paste, and defaulting to https is what the student meant.
    if "://" not in candidate:
        candidate = "https://" + candidate

    parsed = urllib.parse.urlparse(candidate)
    if parsed.scheme.lower() not in ALLOWED_SCHEMES:
        raise LinkFetchError("Only http and https links can be read.")

    host = parsed.hostname
    if not host:
        raise LinkFetchError("That link does not look like a web address.")

    if len(candidate) > 2000:
        raise LinkFetchError("That link is too long.")

    return candidate


def _resolve_and_check(host: str) -> None:
    """Resolve a hostname and refuse if ANY resolved address is non-public.

    Resolving is essential: a name like 'internal.example.com' may point at
    10.0.0.5, and rejecting only the literal strings 'localhost'/'127.0.0.1'
    would miss it. Checking every address handles round-robin DNS where one
    answer is public and another is internal.
    """
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise LinkFetchError("That link's address could not be found.") from exc
    except Exception as exc:  # noqa: BLE001
        raise LinkFetchError("That link could not be checked.") from exc

    if not infos:
        raise LinkFetchError("That link's address could not be found.")

    for info in infos:
        addr = info[4][0]
        # Strip a zone index such as fe80::1%eth0 before parsing.
        addr = addr.split("%", 1)[0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            raise LinkFetchError("That link resolves to an invalid address.") from None
        if not _is_public_ip(ip):
            # Deliberately vague: telling a caller which internal address was
            # found turns this into a network scanner.
            logger.warning("blocked non-public address for host %s", host)
            raise LinkFetchError(
                "That link points to an address we cannot read for security "
                "reasons.",
            )


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Stop urllib following redirects, so we can validate each hop ourselves."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def fetch_link_text(url: str) -> dict:
    """Fetch a URL and return its readable text.

    Returns {"url", "title", "text", "truncated", "characters"}.
    Raises LinkFetchError with a student-safe message on any failure.
    """
    current = validate_url(url)

    opener = _OPENER
    for _hop in range(MAX_REDIRECTS + 1):
        parsed = urllib.parse.urlparse(current)
        if parsed.scheme.lower() not in ALLOWED_SCHEMES:
            raise LinkFetchError("Only http and https links can be read.")
        _resolve_and_check(parsed.hostname or "")

        request = urllib.request.Request(  # noqa: S310 - URL validated by _resolve_and_check above (allow-list + host resolution); see the SSRF design.
            current,
            headers={
                # Identify ourselves honestly, and ask for HTML.
                "User-Agent": (
                    "VarsityCompanion/1.0 (student study helper; "
                    "contact: varsity-companion@example.com)"
                ),
                "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9",
            },
        )

        try:
            with opener.open(request, timeout=TIMEOUT_SECONDS) as resp:
                content_type = (resp.headers.get("Content-Type") or "").lower()
                if not any(t in content_type for t in _TEXTUAL_CONTENT_TYPES):
                    raise LinkFetchError(
                        "That link is not a web page we can read. Try a text or "
                        "article link, or paste the text instead.",
                    )

                # Stream with a hard byte cap so a huge body cannot exhaust
                # memory, then decode leniently (pages are often mislabelled).
                raw = resp.read(MAX_DOWNLOAD_BYTES + 1)
                if len(raw) > MAX_DOWNLOAD_BYTES:
                    raw = raw[:MAX_DOWNLOAD_BYTES]

                charset = resp.headers.get_content_charset() or "utf-8"
                try:
                    html = raw.decode(charset, errors="strict")
                except (LookupError, UnicodeDecodeError):
                    html = raw.decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            # Handle redirects manually so every hop is re-validated.
            if exc.code in (301, 302, 303, 307, 308):
                location = exc.headers.get("Location")
                if not location:
                    raise LinkFetchError("That link redirected unexpectedly.") from exc
                current = urllib.parse.urljoin(current, location)
                continue
            if exc.code == 404:
                raise LinkFetchError("That page could not be found (404).") from exc
            if exc.code in (401, 403):
                raise LinkFetchError(
                    "That page needs a login, so we cannot read it.",
                ) from exc
            raise LinkFetchError(
                f"That page returned an error (HTTP {exc.code}).",
            ) from exc
        except urllib.error.URLError as exc:
            raise LinkFetchError(
                "That link could not be reached. Check the address and try again.",
            ) from exc
        except LinkFetchError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.info("link fetch failed: %s", exc)
            raise LinkFetchError("That link could not be read.") from exc

        # Capture the page title from the FULL document first, because
        # narrowing to the article body can drop <head> where <title> lives.
        title = ""
        title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
        if title_match:
            title = re.sub(r"\s+", " ", title_match.group(1)).strip()

        # Parse to text. Narrow to the article body first so navigation and
        # language menus do not dominate the summary.
        extractor = _TextExtractor()
        try:
            extractor.feed(_narrow_to_main_content(html))
        except Exception:
            # Malformed HTML: fall back to a crude tag strip rather than failing.
            html = re.sub(r"<[^>]+>", " ", html)
            text = re.sub(r"\s+", " ", html).strip()
        else:
            text = extractor.text()

        if len(text) < 50:
            raise LinkFetchError(
                "We could not find enough readable text on that page. It may "
                "load its content with JavaScript — paste the text instead.",
            )

        truncated = len(text) > MAX_TEXT_CHARS
        return {
            "url": current,
            "title": (title or extractor.title or "").strip()[:200],
            "text": text[:MAX_TEXT_CHARS],
            "truncated": truncated,
            "characters": min(len(text), MAX_TEXT_CHARS),
        }

    raise LinkFetchError("That link redirected too many times.")
