"""tests/test_link_fetch.py

Tests for "Add link" — summarising a web page from its URL.

This is the only endpoint where a user-supplied value causes a SERVER-SIDE
REQUEST, so the security tests here matter more than the feature tests. A
regression in this file means our server can be used to probe internal networks
or read cloud credentials.

Nothing here touches the network: `_resolve_and_check` and the HTTP opener are
stubbed, so the tests are deterministic and cannot themselves be used to attack
anything.
"""
from __future__ import annotations

import ipaddress

import pytest

from app.services import link_fetch_service as lf

# ---------------------------------------------------------------------------
# SSRF: private / internal addresses
# ---------------------------------------------------------------------------

class TestPrivateAddressBlocking:
    """The server must never fetch an address that is not publicly routable."""

    @pytest.mark.parametrize(
        "ip",
        [
            "127.0.0.1",        # loopback
            "::1",              # loopback v6
            "10.0.0.1",         # private
            "192.168.1.1",      # private
            "172.16.0.1",       # private
            "169.254.169.254",  # link-local: AWS/GCP/Azure metadata
            "0.0.0.0",          # unspecified  # noqa: S104 - Local test server bound in the test only.
            "224.0.0.1",        # multicast
            "100.64.0.1",       # carrier-grade NAT
            "fe80::1",          # link-local v6
        ],
    )
    def test_non_public_addresses_are_rejected(self, ip):
        assert lf._is_public_ip(ipaddress.ip_address(ip)) is False

    @pytest.mark.parametrize("ip", ["8.8.8.8", "1.1.1.1", "2606:4700::1111"])
    def test_public_addresses_are_allowed(self, ip):
        assert lf._is_public_ip(ipaddress.ip_address(ip)) is True

    def test_localhost_is_blocked(self):
        with pytest.raises(lf.LinkFetchError):
            lf._resolve_and_check("localhost")

    def test_metadata_address_is_blocked(self):
        with pytest.raises(lf.LinkFetchError):
            lf._resolve_and_check("169.254.169.254")

    def test_a_name_resolving_internally_is_blocked(self, monkeypatch):
        """Blocking only the literal string 'localhost' would miss this."""
        monkeypatch.setattr(
            lf.socket,
            "getaddrinfo",
            lambda *a, **kw: [(2, 1, 6, "", ("10.0.0.5", 0))],
        )
        with pytest.raises(lf.LinkFetchError):
            lf._resolve_and_check("internal.example.com")

    def test_round_robin_mixing_public_and_private_is_blocked(self, monkeypatch):
        """If ANY resolved address is internal, the whole host is refused."""
        monkeypatch.setattr(
            lf.socket,
            "getaddrinfo",
            lambda *a, **kw: [
                (2, 1, 6, "", ("93.184.216.34", 0)),
                (2, 1, 6, "", ("127.0.0.1", 0)),
            ],
        )
        with pytest.raises(lf.LinkFetchError):
            lf._resolve_and_check("sneaky.example.com")


# ---------------------------------------------------------------------------
# SSRF: schemes
# ---------------------------------------------------------------------------

class TestSchemeBlocking:
    """Only http and https may ever be fetched."""

    @pytest.mark.parametrize(
        "url",
        [
            "file:///etc/passwd",
            "ftp://example.com/x",
            "gopher://example.com/",
            "javascript:alert(1)",
            "data:text/html,<h1>hi</h1>",
            "vbscript:msgbox(1)",
        ],
    )
    def test_dangerous_schemes_are_refused(self, url):
        with pytest.raises(lf.LinkFetchError):
            lf.validate_url(url)

    def test_the_error_explains_the_scheme_rule(self):
        # A clear message, not a confusing "address not found" from a later
        # check that only happened to catch it.
        with pytest.raises(lf.LinkFetchError) as exc:
            lf.validate_url("javascript:alert(1)")
        assert "http" in str(exc.value).lower()


class TestUrlNormalisation:
    def test_bare_domain_gains_https(self):
        assert lf.validate_url("wikipedia.org/wiki/X") == (
            "https://wikipedia.org/wiki/X"
        )

    def test_http_is_preserved(self):
        assert lf.validate_url("http://example.com/x").startswith("http://")

    def test_empty_url_is_refused(self):
        with pytest.raises(lf.LinkFetchError):
            lf.validate_url("   ")

    def test_absurdly_long_url_is_refused(self):
        with pytest.raises(lf.LinkFetchError):
            lf.validate_url("https://example.com/" + "a" * 3000)


# ---------------------------------------------------------------------------
# HTML -> text extraction
# ---------------------------------------------------------------------------

class TestTextExtraction:
    """Extraction must yield prose, not menus and scripts."""

    def _extract(self, html: str) -> str:
        extractor = lf._TextExtractor()
        extractor.feed(html)
        return extractor.text()

    def test_script_and_style_content_is_dropped(self):
        html = (
            "<html><body>"
            "<script>var secret = 'do not include me';</script>"
            "<style>.x { color: red }</style>"
            "<p>Binary search trees keep keys ordered.</p>"
            "</body></html>"
        )
        text = self._extract(html)
        assert "secret" not in text
        assert "color" not in text
        assert "Binary search trees keep keys ordered." in text

    def test_paragraphs_are_preferred_over_chrome(self):
        # A page with real prose AND a long menu should summarise the prose.
        paragraphs = "".join(
            f"<p>Paragraph {i} explains a concept in reasonable detail.</p>"
            for i in range(6)
        )
        menu = "".join(f"<div>Menu item {i}</div>" for i in range(80))
        text = self._extract(f"<body>{menu}{paragraphs}</body>")
        assert "explains a concept" in text

    def test_entities_are_decoded(self):
        assert "&" in self._extract("<p>Data &amp; structures</p>")

    def test_main_content_narrowing_picks_the_article(self):
        html = (
            "<body><nav>Home About Contact</nav>"
            "<main>" + "<p>Real article text.</p>" * 40 + "</main>"
            "<footer>Copyright</footer></body>"
        )
        narrowed = lf._narrow_to_main_content(html)
        assert "Real article text" in narrowed
        assert "Copyright" not in narrowed

    def test_narrowing_falls_back_when_no_known_container(self):
        html = "<body><p>Only text.</p></body>"
        assert lf._narrow_to_main_content(html) == html


# ---------------------------------------------------------------------------
# Endpoint behaviour
# ---------------------------------------------------------------------------

class TestFetchLinkEndpoint:
    def test_requires_authentication(self, client):
        resp = client.post(
            "/api/v1/ai/fetch-link", json={"url": "https://example.com"}
        )
        assert resp.status_code == 401

    def test_blocks_internal_addresses(self, client):
        """The security property must hold at the API boundary too."""
        import uuid

        email = f"link+{uuid.uuid4().hex[:8]}@example.com"
        client.post(
            "/api/v1/auth/signup",
            json={
                "email": email,
                "password": "MyPassword2026",
                "full_name": "Link Tester",
                "terms_version": "1.0",
                "privacy_version": "1.0",
            },
        )
        tok = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "MyPassword2026"},
            headers={"x-auth-mode": "api"},
        ).json()["access_token"]
        headers = {"Authorization": f"Bearer {tok}"}

        for url in [
            "http://169.254.169.254/latest/meta-data/",
            "http://127.0.0.1:8000/health",
            "http://localhost/admin",
            "file:///etc/passwd",
        ]:
            resp = client.post(
                "/api/v1/ai/fetch-link", json={"url": url}, headers=headers
            )
            assert resp.status_code == 400, f"{url} was not blocked"

    def test_returns_extracted_text_for_a_public_page(self, client, monkeypatch):
        import uuid

        html = (
            b"<html><head><title>Lecture Notes</title></head><body>"
            + b"<p>Binary search trees keep their keys in sorted order.</p>" * 6
            + b"</body></html>"
        )

        # Use a real email.message.Message for headers: the service calls
        # get_content_charset(), which a plain dict does not provide.
        from email.message import Message

        _headers = Message()
        _headers["Content-Type"] = "text/html; charset=utf-8"

        class _Resp:
            headers = _headers

            def read(self, n=None):
                return html

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        monkeypatch.setattr(lf, "_resolve_and_check", lambda host: None)
        monkeypatch.setattr(lf._OPENER, "open", lambda *a, **kw: _Resp())

        email = f"link2+{uuid.uuid4().hex[:8]}@example.com"
        client.post(
            "/api/v1/auth/signup",
            json={
                "email": email,
                "password": "MyPassword2026",
                "full_name": "Link Tester",
                "terms_version": "1.0",
                "privacy_version": "1.0",
            },
        )
        tok = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "MyPassword2026"},
            headers={"x-auth-mode": "api"},
        ).json()["access_token"]

        resp = client.post(
            "/api/v1/ai/fetch-link",
            json={"url": "https://example.com/notes"},
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "Binary search trees" in body["text"]
        assert body["title"] == "Lecture Notes"
        assert body["characters"] > 50
