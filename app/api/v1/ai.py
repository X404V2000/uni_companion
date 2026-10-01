"""app/api/v1/ai.py

PURPOSE
-------
AI Summary Engine endpoints (Month 2, Week 1).

POST /api/v1/ai/summarize  — generate/retrieve a course-aware summary with
                             strict daily quota + per-user caching.
GET  /api/v1/ai/quota      — read the caller's current daily credit ledger.

Both require a valid access token (get_current_user). The summarize endpoint
is rate-limited by slowapi as defense-in-depth on top of the DB quota.
"""
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rate_limiter import limiter
from app.db.session import get_db
from app.models.academic import Module
from app.models.user import User
from app.schemas.ai import (
    AISummaryRequest,
    AISummaryResponse,
    BriefAnswerResponse,
    BriefAskRequest,
    BriefCreateRequest,
    BriefListResponse,
    BriefResponse,
    LinkFetchRequest,
    LinkFetchResponse,
    ModuleRecommendationsResponse,
    SummaryHistoryResponse,
    UserQuotaResponse,
)
from app.schemas.analytics import SignalRequest
from app.services import (
    ai_service,
    analytics_service,
    brief_rag_service,
    link_fetch_service,
    recommendation_service,
)

router = APIRouter(prefix="/ai", tags=["AI Engine"])


@router.post(
    "/summarize",
    response_model=AISummaryResponse,
    status_code=status.HTTP_200_OK,
)
@limiter.limit("20/minute")
def request_ai_summary(
    request: Request,
    payload: AISummaryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate or retrieve a course-aware AI summary.

    - Identical (module, content) for the same user returns a cached summary
      without spending a credit.
    - Otherwise one daily credit is atomically claimed and Gemini is called.
    """
    t0 = time.perf_counter()
    try:
        result = ai_service.get_or_create_summary(
            db=db,
            user_id=current_user.id,
            module_code=payload.module_code,
            content=payload.content,
        )
        # Instrument the core loop: distinguish a paid generation from a $0
        # cache hit so cost/engagement can be read from metrics later.
        analytics_service.record_event(
            db,
            current_user.id,
            "SUMMARY_CACHE_HIT" if result.get("cached") else "SUMMARY_GENERATED",
            module_code=payload.module_code,
            has_consent=getattr(current_user, "_has_improvement_consent", False),
        )
        return result
    except ai_service.QuotaExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except ai_service.AIProviderUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI summary service is temporarily unavailable.",
        ) from exc
    finally:
        # Record server-measured latency even on error (errors are part of
        # the friction picture). perf_counter() is monotonic.
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        analytics_service.record_duration(
            db,
            current_user.id,
            "SUMMARIZE_DURATION",
            duration_ms=elapsed_ms,
            has_consent=getattr(current_user, "_has_improvement_consent", False),
        )


@router.get(
    "/quota",
    response_model=UserQuotaResponse,
    status_code=status.HTTP_200_OK,
)
def read_quota(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the caller's AI free-tier usage for today."""
    return ai_service.get_user_quota(db, current_user.id)


@router.get(
    "/summaries",
    response_model=SummaryHistoryResponse,
    status_code=status.HTTP_200_OK,
)
def list_my_summaries(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the current user's summary history (newest first, previews only)."""
    return {
        "items": ai_service.list_user_summaries(
            db=db, user_id=current_user.id, limit=limit
        )
    }


@router.get(
    "/modules/{module_code}/recommendations",
    response_model=ModuleRecommendationsResponse,
    status_code=status.HTTP_200_OK,
)
def module_recommendations(
    module_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """AI study brief for a module + the module's real library items.

    The module must belong to the caller (we take its full NAME from the user's
    own module record — the name is the primary identifier per product rules).
    Returns 404 for a module the user does not own, so module ownership is never
    leaked.
    """
    owned = (
        db.query(Module)
        .filter(Module.user_id == current_user.id, Module.code == module_code.upper())
        .first()
    )
    if owned is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module not found in your account.",
        )

    try:
        return recommendation_service.get_recommendations(
            db=db,
            user_id=current_user.id,
            module_code=owned.code,
            module_name=owned.name,
        )
    except ai_service.QuotaExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)
        ) from exc


# ---------------------------------------------------------------------------
# "Chat with your brief" — RAG over the caller's own document
# ---------------------------------------------------------------------------

@router.post(
    "/briefs",
    response_model=BriefResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_brief(
    payload: BriefCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Store a brief (already-extracted text) and chunk it for retrieval."""
    try:
        return brief_rag_service.ingest_brief(
            db=db,
            user_id=current_user.id,
            source_name=payload.source_name,
            text=payload.content,
        )
    except brief_rag_service.BriefTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(exc)
        ) from exc


@router.get(
    "/briefs",
    response_model=BriefListResponse,
    status_code=status.HTTP_200_OK,
)
def list_my_briefs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the caller's briefs (metadata only), newest first."""
    from app.models.ai import BriefChunk, BriefDocument

    rows = (
        db.query(BriefDocument)
        .filter(BriefDocument.user_id == current_user.id)
        .order_by(BriefDocument.created_at.desc())
        .limit(50)
        .all()
    )
    chunk_counts = dict(
        db.query(BriefChunk.brief_id, func.count(BriefChunk.id))
        .filter(BriefChunk.user_id == current_user.id)
        .group_by(BriefChunk.brief_id)
        .all()
    )
    return {
        "items": [
            {
                "id": r.id,
                "source_name": r.source_name,
                "char_count": r.char_count,
                "chunk_count": int(chunk_counts.get(r.id, 0)),
                "created_at": r.created_at,
            }
            for r in rows
        ]
    }


@router.post(
    "/briefs/{brief_id}/ask",
    response_model=BriefAnswerResponse,
    status_code=status.HTTP_200_OK,
)
def ask_my_brief(
    brief_id: uuid.UUID,
    payload: BriefAskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Answer a question about one of the caller's briefs, with citations."""
    try:
        return brief_rag_service.ask_brief(
            db=db,
            user_id=current_user.id,
            brief_id=brief_id,
            question=payload.question,
        )
    except brief_rag_service.BriefNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except ai_service.QuotaExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)
        ) from exc


@router.post(
    "/fetch-link",
    response_model=LinkFetchResponse,
    status_code=status.HTTP_200_OK,
)
@limiter.limit("20/minute")
def fetch_link(
    request: Request,
    payload: LinkFetchRequest,
    current_user: User = Depends(get_current_user),
):
    """Read a web page and return its text so the student can summarise it.

    The student supplies a link because they found the reading themselves; we
    fetch the CONTENT of it on their behalf. This is the one endpoint that makes
    a server-side request to a user-supplied destination, so it is deliberately
    narrow:

      * the URL is validated and resolved, and private/loopback/link-local
        addresses are refused (SSRF defence, see link_fetch_service),
      * redirects are followed manually so every hop is re-checked,
      * rate limited per client, because it is an outbound request.

    Returns 400 with a student-readable reason when the page cannot be read.
    """
    try:
        return link_fetch_service.fetch_link_text(payload.url)
    except link_fetch_service.LinkFetchError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.post(
    "/summaries/{subject_hash}/signal",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("30/minute")
def record_summary_signal(
    request: Request,
    subject_hash: str,
    payload: SignalRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record a quality signal on a summary the user has already generated.

    `subject_hash` is the same content_hash that ai_summary_caches stores, so
    the signal attaches to an output without any content being duplicated here.

    CONSENT IS REQUIRED. When the user has not consented, the request still
    returns 204 - deliberately. Reporting "we didn't store that" would force
    clients to handle a refusal they cannot act on, and an observability call
    should never surface a failure the user cannot fix. Nothing is written.

    204 because the client is firing a signal and moving on; there is no body
    worth returning.
    """
    if not getattr(current_user, "_has_improvement_consent", False):
        return  # silently accepted, deliberately not stored

    analytics_service.record_signal(
        db=db,
        user_id=current_user.id,
        sample_type="summary",
        subject_hash=subject_hash,
        signal=payload.signal,
        compared_with=payload.compared_with,
    )
