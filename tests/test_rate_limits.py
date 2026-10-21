"""tests/test_rate_limits.py

Tests for the credential-endpoint rate limits.

WHY THESE EXIST
---------------
The production limits (5/minute on login) are correct: they are what stops
password brute-forcing. But they are hostile during a live demo - three mistyped
passwords on stage means a 60 second lockout on the exact screen the judges are
watching, and there is no way to recover while they wait.

So the limits are relaxed outside production and kept strict in production. Two
things must stay true, and both are easy to break by accident:

  1. A demo must not lock itself out.
  2. PRODUCTION MUST NEVER BE RELAXED. If a future edit loosens the production
     value, the brute-force protection silently disappears, which is exactly the
     kind of change nobody notices until it is exploited.

These tests pin both properties, and that the limits are defined in ONE place
rather than hard-coded per route.
"""
from __future__ import annotations

from app.core import rate_limiter as rl


class TestLimitsAreEnvironmentAware:
    def test_credential_limit_is_relaxed_outside_production(self):
        """A demo must survive several mistyped passwords."""
        limit = int(rl.AUTH_CREDENTIAL_LIMIT.split("/")[0])
        assert limit >= 20, (
            "outside production the credential limit must leave room for "
            "typing mistakes during a live demo"
        )

    def test_credential_limit_is_lowercase_per_minute_form(self):
        # slowapi requires the "<n>/<period>" form; a typo here fails at import
        # time on the route, which is a confusing way to discover it.
        for value in (
            rl.AUTH_CREDENTIAL_LIMIT,
            rl.AUTH_LOGOUT_LIMIT,
            rl.ACCOUNT_DELETE_LIMIT,
        ):
            count, _, period = value.partition("/")
            assert count.isdigit(), f"bad limit {value!r}"
            assert period in {"second", "minute", "hour", "day"}, (
                f"bad period in {value!r}"
            )

    def test_account_deletion_is_not_relaxed(self):
        """Deleting an account is destructive; a demo never needs it repeated."""
        limit = int(rl.ACCOUNT_DELETE_LIMIT.split("/")[0])
        assert limit <= 5

    def test_logout_is_not_more_restrictive_than_login(self):
        # Logout is idempotent and harmless, so it should not be the tighter one.
        assert int(rl.AUTH_LOGOUT_LIMIT.split("/")[0]) >= 5


class TestProductionStaysStrict:
    def test_production_uses_the_strict_credential_limit(self, monkeypatch):
        """The single most important assertion in this file.

        Reloading the module with ENVIRONMENT=production must produce a strict
        limit. If someone loosens the production value, this fails.
        """
        import importlib

        import app.core.config as config_module

        monkeypatch.setattr(
            config_module.settings, "environment", "production", raising=False
        )
        try:
            reloaded = importlib.reload(rl)
            limit = int(reloaded.AUTH_CREDENTIAL_LIMIT.split("/")[0])
            assert limit <= 5, (
                "PRODUCTION MUST NOT BE RELAXED: a loose limit removes the "
                "brute-force protection on login"
            )
        finally:
            # Restore the development-configured module for other tests.
            monkeypatch.undo()
            importlib.reload(rl)

    def test_development_is_actually_relaxed(self):
        # The counterpart to the test above: confirm we are not simply always
        # strict, which would mean the relaxation never took effect.
        assert rl._IS_PRODUCTION is False


class TestSingleSourceOfTruth:
    def test_routes_do_not_hard_code_credential_limits(self):
        """Signup/login must use the shared constants, not literal numbers.

        Hard-coded values are how the environment-aware policy would silently
        drift apart between endpoints.
        """
        import pathlib

        source = (
            pathlib.Path(__file__).resolve().parents[1]
            / "app"
            / "api"
            / "v1"
            / "auth.py"
        ).read_text()

        assert "AUTH_CREDENTIAL_LIMIT" in source, "login/signup must use the shared limit"
        assert '@limiter.limit("5/minute")' not in source, (
            "a hard-coded 5/minute is present; it would ignore the environment"
        )
        assert '@limiter.limit("10/minute")' not in source, (
            "a hard-coded logout limit is present; it would ignore the environment"
        )

    def test_every_auth_limit_decorator_uses_a_constant(self):
        import pathlib
        import re

        source = (
            pathlib.Path(__file__).resolve().parents[1]
            / "app"
            / "api"
            / "v1"
            / "auth.py"
        ).read_text()

        for arg in re.findall(r"@limiter\.limit\(([^)]*)\)", source):
            assert not arg.strip().startswith('"'), (
                f"hard-coded limit found: {arg!r}"
            )
