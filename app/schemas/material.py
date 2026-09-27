"""app/schemas/material.py

Pydantic schemas for the Materials Search Engine (Month 2, Week 1, Day 2) +
the admin curation surface (Month 2, Week 3, Day 1).
"""
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

from app.core.sanitizer import sanitize_string

ResourceType = Literal["YOUTUBE", "JOURNAL", "PDF", "ARTICLE"]


class MaterialResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    module_code: str
    title: str
    description: str | None = None
    url: str
    resource_type: ResourceType
    quality_resolution: str
    # Relevance of this row to the caller's search query. 0 when no query was
    # supplied, because there is nothing to score against - reporting 0 is
    # honest, and the field is always present so clients can rely on it.
    relevance_score: int = 0


class MaterialAdminCreate(BaseModel):
    module_code: str = Field(..., min_length=2, max_length=20)
    title: str = Field(..., min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    url: HttpUrl
    resource_type: ResourceType
    quality_resolution: str = Field(default="360p", max_length=10)
    is_approved: bool = True

    @field_validator("module_code")
    @classmethod
    def normalize_module(cls, v: str) -> str:
        clean = sanitize_string(v)
        if not clean:
            raise ValueError("Invalid module code")
        return clean.upper()

    @field_validator("title", "description")
    @classmethod
    def sanitize_text(cls, v: str | None) -> str | None:
        if v is None:
            return None
        clean = sanitize_string(v)
        if not clean and v:
            raise ValueError("Invalid characters detected in text field")
        return clean


class MaterialAdminUpdate(BaseModel):
    """All fields optional — PATCH semantics (only sent fields are changed)."""

    title: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    url: HttpUrl | None = None
    resource_type: ResourceType | None = None
    quality_resolution: str | None = Field(default=None, max_length=10)
    is_approved: bool | None = None

    @field_validator("title", "description")
    @classmethod
    def sanitize_text(cls, v: str | None) -> str | None:
        if v is None:
            return None
        clean = sanitize_string(v)
        if not clean and v:
            raise ValueError("Invalid characters detected in text field")
        return clean


class MaterialAdminResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    module_code: str
    title: str
    description: str | None
    url: str
    resource_type: str
    quality_resolution: str
    is_approved: bool
    created_by_user_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class MaterialSearchQuery(BaseModel):
    q: str | None = Field(default=None, max_length=100)
    module_code: str = Field(..., min_length=2, max_length=20)
    resource_type: ResourceType | None = None
    page: int = Field(default=1, ge=1)
    size: int = Field(default=20, ge=1, le=50)

    @field_validator("module_code")
    @classmethod
    def normalize_module(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("q")
    @classmethod
    def sanitize_query(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = sanitize_string(v)
        return cleaned or None


# ---------------------------------------------------------------------------
# Bulk import (Month 2, Week 3, Day 2)
# ---------------------------------------------------------------------------
# The same report shape is returned by BOTH dry-run and commit modes. The
# `dry_run` flag tells the caller which mode produced it; nothing else changes.
# This is what makes "dry-run reports exactly what commit will do" a contract.

ImportAction = Literal["created", "updated", "skipped_duplicate", "rejected_invalid"]


class ImportRowResult(BaseModel):
    """Outcome for a single row, whether or not it was written."""

    row_number: int  # 1-indexed for CSV; array index + 1 for JSON
    action: ImportAction
    module_code: str | None = None
    url: str | None = None
    error: str | None = None  # present only for rejected_invalid


class ImportReport(BaseModel):
    """Aggregate outcome of a dry-run or commit import.

    Bounded by construction: `results` holds at most MAX_ROWS (500) entries,
    each ~200 B, so the serialized response stays well under ~100 KB.
    """

    dry_run: bool
    total_rows: int
    created: int
    updated: int
    skipped_duplicate: int
    rejected_invalid: int
    results: list[ImportRowResult]


class IngestResult(BaseModel):
    """Outcome of an on-demand resource fetch for one of the caller's modules.

    The endpoint takes no user-supplied URL: only the module code, which must
    belong to the caller. See material_ingest_service for the SSRF design.
    """

    module_code: str
    inserted: int
    updated: int
    total: int
    skipped: bool = False
    topics: list[str] = []
    message: str


# ---------------------------------------------------------------------------
# Admin materials coverage (Month 2, Week 3, Day 3)
# ---------------------------------------------------------------------------
# Operators need to know not only what content exists but where it is MISSING,
# so an empty module can be spotted before a student opens it and finds nothing.
# The three sections below answer that from both directions:
#   by_module -> grouped by the code on the content itself
#   starved   -> codes students are enrolled in that have no content at all
class CoverageSummary(BaseModel):
    """Global counts.

    Invariants the service guarantees (and the tests assert):
      approved + unapproved == total_materials
      modules_with_materials == distinct module_code values in study_materials
      starved_modules == number of distinct modules with no materials
    """

    total_materials: int
    approved: int
    unapproved: int
    modules_with_materials: int
    starved_modules: int


class CoverageByModule(BaseModel):
    """Per-module counts. Sorted total DESC, then module_code ASC."""

    module_code: str
    total: int
    approved: int
    unapproved: int
    last_updated_at: datetime | None


class StarvedModule(BaseModel):
    """A module students are enrolled in that has zero study materials.

    `module_code` is the code students typed; `module_name` is the name they
    gave it (the primary identifier per the product rules), which may be None
    for a legacy row created before names were required.
    """

    module_code: str
    module_name: str | None


class CoverageResponse(BaseModel):
    """Bounded coverage report.

    BOTH lists are bounded by `size` independently, so the payload is O(size)
    regardless of how many modules or codes exist.
    """

    summary: CoverageSummary
    by_module: list[CoverageByModule]
    starved: list[StarvedModule]
    page: int
    size: int
    # Totals for the FULL result set, so the client can paginate without
    # re-counting, and can tell "no more pages" from "empty".
    by_module_total: int
    starved_total: int
