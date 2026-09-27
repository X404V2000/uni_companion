"""scripts/_openapi_utils.py

PURPOSE
-------
Single source of truth for OpenAPI schema serialization. Both the exporter
(`export_openapi.py`) and the drift gate (`check_contract_drift.py`) must
produce byte-identical output, so the canonicalization lives in exactly one
place. (Blueprint §9 defect #1: if exporter and gate serialize differently,
the gate silently passes drift.)

KEEP THE THREE FLAGS (sort_keys, indent, ensure_ascii) IDENTICAL everywhere.
"""
from __future__ import annotations

import json
from typing import Any


def canonical_json(schema: dict[str, Any]) -> str:
    """Serialize a schema dict to the canonical, deterministic form."""
    return json.dumps(schema, sort_keys=True, indent=2, ensure_ascii=False)
