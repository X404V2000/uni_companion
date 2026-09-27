"""app/schemas/ai.py

Pydantic request/response schemas for the AI Summary Engine (Month 2, Week 1).

SECURITY
--------
- `module_code` is normalized to upper-case and length-bounded.
- `content` is length-bounded (50..32000 chars) and stripped of dangerous
  control characters ONLY — study text is NOT HTML-escaped (it is passed to
  the LLM, not rendered as HTML; escaping would corrupt maths/annotations and,
  more importantly, change the cache hash). This is why we do NOT reuse
  app.core.sanitizer.sanitize_string here (that is for display fields).
"""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core.sanitizer import CONTROL_CHAR_REGEX


class AISummaryRequest(BaseModel):
    module_code: str = Field(..., min_length=2, max_length=20)
    content: str = Field(
        # WHY 20 AND NOT 50:
        # The old floor of 50 rejected legitimate input. A student may drop in a
        # short .txt file, a single definition, or a small excerpt, and the
        # frontend also prefixes a source label ("[From file: notes.txt]") which
        # was counting toward the student's own budget — so a 20 character file
        # arrived as 37 and was refused for a reason the student could not fix.
        # 20 is enough to carry meaning ("Hash tables map keys to values.") and
        # the model produces a full guide from it; anything below that is not a
        # summary request, it is an empty box.
        # 200,000 characters (~60-80 pages of notes). Long documents are no
        # longer truncated by the service - it chunks and merges them - so this
        # ceiling exists only to bound the request body, not to cut content off.
        ..., min_length=20, max_length=200_000,
        description="Raw study notes, lecture text, or extracted page/file text.",
    )

    @field_validator("module_code")
    @classmethod
    def normalize_module(cls, v: str) -> str:
        clean = CONTROL_CHAR_REGEX.sub("", v).strip().upper()
        if not clean:
            raise ValueError("module_code must contain valid characters")
        return clean

    @field_validator("content")
    @classmethod
    def sanitize_content(cls, v: str) -> str:
        # Strip control characters / null bytes only; preserve normal text so
        # the cache hash is stable and the LLM receives the student's real
        # wording.
        clean = CONTROL_CHAR_REGEX.sub("", v).strip()
        if not clean:
            raise ValueError("Invalid characters detected in summary input text")
        return clean


class AISummaryResponse(BaseModel):
    summary: str
    cached: bool
    remaining_credits: int
    daily_limit: int


class UserQuotaResponse(BaseModel):
    usage_date: str
    summaries_used: int
    daily_limit: int
    remaining_credits: int


class SummaryHistoryItem(BaseModel):
    """One cached summary in the user's history (preview only)."""

    id: uuid.UUID
    module_code: str
    preview: str
    tokens_used: int
    created_at: datetime | None = None


class SummaryHistoryResponse(BaseModel):
    items: list[SummaryHistoryItem]


class RecommendedMaterial(BaseModel):
    """A real library item attached to a recommendation (never invented)."""

    id: uuid.UUID
    title: str
    description: str | None = None
    url: str
    resource_type: str


class ModuleRecommendationsResponse(BaseModel):
    """AI brief + the module's real library items."""

    module_code: str
    module_name: str
    ai_brief: str | None = None
    ai_available: bool
    cached: bool
    materials: list[RecommendedMaterial]


# ---------------------------------------------------------------------------
# "Chat with your brief" (RAG over the user's own document)
# ---------------------------------------------------------------------------

class BriefCreateRequest(BaseModel):
    """Ingest request. `content` is the already-extracted document text."""

    source_name: str = Field(..., min_length=1, max_length=255)
    content: str = Field(..., min_length=20, max_length=200_000)

    @field_validator("source_name")
    @classmethod
    def _clean_name(cls, v: str) -> str:
        return v.strip()[:255] or "document"


class BriefResponse(BaseModel):
    """A stored brief (metadata only — content is never echoed back in lists)."""

    id: uuid.UUID
    source_name: str
    char_count: int
    chunk_count: int
    created_at: datetime | None = None


class BriefListResponse(BaseModel):
    items: list[BriefResponse]


class BriefAskRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=500)


class BriefCitation(BaseModel):
    ordinal: int
    text: str


class BriefAnswerResponse(BaseModel):
    answer: str
    citations: list[BriefCitation]
    ai_available: bool


class LinkFetchRequest(BaseModel):
    """Ask the server to read a web page so it can be summarised.

    Only the URL is accepted; the server fetches it itself under a strict SSRF
    policy (see link_fetch_service). No other field would be safe to expose.
    """

    url: str = Field(min_length=4, max_length=2000)


class LinkFetchResponse(BaseModel):
    """The readable text extracted from a page, ready to summarise."""

    url: str
    title: str = ""
    text: str
    truncated: bool = False
    characters: int
