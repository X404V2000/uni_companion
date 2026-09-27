"""app/services/recommendation_service.py

PURPOSE
-------
AI module recommendations (hackathon "future updates + recommendations").

Given a module (its full NAME is the primary input, per the product rule), this
service produces a grounded set of study recommendations:

  1. It reads the module's REAL study materials from the library
     (`study_materials`) — YouTube videos, journals, PDFs, articles that
     actually exist and are approved.
  2. It asks Gemini (via the shared ai_service client) for module-specific
     guidance: what the module covers, what to focus on, and how to prepare.
  3. It returns BOTH: the AI guidance AND the real library links, so the UI
     never shows an invented URL.

COST / SCALE
------------
- Results are CACHED per (user, module, materials-fingerprint). A repeat view is
  free and instant; only a genuine change (new materials) regenerates.
- Generation consumes one AI credit via the same atomic quota used by
  summaries, so a student cannot exceed the daily free tier.
- If the provider is unavailable the credit is refunded and the endpoint still
  returns the real library links (graceful degradation).
"""
from __future__ import annotations

import hashlib
import logging
import uuid


from sqlalchemy.orm import Session

from app.models.ai import AISummaryCache
from app.models.material import StudyMaterial
from app.services import ai_service

logger = logging.getLogger(__name__)

# Cache namespace: recommendations are stored in the shared summary cache table
# under a content hash prefixed with this marker, so they can never collide with
# a real study-notes summary for the same module.
_RECO_PREFIX = "RECO::"

# How many library items to ground the prompt with (keeps the prompt small).
_MAX_LIBRARY_ITEMS = 12


class RecommendationUnavailableError(Exception):
    """Raised when the AI provider cannot produce recommendations."""


def _library_items(db: Session, module_code: str) -> list[StudyMaterial]:
    """Approved materials for a module, newest first, bounded."""
    return (
        db.query(StudyMaterial)
        .filter(
            StudyMaterial.module_code == module_code.upper(),
            StudyMaterial.is_approved.is_(True),
        )
        .order_by(StudyMaterial.resource_type.asc(), StudyMaterial.title.asc())
        .limit(_MAX_LIBRARY_ITEMS)
        .all()
    )


def _material_fingerprint(items: list[StudyMaterial]) -> str:
    """Stable hash of the library items, so the cache invalidates when the
    library changes (new materials -> fresh recommendations)."""
    joined = "|".join(f"{m.id}:{m.updated_at.isoformat()}" for m in items)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:16]


def _build_prompt(module_code: str, module_name: str, items: list[StudyMaterial]) -> str:
    """Build the recommendation prompt, grounded in real library titles."""
    catalogue = (
        "\n".join(f"- ({m.resource_type}) {m.title}" for m in items)
        or "- (no library items available yet)"
    )
    return (
        "You are a study advisor for a South African university student.\n"
        f"Module code: {module_code}\n"
        f"Module name: {module_name}\n\n"
        "The student's resource library already contains these items:\n"
        f"{catalogue}\n\n"
        "Write a short, practical study brief in markdown with EXACTLY these "
        "three sections (keep the headings):\n"
        "## What this module covers\n"
        "2-4 concise bullet points describing typical topics.\n"
        "## Focus areas before exams\n"
        "3-5 bullet points on what to prioritise and common pitfalls.\n"
        "## How to use the library\n"
        "2-4 bullet points advising HOW to use the listed items above (refer to "
        "them by title). Do NOT invent links or resource names.\n\n"
        "Be specific, concise and encouraging. Maximum 220 words total."
    )


def get_recommendations(
    db: Session, user_id: uuid.UUID, module_code: str, module_name: str
) -> dict:
    """Return recommendations for a module: AI brief + real library links.

    Cached per user+module+materials. Raises QuotaExceededError from ai_service
    when the daily credit cap is reached; raises RecommendationUnavailableError
    only when the provider fails AND there is no cached result to fall back on.
    """
    code = module_code.upper()
    items = _library_items(db, code)

    # Cache key: user + module + library fingerprint. Namespaced so it can
    # never collide with a study-notes summary hash.
    cache_key = hashlib.sha256(
        f"{_RECO_PREFIX}{code}:{_material_fingerprint(items)}".encode("utf-8")
    ).hexdigest()

    cached = (
        db.query(AISummaryCache)
        .filter(
            AISummaryCache.user_id == user_id,
            AISummaryCache.content_hash == cache_key,
        )
        .first()
    )
    ai_brief: str | None = cached.summary_text if cached else None
    ai_available = True

    if cached is None:
        # Reserve a credit first (raises QuotaExceededError if exhausted).
        ai_service._reserve_credit_atomically(db, user_id, ai_service._today())
        try:
            ai_brief, tokens = ai_service._call_gemini(
                _build_prompt(code, module_name, items)
            )
        except Exception as exc:  # provider failure -> refund, degrade gracefully
            ai_service._refund_credit(db, user_id, ai_service._today())
            ai_available = False
            logger.warning("recommendations: provider failed for %s: %s", code, exc)
        else:
            db.add(
                AISummaryCache(
                    user_id=user_id,
                    content_hash=cache_key,
                    module_code=code,
                    summary_text=ai_brief,
                    tokens_used=tokens,
                )
            )
            db.commit()

    return {
        "module_code": code,
        "module_name": module_name,
        "ai_brief": ai_brief,
        "ai_available": ai_available,
        "cached": cached is not None,
        "materials": [
            {
                "id": str(m.id),
                "title": m.title,
                "description": m.description,
                "url": m.url,
                "resource_type": m.resource_type,
            }
            for m in items
        ],
    }
