"""app/services/material_import_service.py

PURPOSE
-------
Bulk-import study_materials from CSV or JSON, with a shared validator/planner
used by BOTH dry-run and commit modes. (Month 2, Week 3, Day 2.)

WHY THIS DESIGN
---------------
Dry-run is a GUARANTEE, not a preview: the exact same `plan_import` that
produces the report is the thing `apply_plan` executes in commit mode. The only
difference between the two modes is whether the plan is applied. This removes
the classic "dry-run said X but real run did Y" divergence class entirely.

SECURITY
--------
- Row cap 500 + body cap 1 MB, enforced at the router (and mirrored in the
  middleware's path-based exemption).
- Per-row validation reuses `MaterialAdminCreate` — the SAME schema as
  single-create — so normalization (uppercase module_code), URL scheme check
  (`HttpUrl`), and text sanitization are identical between bulk and single
  paths (zero divergence).
- CSV/JSON parsed only with the stdlib `csv`/`json` modules: no `eval`, no
  `exec`, no `pickle`, no entity expansion (no XXE / billion-laughs vectors).
- Commit is ONE transaction: any unexpected exception rolls back the entire
  batch, so a failure mid-way can never leave a partial import.

DUPLICATE SEMANTICS
-------------------
"Duplicate" is the application-level key `(module_code, url)` — same module AND
same URL. Same URL in different modules is legitimate (a general tutorial can
serve INF154 and COS132); same module different URLs are legitimate too.
"""

from __future__ import annotations

import csv
import io
import json
import logging
import uuid
from dataclasses import dataclass
from typing import Literal

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models.material import StudyMaterial
from app.schemas.material import (
    ImportAction,
    ImportReport,
    ImportRowResult,
    MaterialAdminCreate,
)

logger = logging.getLogger(__name__)

# Hard bounds (see §6 of the Day 2 blueprint). Kept here as the single source of
# truth so the router and tests import the same constants.
MAX_ROWS = 500
MAX_BODY_BYTES = 1_048_576  # 1 MB

# Resource types are already constrained by the schema Literal, but the import
# coerces raw strings before schema validation, so we cheaply pre-check here to
# give a friendlier per-row error than a raw Pydantic Literal failure would.
ALLOWED_RESOURCE_TYPES = {"YOUTUBE", "JOURNAL", "PDF", "ARTICLE"}

# Required CSV columns. `title`, `url`, `module_code`, `resource_type` are
# mandatory; `description`, `quality_resolution`, `is_approved` are optional.
REQUIRED_CSV_COLUMNS = {"module_code", "title", "url", "resource_type"}


class ImportFormatError(Exception):
    """Raised when the payload cannot be parsed at all (not a per-row error)."""


@dataclass
class _DecodedRow:
    """A single parsed+validated row before duplicate resolution."""

    row_number: int
    payload: MaterialAdminCreate | None  # None when validation failed
    error: str | None


@dataclass
class _Decision:
    """One row's planned outcome (shared by dry-run and commit)."""

    row_number: int
    action: ImportAction
    payload: MaterialAdminCreate | None
    existing_id: uuid.UUID | None
    error: str | None


@dataclass
class _Plan:
    """The full planned outcome of a batch, before any write."""

    decisions: list[_Decision]


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

def parse_csv(content: bytes) -> list[dict]:
    """Parse a UTF-8 CSV payload into a list of row dicts.

    Raises ImportFormatError when the bytes are not valid UTF-8 or when a
    required column is missing (checked BEFORE parsing rows so a genuinely
    wrong file fails fast with a clear message).
    """
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ImportFormatError("CSV must be UTF-8 encoded") from exc

    reader = csv.DictReader(io.StringIO(text))
    fieldnames = set(reader.fieldnames or [])
    missing = REQUIRED_CSV_COLUMNS - fieldnames
    if missing:
        raise ImportFormatError(f"CSV missing required columns: {sorted(missing)}")

    return [row for row in reader]


def parse_json(content: bytes) -> list[dict]:
    """Parse a JSON payload; it MUST be an array of objects."""
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ImportFormatError(f"Invalid JSON: {exc.msg}") from exc

    if not isinstance(parsed, list):
        raise ImportFormatError("JSON import must be an array of objects")
    return parsed


def parse_payload(content_type: str, content: bytes) -> list[dict]:
    """Route a request body to the correct parser based on Content-Type."""
    # Split off any charset/params (e.g. "text/csv; charset=utf-8").
    ct = content_type.split(";", 1)[0].strip().lower()
    if ct == "text/csv":
        return parse_csv(content)
    if ct == "application/json":
        return parse_json(content)
    raise ImportFormatError(f"Unsupported Content-Type: {content_type!r}")


# ---------------------------------------------------------------------------
# Per-row validation
# ---------------------------------------------------------------------------

def _coerce_bool(value: object) -> bool:
    """Coerce a JSON/CSV scalar to bool with a small, explicit truth set.

    CSV always yields strings; JSON may yield native booleans/ints. Accepting
    {"1", "true", "yes", "y"} (case-insensitive) plus real booleans keeps admin
    spreadsheets forgiving without accepting arbitrary strings as truthy.
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y"}
    return bool(value)


def _validate_row(row_number: int, raw: dict) -> _DecodedRow:
    """Validate one raw row by building a MaterialAdminCreate (same as single-create).

    Coerces CSV strings / JSON natives into the field types the schema expects,
    pre-checks the resource_type allow-list for a friendlier message, then lets
    Pydantic do everything else (HttpUrl scheme, sanitizer, length bounds).
    """
    normalized = {
        "module_code": str(raw.get("module_code", "")),
        "title": str(raw.get("title", "")),
        "description": raw.get("description") or None,
        "url": str(raw.get("url", "")),
        "resource_type": str(raw.get("resource_type", "")).upper(),
        "quality_resolution": str(raw.get("quality_resolution") or "360p"),
        "is_approved": _coerce_bool(raw.get("is_approved", True)),
    }

    if normalized["resource_type"] not in ALLOWED_RESOURCE_TYPES:
        return _DecodedRow(
            row_number,
            None,
            f"resource_type must be one of {sorted(ALLOWED_RESOURCE_TYPES)}",
        )

    try:
        payload = MaterialAdminCreate(**normalized)
    except ValidationError as exc:
        # Condense Pydantic's structured error into one short human line.
        first = exc.errors()[0]
        loc = ".".join(str(part) for part in first["loc"])
        return _DecodedRow(row_number, None, f"{loc}: {first['msg']}")

    return _DecodedRow(row_number, payload, None)


# ---------------------------------------------------------------------------
# Planner (shared by dry-run and commit)
# ---------------------------------------------------------------------------

def plan_import(
    db: Session,
    rows: list[dict],
    on_duplicate: Literal["update", "skip", "fail"] = "update",
) -> _Plan:
    """Validate every row and resolve duplicates against the DB — NO writes.

    This is the single source of truth for what an import will do. Dry-run
    reports it; commit applies it via apply_plan. Keeping it write-free means
    a dry run cannot, by construction, mutate anything.
    """
    decisions: list[_Decision] = []

    for idx, raw in enumerate(rows, start=1):
        decoded = _validate_row(idx, raw)

        # Validation failure -> rejected row, never a write.
        if decoded.payload is None:
            decisions.append(
                _Decision(idx, "rejected_invalid", None, None, decoded.error)
            )
            continue

        # Duplicate = (module_code, url). Both filters, not one.
        existing = (
            db.query(StudyMaterial)
            .filter(
                StudyMaterial.module_code == decoded.payload.module_code,
                StudyMaterial.url == str(decoded.payload.url),
            )
            .first()
        )

        if existing is None:
            decisions.append(_Decision(idx, "created", decoded.payload, None, None))
        elif on_duplicate == "skip":
            decisions.append(
                _Decision(
                    idx, "skipped_duplicate", decoded.payload, existing.id, None
                )
            )
        elif on_duplicate == "fail":
            # Marked rejected; the router refuses the whole batch (409).
            decisions.append(
                _Decision(
                    idx,
                    "rejected_invalid",
                    decoded.payload,
                    existing.id,
                    "duplicate found; on_duplicate=fail",
                )
            )
        else:  # "update" (default)
            decisions.append(
                _Decision(idx, "updated", decoded.payload, existing.id, None)
            )

    return _Plan(decisions)


# ---------------------------------------------------------------------------
# Applier (commit only)
# ---------------------------------------------------------------------------

def apply_plan(db: Session, plan: _Plan, admin_user_id: uuid.UUID) -> None:
    """Apply a plan's write decisions within the caller's transaction.

    NOTE: this function intentionally does NOT commit — the router owns the
    transaction boundary. If any statement raises, the caller's session rolls
    back the ENTIRE batch (the atomicity guarantee). It also flushes nothing
    itself; the router commits once at the end.
    """
    for decision in plan.decisions:
        if decision.action == "created":
            db.add(
                StudyMaterial(
                    module_code=decision.payload.module_code,
                    title=decision.payload.title,
                    description=decision.payload.description,
                    url=str(decision.payload.url),
                    resource_type=decision.payload.resource_type,
                    quality_resolution=decision.payload.quality_resolution,
                    is_approved=decision.payload.is_approved,
                    created_by_user_id=admin_user_id,
                )
            )
        elif decision.action == "updated":
            # Re-fetch by id; this is the row matched during planning. If it
            # vanished between plan and apply (impossible within one txn), .one()
            # raises and the whole batch rolls back rather than half-applying.
            material = (
                db.query(StudyMaterial)
                .filter(StudyMaterial.id == decision.existing_id)
                .one()
            )
            material.title = decision.payload.title
            material.description = decision.payload.description
            material.resource_type = decision.payload.resource_type
            material.quality_resolution = decision.payload.quality_resolution
            material.is_approved = decision.payload.is_approved
            # created_by_user_id is preserved: the original curator stays
            # recorded. `updated_at` is refreshed by the model's onupdate hook.
        # skipped_duplicate and rejected_invalid are deliberate no-ops.


# ---------------------------------------------------------------------------
# Report builder
# ---------------------------------------------------------------------------

def build_report(plan: _Plan, dry_run: bool) -> ImportReport:
    """Render a _Plan into the public ImportReport shared by both modes."""
    results = [
        ImportRowResult(
            row_number=decision.row_number,
            action=decision.action,
            module_code=decision.payload.module_code if decision.payload else None,
            url=str(decision.payload.url) if decision.payload else None,
            error=decision.error,
        )
        for decision in plan.decisions
    ]
    return ImportReport(
        dry_run=dry_run,
        total_rows=len(results),
        created=sum(1 for r in results if r.action == "created"),
        updated=sum(1 for r in results if r.action == "updated"),
        skipped_duplicate=sum(1 for r in results if r.action == "skipped_duplicate"),
        rejected_invalid=sum(1 for r in results if r.action == "rejected_invalid"),
        results=results,
    )


def log_import(
    actor_id: uuid.UUID,
    dry_run: bool,
    total_rows: int,
    created: int,
    updated: int,
    rejected: int,
) -> None:
    """Emit ONE INFO audit line per import (mirrors Day 1's mutation logging)."""
    logger.info(
        "material.admin.import actor=%s dry_run=%s total=%d created=%d "
        "updated=%d rejected=%d",
        actor_id,
        dry_run,
        total_rows,
        created,
        updated,
        rejected,
    )
