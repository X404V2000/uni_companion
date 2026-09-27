"""tests/test_contract_drift.py

Locks the contract: any schema change must regenerate docs/openapi.json, or
this test (and the CI drift gate) fails.
"""
from pathlib import Path

from scripts._openapi_utils import canonical_json

COMMITTED = Path("docs/openapi.json")


def test_committed_openapi_matches_app():
    """The committed docs/openapi.json must equal the live app schema."""
    assert COMMITTED.exists(), "docs/openapi.json is missing — run scripts/export_openapi.py"

    from app.main import app

    committed = COMMITTED.read_text(encoding="utf-8")
    fresh = canonical_json(app.openapi()) + "\n"
    assert fresh == committed, (
        "OpenAPI contract drift: docs/openapi.json is stale. "
        "Run `python scripts/export_openapi.py` and commit the result."
    )
