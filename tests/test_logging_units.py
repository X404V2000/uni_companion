"""
tests/test_logging_units.py

Unit tests for app/core/logging_config.py (Day 5 structured logging):

- PII/credential redaction (password, token, Bearer, Authorization, cookie)
- correlation-id injection from the contextvar
- rotating file handler configured with the expected backup count
"""
import logging

import pytest

from app.core.logging_config import (
    PIIRedactingFormatter,
    correlation_id_ctx,
    setup_logging,
)


@pytest.fixture
def formatter():
    return PIIRedactingFormatter(
        "%(asctime)s - [%(correlation_id)s] - %(name)s - %(levelname)s - %(message)s"
    )


def _make_record(msg, args=()):
    return logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname=__file__,
        lineno=0,
        msg=msg,
        args=args,
        exc_info=None,
    )


class TestRedaction:
    def test_password_value_redacted(self, formatter):
        record = _make_record('login attempt password="SuperSecret123"')
        out = formatter.format(record)
        assert "SuperSecret123" not in out
        assert "[REDACTED]" in out

    def test_bearer_token_redacted(self, formatter):
        record = _make_record("auth header Bearer abc.def.ghi.sig")
        out = formatter.format(record)
        assert "abc.def.ghi.sig" not in out
        assert "[REDACTED]" in out

    def test_authorization_key_redacted(self, formatter):
        record = _make_record('headers: {"authorization": "Bearer tok123"}')
        out = formatter.format(record)
        assert "tok123" not in out
        assert "Bearer" not in out

    def test_cookie_value_redacted(self, formatter):
        record = _make_record('cookie="access_token=secretvalue"')
        out = formatter.format(record)
        assert "secretvalue" not in out


class TestCorrelationId:
    def test_correlation_id_from_contextvar(self, formatter):
        token = correlation_id_ctx.set("corr-abc-123")
        try:
            record = _make_record("some event")
            out = formatter.format(record)
        finally:
            correlation_id_ctx.reset(token)
        assert "corr-abc-123" in out

    def test_explicit_correlation_id_wins(self, formatter):
        token = correlation_id_ctx.set("from-context")
        try:
            record = _make_record("event")
            record.correlation_id = "explicit-id"
            out = formatter.format(record)
        finally:
            correlation_id_ctx.reset(token)
        assert "explicit-id" in out


class TestSetup:
    def test_setup_logging_adds_rotating_file_handler(self):
        root = logging.getLogger()
        before_handlers = list(root.handlers)
        before_level = root.level
        try:
            setup_logging("development")
            file_handlers = [
                h for h in root.handlers
                if isinstance(h, logging.handlers.RotatingFileHandler)
            ]
            assert len(file_handlers) == 1
            assert file_handlers[0].backupCount == 5
        finally:
            # Fully restore prior handler set AND level so other tests
            # (and their caplog handlers) are unaffected.
            for h in list(root.handlers):
                if h not in before_handlers:
                    h.close()
            root.handlers = before_handlers
            root.setLevel(before_level)


class TestExceptionHandlerDoesNotLeak:
    def test_error_log_contains_only_type_name(self, monkeypatch):
        """The unhandled-exception log must never embed traceback/SQL values."""
        import asyncio

        from starlette.requests import Request

        import app.main as main_module
        from app.main import unhandled_exception_handler

        # Dedicated logger + capturing handler so the assertion is immune to
        # handler state mutated by other tests (monkeypatch swaps the module
        # logger the handler closes over).
        captured = []
        handler = logging.Handler()
        handler.emit = lambda record: captured.append(record.getMessage())

        isolated = logging.getLogger("isolated-leak-check")
        isolated.handlers = []
        isolated.setLevel(logging.DEBUG)
        isolated.propagate = False
        isolated.addHandler(handler)
        monkeypatch.setattr(main_module, "logger", isolated)

        scope = {"type": "http", "method": "GET", "path": "/x", "headers": []}
        request = Request(scope)

        class Boom(Exception):
            def __str__(self):
                return "secret-email-value@example.com [SQL: SELECT ...]"

        asyncio.run(unhandled_exception_handler(request, Boom("boom")))

        logged = " ".join(captured).lower()
        assert "secret-email-value@example.com" not in logged
        assert "[sql:" not in logged
        assert "boom" in logged  # only the exception CLASS name is logged
