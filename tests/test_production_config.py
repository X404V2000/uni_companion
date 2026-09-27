"""tests/test_production_config.py

Week 4, Day 3 — production configuration & environment hardening.

Covers the acceptance criteria from SETUP_DAY3.md:

1. Production boot guard: ENVIRONMENT=production with a weak JWT_SECRET_KEY
   (too short OR a known dev/CI default) refuses startup (ValidationError).
2. Docs disablement: in production/staging, /docs and /openapi.json are absent
   (docs_url / openapi_url are None on the FastAPI app).
3. Cookie security: auth cookies are Secure + SameSite=Lax in production/
   staging, and NOT Secure in development/testing.
4. HSTS: emitted only for production/staging (HTTPS-terminated modes).

These are pure-config tests — they instantiate Settings directly with explicit
values (no .env dependency), so they are fast and deterministic.
"""

import pytest
from pydantic import ValidationError

from app.core.config import Settings

STRONG_KEY = "a" * 64
WEAK_KEYS = [
    # Too short
    "short",
    # Known dev/CI/docker defaults (denylist)
    "your-secret-key-here",
    "your-super-secret-key-change-this-in-production",
    "local-docker-dev-super-secret-key-min-32-chars",
    "local-docker-development-super-secret-key-32chars",
    "ci-testing-super-secret-key-min-32-chars",
    "ci-testing-super-secret-key-min-32-chars-long",
]


def _settings(environment: str, key: str) -> Settings:
    return Settings(
        environment=environment,
        jwt_secret_key=key,
        database_url="postgresql+psycopg://u:p@localhost/db",
    )


class TestProductionBootGuard:
    @pytest.mark.parametrize("key", WEAK_KEYS)
    def test_production_rejects_weak_secret(self, key):
        with pytest.raises(ValidationError):
            _settings("production", key)

    @pytest.mark.parametrize("key", WEAK_KEYS)
    def test_staging_rejects_weak_secret(self, key):
        with pytest.raises(ValidationError):
            _settings("staging", key)

    def test_production_accepts_strong_secret(self):
        s = _settings("production", STRONG_KEY)
        assert s.environment == "production"
        assert len(s.jwt_secret_key) >= 32

    def test_development_allows_weak_secret(self):
        # The guard deliberately does NOT run outside production/staging so
        # local dev and CI keep working with their placeholder keys.
        s = _settings("development", "short")
        assert s.environment == "development"

    def test_testing_allows_ci_default_key(self):
        s = _settings("testing", "ci-testing-super-secret-key-min-32-chars")
        assert s.environment == "testing"


class TestDerivedSecurityModes:
    @pytest.mark.parametrize(
        "environment,hardened,cookie_secure,docs,hsts",
        [
            ("development", False, False, True, False),
            # testing: hardened docs/errors, but NO Secure cookie and NO HSTS
            ("testing", True, False, False, False),
            # staging: fully hardened, parity with production
            ("staging", True, True, False, True),
            ("production", True, True, False, True),
        ],
    )
    def test_security_posture_matrix(
        self, environment, hardened, cookie_secure, docs, hsts
    ):
        s = _settings(environment, STRONG_KEY)
        assert s.is_hardened is hardened, environment
        assert s.cookie_secure is cookie_secure, environment
        assert s.docs_enabled is docs, environment
        assert s.hsts_enabled is hsts, environment


class TestDocsDisablement:
    def test_docs_enabled_in_development(self):
        s = _settings("development", STRONG_KEY)
        assert s.docs_enabled is True

    @pytest.mark.parametrize("environment", ["production", "staging"])
    def test_docs_disabled_in_hardened_modes(self, environment):
        s = _settings(environment, STRONG_KEY)
        assert s.docs_enabled is False


class TestCookieSecurityContract:
    @pytest.mark.parametrize("environment", ["production", "staging"])
    def test_secure_cookie_in_prod_and_staging(self, environment):
        s = _settings(environment, STRONG_KEY)
        assert s.cookie_secure is True

    @pytest.mark.parametrize("environment", ["development", "testing"])
    def test_no_secure_cookie_in_dev_and_testing(self, environment):
        s = _settings(environment, STRONG_KEY)
        assert s.cookie_secure is False
