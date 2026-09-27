"""scripts/check_contract_drift.py

PURPOSE
-------
Fail if the committed docs/openapi.json differs from the running app's
generated schema. Protects the offshore client team from a silently stale
contract (blueprint §1 objective #1).

Exit codes:
  0 = in sync
  1 = drift detected
"""
from __future__ import annotations

import difflib
import os
import sys
from pathlib import Path

# Ensure the repo root is importable regardless of the invoking directory.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Mirror export_openapi.py's environment pinning so the drift gate runs from a
# clean shell (no inherited DATABASE_URL / JWT_SECRET_KEY / ENVIRONMENT). The
# app builds its engine at import time; a missing/legacy URL would otherwise
# crash the gate with psycopg2/Setting validation errors. `setdefault` never
# clobbers a caller's real values — CI's own env still takes precedence.
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault(
    "JWT_SECRET_KEY", "openapi-export-only-non-functional-secret-key-32b"
)
os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://export:export@localhost:5432/export"
)

from app.main import app  # noqa: E402
from scripts._openapi_utils import canonical_json  # noqa: E402

COMMITTED = Path("docs/openapi.json")


def main() -> int:
    if not COMMITTED.exists():
        print(f"[FAIL] {COMMITTED} does not exist. Run scripts/export_openapi.py.")
        return 1

    fresh = canonical_json(app.openapi()) + "\n"
    committed = COMMITTED.read_text(encoding="utf-8")

    if fresh == committed:
        print("[PASS] OpenAPI contract is in sync.")
        return 0

    print("[FAIL] OpenAPI contract drift detected.")
    print(f"  committed: {len(committed)} bytes")
    print(f"  fresh:     {len(fresh)} bytes")
    print("  Re-run: python scripts/export_openapi.py")
    # Readable, truncated diff (never dump thousands of lines into CI).
    diff = difflib.unified_diff(
        committed.splitlines(),
        fresh.splitlines(),
        fromfile="docs/openapi.json (committed)",
        tofile="docs/openapi.json (fresh)",
        lineterm="",
    )
    for line in list(diff)[:80]:
        print(line)
    return 1


if __name__ == "__main__":
    sys.exit(main())
