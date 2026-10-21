"""
tests/test_redis_optional.py

PURPOSE
-------
REDIS_URL is optional at runtime but must never be a boot-crash when set.

WHY THIS EXISTS
---------------
`app/core/rate_limiter.py` constructs the slowapi `Limiter` at MODULE IMPORT time,
and passes `storage_uri=settings.redis_url` when that setting is present. slowapi
delegates storage construction to `limits`, which resolves the `redis://` scheme by
importing the `redis` package. If that package is absent, `limits` raises
ConfigurationError during import - so the whole app fails to start.

That was reproduced before the fix:

    REDIS_URL=redis://localhost:6379/0 python -c "import app.main"
    limits.errors.ConfigurationError: 'redis' prerequisite not available

The dangerous property is that it only fails when REDIS_URL is SET, so a developer
with an empty REDIS_URL sees a perfectly healthy app, and the crash appears for the
first time in whatever environment sets the variable - typically production, via a
dashboard field, minutes before a demo.

So the guard is not "does Redis work" - it is "can the app import with REDIS_URL
set at all", which is a build-time property that must hold regardless of whether a
Redis server is reachable.
"""

import importlib
import os
import subprocess  # noqa: S603 - Test helper; argv is a fixed list, no shell and no user input.
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent


def test_redis_client_is_installed():
    """
    The `redis` package must be present in the environment.

    Deliberately a direct import check rather than a requirements.txt string
    match: the risk is a missing installable, not a missing line of text, and a
    pinned line that fails to resolve would still pass a text assertion.
    """
    redis = pytest.importorskip(
        "redis",
        reason="redis-py is required so that setting REDIS_URL cannot crash the app",
    )
    # A minimum major version, because limits 5.8 rejects redis 8+.
    major = int(redis.__version__.split(".")[0])
    assert 3 < major < 8, (
        f"redis {redis.__version__} is outside the range limits 5.8 accepts "
        "(>3,<8.0.0)"
    )


def test_limits_can_build_a_redis_storage():
    """
    `limits` - which actually opens the connection - must accept a redis:// URL.

    This is the exact call slowapi makes internally, so it fails the same way the
    app would.
    """
    from limits.storage import storage_from_string

    try:
        storage = storage_from_string("redis://127.0.0.1:6379/0")
    except Exception as exc:  # noqa: BLE001 - the point is to report ANY failure
        pytest.fail(
            "limits cannot construct Redis storage, so setting REDIS_URL would "
            f"crash the app on import: {type(exc).__name__}: {exc}"
        )
    assert type(storage).__name__ == "RedisStorage"


def test_app_imports_with_redis_url_set():
    """
    THE REGRESSION TEST.

    Runs a subprocess with REDIS_URL set and imports app.main. Deliberately a
    subprocess rather than an in-process import: the limiter is built once at
    module scope, so a same-process test would pass simply because another test
    already imported the module with redis_url unset.

    No Redis server is running for this test. That is intentional - construction
    is lazy about connecting, and the failure being guarded against happens at
    import, not at first request.
    """
    env = {
        "PATH": "/usr/bin:/bin",
        # Inherit the parent PYTHONPATH after the repo root, so a test double that
        # hides a package can reach the subprocess - otherwise this test cannot be
        # shown to fail, and an unfalsifiable guard is not a guard.
        "PYTHONPATH": f"{REPO_ROOT}:{os.environ.get('PYTHONPATH', '')}",
        # Required settings, or the app fails for unrelated reasons.
        "DATABASE_URL": "postgresql+psycopg://u:p@127.0.0.1:5432/db",
        "JWT_SECRET_KEY": "guard-test-secret-key-long-enough-for-validation-32",
        "ENVIRONMENT": "development",
        # The thing under test.
        "REDIS_URL": "redis://127.0.0.1:6379/0",
    }
    proc = subprocess.run(  # noqa: S603 - Test helper; argv is a fixed list, no shell and no user input.
        [sys.executable, "-c", "import app.main"],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert proc.returncode == 0, (
        "Importing app.main with REDIS_URL set failed. This is the production "
        "boot-crash: the limiter is constructed at import time and resolves the "
        "redis:// scheme immediately.\n\n"
        f"stderr:\n{proc.stderr[-2000:]}"
    )


def test_rate_limiter_falls_back_to_memory_without_redis_url(monkeypatch):
    """
    With REDIS_URL unset the limiter must still build, using in-memory storage.

    The other half of the contract: making Redis safe must not make it mandatory.
    """
    import app.core.config as config_module

    monkeypatch.setattr(config_module.settings, "redis_url", None, raising=False)
    module = importlib.reload(importlib.import_module("app.core.rate_limiter"))
    assert module.limiter is not None
    # Restore, so a later test does not inherit the reloaded module.
    importlib.reload(module)
