"""
tests/test_auth_endpoints.py

End-to-end security tests for Day 4 (Login, JWT, HTTP-only cookie, protected
/me route). Runs against the dedicated `varsity_companion_test` database via
the fixtures in conftest.py.
"""
from datetime import timedelta

from conftest import PASSWORD, unique_email, valid_signup_payload

from app.core.config import settings
from app.core.security import create_access_token, decode_token
from app.models.user import User

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _signup(client, email=None):
    email = email or unique_email()
    payload = valid_signup_payload(email)
    resp = client.post("/api/v1/auth/signup", json=payload)
    assert resp.status_code == 201, resp.text
    return email, resp.json()


def _set_cookie_header(response) -> str:
    """Raw Set-Cookie header so we can assert on HttpOnly/SameSite/Secure."""
    values = response.headers.get_list("set-cookie")
    return "; ".join(values)


# ---------------------------------------------------------------------------
# Happy path — browser flow (cookie, no token in body)
# ---------------------------------------------------------------------------

class TestBrowserLoginFlow:
    def test_browser_login_sets_httponly_cookie_and_no_raw_token(self, client):
        email, signup_data = _signup(client)

        resp = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": PASSWORD},
        )
        assert resp.status_code == 200, resp.text

        body = resp.json()
        # Browser default: user metadata only, NO raw access token exposed.
        assert "access_token" not in body
        assert "token_type" not in body
        assert body["email"] == email
        assert body["id"] == signup_data["id"]

        raw = _set_cookie_header(resp).lower()
        assert "access_token" in raw
        assert "httponly" in raw
        assert "samesite=lax" in raw
        # "Secure" flag mirrors `settings.cookie_secure`, which is True only
        # for real production (Secure cookies are never sent over the plain
        # HTTP that CI/local test clients use). Asserting on the property
        # keeps this correct in every environment.
        if settings.cookie_secure:
            assert "secure" in raw
        else:
            assert "secure" not in raw

    def test_browser_cookie_authenticates_me_endpoint(self, client):
        email, _ = _signup(client)
        login = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": PASSWORD},
        )
        assert login.status_code == 200
        # httpx TestClient keeps returning cookies in its jar automatically.
        me = client.get("/api/v1/auth/me")
        assert me.status_code == 200
        assert me.json()["email"] == email


# ---------------------------------------------------------------------------
# API / mobile client flow — raw token in body via header opt-in
# ---------------------------------------------------------------------------

class TestApiClientFlow:
    def test_api_mode_returns_token_and_works_with_bearer(self, client):
        email, _ = _signup(client)
        login = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": PASSWORD},
            headers={"X-Auth-Mode": "api"},
        )
        assert login.status_code == 200, login.text
        body = login.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"
        assert "expires_in" in body

        # Remove the cookie set by login so the request genuinely relies on
        # the Authorization header (proving the Bearer extraction path).
        client.cookies.clear()
        me = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {body['access_token']}"},
        )
        assert me.status_code == 200
        assert me.json()["email"] == email

    def test_token_contains_no_pii_only_subject(self, client):
        email, signup_data = _signup(client)
        login = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": PASSWORD},
            headers={"X-Auth-Mode": "api"},
        )
        token = login.json()["access_token"]
        payload = decode_token(token)
        assert payload["sub"] == signup_data["id"]
        assert "email" not in payload
        assert "full_name" not in payload
        assert "password" not in payload


# ---------------------------------------------------------------------------
# Negative cases — invalid credentials / tokens
# ---------------------------------------------------------------------------

class TestInvalidCredentials:
    def test_login_wrong_password(self, client):
        email, _ = _signup(client)
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "DefinitelyWrongPass_1"},
        )
        assert resp.status_code == 401
        assert "Invalid email or password." == resp.json()["detail"]

    def test_login_unknown_email(self, client):
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": unique_email("nobody"), "password": PASSWORD},
        )
        assert resp.status_code == 401
        assert "Invalid email or password." == resp.json()["detail"]

    def test_enumeration_responses_are_indistinguishable(self, client):
        """Unknown-email and wrong-password must return identical status+body."""
        email, _ = _signup(client)

        unknown = client.post(
            "/api/v1/auth/login",
            json={"email": unique_email("ghost"), "password": PASSWORD},
        )
        badpwd = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "WrongPassword_9876"},
        )
        assert unknown.status_code == 401
        assert badpwd.status_code == 401
        assert unknown.json() == badpwd.json()

    def test_login_malformed_email_rejected(self, client):
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": "not-an-email", "password": PASSWORD},
        )
        assert resp.status_code == 422


class TestMeProtection:
    def test_me_without_token(self, client):
        assert client.get("/api/v1/auth/me").status_code == 401

    def test_me_with_garbage_bearer(self, client):
        resp = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer definitely.not.a.jwt"},
        )
        assert resp.status_code == 401

    def test_me_with_tampered_token(self, client):
        email, _ = _signup(client)
        login = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": PASSWORD},
            headers={"X-Auth-Mode": "api"},
        )
        token = login.json()["access_token"]
        # Flip a trailing char so the signature no longer matches.
        tampered = token[:-3] + ("ZZZ" if not token.endswith("ZZZ") else "AAA")
        # The successful login also stored a valid HttpOnly cookie in the
        # client's jar; drop it so we truly test the tampered header alone.
        client.cookies.clear()
        resp = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {tampered}"},
        )
        assert resp.status_code == 401

    def test_me_with_expired_token(self, client):
        email, signup_data = _signup(client)
        expired = create_access_token(
            subject=signup_data["id"], expires_delta=timedelta(minutes=-1)
        )
        resp = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {expired}"},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Deactivated accounts (immediate revocation)
# ---------------------------------------------------------------------------

class TestDeactivatedAccounts:
    def test_deactivated_user_cannot_login(self, client, db):
        email, _ = _signup(client)
        # Deactivate directly in the test DB (simulates an admin action).
        user = db.query(User).filter(User.email == email).one()
        user.is_active = False
        db.commit()

        resp = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": PASSWORD},
        )
        assert resp.status_code == 401

    def test_me_revokes_deactivated_user_immediately(self, client, db):
        """A session token stops working the moment is_active flips False."""
        email, _ = _signup(client)
        login = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": PASSWORD},
            headers={"X-Auth-Mode": "api"},
        )
        token = login.json()["access_token"]
        assert client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        ).status_code == 200

        user = db.query(User).filter(User.email == email).one()
        user.is_active = False
        db.commit()

        resp = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Rate limiting (brute-force defense)
# ---------------------------------------------------------------------------

class TestRateLimiting:
    def test_login_rate_limited_after_the_configured_limit(self, client):
        """Login must throttle once the ALLOWANCE is used.

        The number is read from the shared config rather than hard-coded. The
        limit is environment-aware: strict in production, roomier outside it so
        a live demo cannot lock itself out with a few typos. Asserting a literal
        5 here would fail outside production and, worse, would hide a change to
        the production value.
        """
        from app.core.rate_limiter import AUTH_CREDENTIAL_LIMIT

        allowance = int(AUTH_CREDENTIAL_LIMIT.split("/")[0])
        email, _ = _signup(client)

        # Every attempt up to the allowance is allowed (200 or a normal 401).
        for _ in range(allowance):
            resp = client.post(
                "/api/v1/auth/login",
                json={"email": email, "password": PASSWORD},
            )
            assert resp.status_code in (200, 401)

        # The next attempt in the same window is throttled.
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": PASSWORD},
        )
        assert resp.status_code == 429

    def test_signup_rate_limited_after_the_configured_limit(self, client):
        """Signup throttling, asserted against the shared configured limit."""
        from app.core.rate_limiter import AUTH_CREDENTIAL_LIMIT

        allowance = int(AUTH_CREDENTIAL_LIMIT.split("/")[0])

        for i in range(allowance):
            resp = client.post(
                "/api/v1/auth/signup",
                json=valid_signup_payload(unique_email(f"bulk{i}")),
            )
            assert resp.status_code == 201, resp.text

        resp = client.post(
            "/api/v1/auth/signup",
            json=valid_signup_payload(unique_email("bulk_extra")),
        )
        assert resp.status_code == 429


# ---------------------------------------------------------------------------
# Login contract hardening
# ---------------------------------------------------------------------------

class TestLoginContractHardening:
    def test_nonneutral_api_header_does_not_leak_token(self, client):
        """Only the EXACT 'api' value opts in; casing variants must not leak."""
        email, _ = _signup(client)
        # Keep total POSTs at/below the 5/min login rate limit so the
        # assertions test header-matching, not rate limiting.
        for value in ("browser", "mobile", "Bearer", "API", "Api "):
            resp = client.post(
                "/api/v1/auth/login",
                json={"email": email, "password": PASSWORD},
                headers={"X-Auth-Mode": value},
            )
            assert resp.status_code == 200, (value, resp.text)
            body = resp.json()
            assert "access_token" not in body, f"leaked token for header {value!r}"
            assert "token_type" not in body

    def test_api_mode_opt_in_is_exact_value_after_trim(self, client):
        """Result of the strict behavior: whitespace around 'api' is ignored,
        but differing case is NOT treated as api mode."""
        email, _ = _signup(client)
        # Whitespace only around exact 'api' still opts in (server strips it).
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": PASSWORD},
            headers={"X-Auth-Mode": "  api  "},
        )
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_failed_login_does_not_set_session_cookie(self, client):
        email, _ = _signup(client)
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "WrongPassword_9999"},
        )
        assert resp.status_code == 401
        raw = _set_cookie_header(resp).lower()
        assert "access_token" not in raw

    def test_successful_browser_login_sets_cookie_with_max_age(self, client):
        email, _ = _signup(client)
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": PASSWORD},
        )
        assert resp.status_code == 200
        raw = _set_cookie_header(resp).lower()
        assert "max-age=900" in raw  # 15 min access-window cookie

    def test_missing_login_fields_are_rejected(self, client):
        # Missing credentials entirely -> validation error, not 200.
        assert client.post("/api/v1/auth/login", json={}).status_code == 422
        assert client.post(
            "/api/v1/auth/login", json={"email": "a@b.com"}
        ).status_code == 422
        assert client.post(
            "/api/v1/auth/login", json={"password": PASSWORD}
        ).status_code == 422

    def test_tampered_cookie_is_rejected(self, client):
        email, signup_data = _signup(client)
        valid_token = create_access_token(subject=signup_data["id"])
        client.cookies.set("access_token", f"Bearer {valid_token[:-4]}AAAA")
        me = client.get("/api/v1/auth/me")
        assert me.status_code == 401


class TestPasswordBoundary:
    def test_password_just_over_72_bytes_rejected_on_signup(self, client):
        payload = valid_signup_payload(unique_email())
        payload["password"] = "x" * 73
        resp = client.post("/api/v1/auth/signup", json=payload)
        assert resp.status_code == 422

    def test_password_just_over_72_bytes_rejected_on_login(self, client):
        email, _ = _signup(client)
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "y" * 73},
        )
        assert resp.status_code == 422

    def test_multibyte_password_byte_limit_enforced(self, client):
        # 25 emoji = 100 bytes > 72 -> rejected even though < 72 characters.
        multibyte = "\U0001f600" * 25
        payload = valid_signup_payload(unique_email())
        payload["password"] = multibyte
        resp = client.post("/api/v1/auth/signup", json=payload)
        assert resp.status_code == 422


class TestSecurityHeadersOnAuth:
    def test_auth_responses_carry_security_headers(self, client):
        email, _ = _signup(client)
        for route, kwargs in (
            ("/api/v1/auth/login", {"json": {"email": email, "password": PASSWORD}}),
            ("/api/v1/auth/me", {}),
        ):
            resp = client.post(route, **kwargs) if route.endswith("login") else client.get(route)
            assert resp.status_code in (200, 401)
            assert resp.headers.get("x-content-type-options") == "nosniff"
            assert resp.headers.get("x-frame-options") == "DENY"
            assert resp.headers.get("cache-control") == "no-store"
            # Never echo PII-rich stack traces/text in error bodies.
            assert "Traceback" not in resp.text


class TestRequestBodyLimit:
    def test_oversized_login_body_rejected_413(self, client):
        email, _ = _signup(client)
        big = {"email": email, "password": "x" * 20_000}  # ~20 KB body
        resp = client.post("/api/v1/auth/login", json=big)
        assert resp.status_code == 413


class TestLogout:
    def test_logout_clears_cookie_and_invalidates_browser_session(self, client):
        email, _ = _signup(client)
        login = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": PASSWORD},
        )
        assert login.status_code == 200
        assert client.get("/api/v1/auth/me").status_code == 200

        logout = client.post("/api/v1/auth/logout")
        assert logout.status_code == 200
        # Server asks the browser to expire the cookie (Max-Age=0).
        raw = _set_cookie_header(logout).lower()
        assert "access_token=" in raw
        assert "max-age=0" in raw

        # httpx honours the expiry, so the cookie no longer authenticates.
        assert client.get("/api/v1/auth/me").status_code == 401

    def test_logout_is_idempotent_without_a_session(self, client):
        # Calling sign-out with no cookie must not error or leak state.
        resp = client.post("/api/v1/auth/logout")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


class TestCorruptStorageNeverCrashes:
    def test_login_with_corrupted_hash_returns_401_not_500(self, client, db):
        """A damaged profile (e.g. non-bcrypt hash in DB) must behave exactly
        like a wrong password — never a server error."""
        from app.models.user import User

        email, _ = _signup(client)
        user = db.query(User).filter(User.email == email).one()
        # Column is NOT NULL; emulate corruption with a garbage non-bcrypt value.
        user.hashed_password = "corrupted-plaintext-not-a-bcrypt-hash"
        db.commit()

        resp = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": PASSWORD},
        )
        assert resp.status_code == 401
        assert "internal" not in resp.text.lower()


class TestCookieSecureFlagProduction:
    def test_secure_flag_set_when_environment_is_production(self, client, monkeypatch):
        """The cookie MUST carry Secure whenever we run as production."""
        email, _ = _signup(client)
        monkeypatch.setattr(settings, "environment", "production")
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": PASSWORD},
        )
        assert resp.status_code == 200
        raw = _set_cookie_header(resp).lower()
        assert "access_token=" in raw
        assert "secure" in raw
        assert "httponly" in raw
        assert "samesite=lax" in raw


class TestEnvironmentModeContract:
    """Pins the app's environment -> security-posture mapping.

    Pure-config assertions (no HTTP) that lock in the decisions CI depends
    on, so a future edit to the mode logic cannot silently break cookie
    authentication in the pipeline or weaken production.
    """

    def test_cookie_secure_is_production_only(self, monkeypatch):
        for env, expected in (
            ("development", False),
            ("testing", False),
            ("production", True),
        ):
            monkeypatch.setattr(settings, "environment", env)
            assert settings.cookie_secure is expected, env

    def test_docs_enabled_only_in_development(self, monkeypatch):
        for env, docs in (
            ("development", True),
            ("testing", False),
            ("production", False),
        ):
            monkeypatch.setattr(settings, "environment", env)
            assert settings.docs_enabled is docs, env

    def test_secure_cookie_roundtrips_over_http_for_current_env(self, client):
        """Whatever mode we run in, cookie auth must work end-to-end.

        Regression guard: if `cookie_secure` ever became True for the
        non-production modes that CI/local drive over plain HTTP, the test
        client would stop sending the cookie and this would 401.
        """
        email, _ = _signup(client)
        login = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": PASSWORD},
        )
        assert login.status_code == 200
        me = client.get("/api/v1/auth/me")
        assert me.status_code == 200, (
            "cookie auth failed over HTTP — check settings.cookie_secure "
            f"(environment={settings.environment!r})"
        )
        assert me.json()["email"] == email

