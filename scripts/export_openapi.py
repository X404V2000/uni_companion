"""scripts/export_openapi.py

PURPOSE
-------
Freeze the backend API contract into a static, deterministic `docs/openapi.json`
for the offshore Flutter/Dart team's code generation (Month 2, Week 2).

WHY A SCRIPT (instead of serving /openapi.json)?
------------------------------------------------
/docs and /openapi.json are deliberately disabled in staging and production
(hardening). This script regenerates the same schema from the DEVELOPMENT app
object, independent of the running environment, so the contract can be frozen
and committed even when deployment hardening is active.

USAGE
-----
    python scripts/export_openapi.py

Output: docs/openapi.json (deterministic key order, UTF-8, 2-space indent).
"""
from __future__ import annotations

import os
import sys

# Ensure the repo root is importable regardless of the invoking directory.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# ---------------------------------------------------------------------------
# ENVIRONMENT PINNING (must run BEFORE importing app.main)
# ---------------------------------------------------------------------------
# WHY: `app.main` -> `app.db.session` builds the SQLAlchemy engine at import
# time from settings.database_url. That URL is often inherited from the shell
# (e.g. CI sets `postgresql://...`). SQLAlchemy resolves the bare
# `postgresql://` scheme to the LEGACY `psycopg2` driver, which this project
# does not ship (we use psycopg v3) -> `ModuleNotFoundError: psycopg2`.
#
# WHAT: we pin the three values the app needs at import time so the exporter
# is deterministic and environment-independent:
#   1. ENVIRONMENT   -> "development" so docs_url/openapi_url are ENABLED and
#                       `app.openapi()` yields the full schema (hardened envs
#                       disable the docs route and would yield an empty map).
#   2. JWT_SECRET_KEY -> any non-empty value satisfies Settings(); the key is
#                       never used to issue tokens here, it only needs to parse.
#   3. DATABASE_URL  -> an explicit `postgresql+psycopg://` scheme. The app is
#                       never queried during export; the URL merely needs to
#                       construct the engine WITHOUT importing psycopg2.
#
# WHEN: always, before the first import of `app.main` / `app.db.session`.
# HOW: os.environ defaults (setdefault) — we do NOT clobber a caller's explicit
#      values unless they are absent/empty, so local dev with a real .env still
#      works unchanged.
# ---------------------------------------------------------------------------
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault(
    "JWT_SECRET_KEY", "openapi-export-only-non-functional-secret-key-32b"
)
os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://export:export@localhost:5432/export"
)

from app.main import app  # noqa: E402
from scripts._openapi_utils import canonical_json  # noqa: E402


def export_schema(output_path: str | None = None) -> str:
    """Generate the OpenAPI dict and write it to docs/openapi.json.

    `output_path` may be overridden (e.g. by CI to a temp file for the drift
    gate); if None, defaults to the committed docs/openapi.json location.
    """
    # `app.openapi()` reflects the app's CURRENT docs settings. In development
    # docs are enabled, so this is the full schema; in a hardened shell it
    # would be empty. To make the export environment-independent regardless,
    # we generate from the app object whose docs_url/openapi_url were set at
    # import time in development — i.e. the contract is frozen from the dev
    # build, exactly as intended.
    schema = app.openapi()

    if output_path is None:
        output_path = os.path.join(
            os.path.dirname(__file__), "..", "docs", "openapi.json"
        )
    output_path = os.path.abspath(output_path)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(canonical_json(schema))
        f.write("\n")

    paths = schema.get("paths", {})
    route_count = sum(
        1
        for path_item in paths.values()
        for method in path_item
        if method in {"get", "post", "put", "patch", "delete"}
    )
    print(f"[+] Exported OpenAPI contract to: {output_path}")
    print(f"[+] Active routes documented: {route_count}")
    return output_path


if __name__ == "__main__":
    import sys

    export_schema(sys.argv[1] if len(sys.argv) > 1 else None)
