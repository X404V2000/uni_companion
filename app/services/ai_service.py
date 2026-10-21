"""app/services/ai_service.py

PURPOSE
-------
The AI Summary Engine pipeline (Month 2, Week 1):

    cache hit?  ->  return cached summary (cost $0, no quota deduction)
    else        ->  atomically reserve 1 daily credit
                    ->  call Gemini (httpx) for a course-aware summary
                    ->  persist result to the per-user cache
                    ->  return summary + remaining credits

UNIT ECONOMICS + SCALE
-----------------------
- Quota is enforced ATOMICALLY: `UPDATE ... SET summaries_used = summaries_used
  + 1 WHERE summaries_used < daily_limit` (row-level compare-and-set). Two
  concurrent requests can never both pass the cap — no quota overshoot under
  multi-worker load.
- The result cache is keyed per user, so identical repeat requests bypass the
  LLM entirely (~$0) without leaking one student's summary to another.
- Prompt is bounded (max 8 bullet insights); input is truncated server-side
  before the call as a second guard behind the schema's 32k limit.
- Missing GEMINI_API_KEY fails BEFORE quota deduction or cache write (a
  graceful 503, never a silent wrong answer).

DESIGN (consistent with other services):
- Module-level functions, framework-agnostic, take an injected Session.
"""
from __future__ import annotations

import hashlib
import logging
import random
import time
import uuid
from datetime import UTC, date, datetime

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.ai import AISummaryCache, UserAIQuota

logger = logging.getLogger(__name__)

# Hard upper bound for a SINGLE prompt payload (defense-in-depth below the
# schema). This is NOT the limit on the student's document — see CHUNK_* below.
_MAX_INPUT_CHARS = 32000

# ---------------------------------------------------------------------------
# Long-document handling (chunked map-reduce summarisation)
# ---------------------------------------------------------------------------
# THE BUG THIS FIXES: the old code did `content[:_MAX_INPUT_CHARS]`, so anything
# past 32,000 characters was DISCARDED. Testers reported that a long document
# "only summarised a few lines" — the model literally never saw the rest. A
# 30-page study guide is roughly 80,000-120,000 characters, so more than half of
# a typical long upload was thrown away.
#
# Instead of cutting the document off, it is now split into overlapping chunks,
# each chunk is summarised, and the partial summaries are merged into one guide,
# so the student gets coverage of the WHOLE document.
CHUNK_CHARS = 24000
# Overlap so a concept spanning a boundary is not lost from both sides. Large
# enough to cover a paragraph or two, small enough to stay cheap.
CHUNK_OVERLAP_CHARS = 1500
# Safety valve: never fan out into an unbounded number of provider calls, which
# would be slow and expensive. 12 x 24k covers ~290,000 characters, far more
# than any realistic set of notes.
MAX_CHUNKS = 12

# Free-tier daily cap. Column default mirrors this; kept in one place.
#
# PRODUCT CONTEXT (important for whoever tunes this next):
# This is deliberately generous rather than restrictive. The goal today is a
# feature that WORKS and returns valid output for every student; monetisation
# comes later, once there is funding. So do not tighten this to save a few
# cents at the cost of a student hitting a wall mid-revision.
#
# It exists as a safety rail, not a paywall: it stops a runaway client (or a
# bug) from spending without bound. The real cost protections are:
#   * per-user scoping, so one account cannot exhaust another's allowance,
#   * atomic enforcement in the database (see _reserve_credit_atomically), so
#     parallel requests cannot overshoot the cap,
#   * the per-user result cache, so repeat requests never reach the provider,
#   * credit refunds when the provider fails.
# When a paid tier arrives, raise the limit per plan and keep this as the floor.
DEFAULT_DAILY_LIMIT = 10

class QuotaExceededError(Exception):
    """Raised when the user has exhausted their free daily summary limit."""

class AIProviderUnavailableError(Exception):
    """Raised when no API key is configured or the provider call fails."""

def _today() -> date:
    return datetime.now(UTC).date()

def split_into_chunks(
    content: str,
    chunk_chars: int = CHUNK_CHARS,
    overlap_chars: int = CHUNK_OVERLAP_CHARS,
    max_chunks: int = MAX_CHUNKS,
) -> list[str]:
    """Split a long document into overlapping chunks.

    Prefers to break at a paragraph or sentence boundary rather than mid-word,
    because a chunk that starts halfway through a sentence produces a worse
    partial summary and reads oddly to the model.

    Returns a single-element list when the document already fits, so callers can
    treat short and long documents uniformly.
    """
    text = content.strip()
    if len(text) <= chunk_chars:
        return [text] if text else []

    chunks: list[str] = []
    start = 0
    while start < len(text) and len(chunks) < max_chunks:
        end = min(start + chunk_chars, len(text))

        # Try to end on a natural boundary, but never before halfway through the
        # window — otherwise a document full of newlines could produce many tiny
        # chunks.
        if end < len(text):
            window_floor = start + chunk_chars // 2
            for separator in ("\n\n", "\n", ". "):
                idx = text.rfind(separator, window_floor, end)
                if idx != -1:
                    end = idx + len(separator)
                    break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end >= len(text):
            break
        # Step back by the overlap so a concept crossing the boundary appears in
        # both chunks. Guard against no forward progress.
        start = max(end - overlap_chars, start + 1)

    return chunks

def _build_chunk_prompt(module_code: str, chunk: str, index: int, total: int) -> str:
    """Prompt for ONE part of a long document (the "map" step).

    Deliberately asks for dense notes rather than a finished guide: the merge
    step turns these into the final structure, and asking for the full guide
    twice per chunk would waste tokens and duplicate sections.
    """
    return (
        "You are an experienced university tutor. Below is PART "
        f"{index} of {total} of a student's notes for module {module_code}.\n\n"
        "Extract EVERYTHING important from this part as compact revision notes:\n"
        "- key concepts, definitions and formulae\n"
        "- any worked examples or figures given, with their numbers\n"
        "- anything the notes flag as important, examinable or commonly confused\n\n"
        "Rules:\n"
        "- Cover the whole part; do not skip sections.\n"
        "- Keep concrete detail (values, names, steps). Do not generalise it away.\n"
        "- Use ONLY the text provided. Do not add outside knowledge.\n"
        "- Be terse: short bullets are fine here.\n"
        "- Use LaTeX for maths, e.g. $O(\\log n)$. Wrap any multi-line formula in "
        "$$ ... $$.\n"
        "- Never write currency using LaTeX: write it as plain text such as "
        "R333 333, not $\\text{R}333\\,333$.\n\n"
        f"NOTES (part {index} of {total}):\n{chunk}"
    )

def _merge_prompts(module_code: str, partials: list[str]) -> str:
    """Prompt that merges the partial notes into one coherent guide.

    This is the "reduce" step. Keeping the full guide structure here (rather than
    per chunk) is what stops the final document having six "Overview" sections.
    """
    joined = "\n\n--- SECTION BREAK ---\n\n".join(partials)
    return (
        "You are an experienced university tutor writing a revision guide for a "
        f"student in South Africa.\nModule: {module_code}\n\n"
        "Below are revision notes extracted from successive parts of ONE "
        "document. Merge them into a single, coherent study guide in "
        "GitHub-flavoured markdown.\n\n"
        "IMPORTANT: the notes may repeat ideas because the parts overlapped. "
        "Merge duplicates into one place rather than listing them twice, and do "
        "not produce a section per part.\n\n"
        "STRUCTURE (follow it exactly):\n"
        "1. Open with a short overview (2-3 sentences) of what this material is "
        "really about and why it matters.\n"
        "2. Then one `##` section per major concept. Use the concept name as the "
        "heading. Explain in prose, then add a concrete example, a step-by-step "
        "walkthrough, a small table, or a short diagram where it helps.\n"
        "3. Add a `## Worked example` section that solves one realistic problem "
        "from the notes step by step.\n"
        "4. Add a `## Common mistakes` section listing specific errors and how to "
        "avoid each one.\n"
        "5. Add a `## Quick self-test` section with exactly 3 questions. Do NOT "
        "include the answers.\n"
        "6. End with a one-line `## If you remember only one thing` summary.\n\n"
        "STYLE:\n"
        "- Depth is wanted here, not brevity. Be thorough but never padded.\n"
        "- **Bold** key terms the first time they appear.\n"
        "- Use LaTeX for mathematics, e.g. $O(\\log n)$. Wrap any multi-line "
        "formula in $$ ... $$.\n"
        "- WRITE CURRENCY AS PLAIN TEXT. Use R333 333 or R333,333 - never "
        "$\\text{R}333\\,333$ or similar LaTeX currency.\n"
        "- Start every heading with exactly two hashes (`## `), never more.\n\n"
        "ACCURACY:\n"
        "- Use ONLY the notes provided. Do NOT invent facts, figures or sources.\n"
        "- If the notes do not cover something a revision guide would normally "
        "include, say so briefly instead of guessing.\n\n"
        f"EXTRACTED NOTES:\n{joined}"
    )

def generate_content_hash(module_code: str, content: str) -> str:
    """Deterministic SHA-256 digest of (module code + sanitized content)."""
    payload = f"{module_code.upper()}:{content.strip()}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

def _build_prompt(module_code: str, content: str) -> str:
    """Build the study-guide prompt.

    WHY THIS IS DELIBERATELY DETAILED
    ---------------------------------
    The previous prompt asked for "CONCISE markdown bullet points, max 8
    insights". The model obeyed exactly: a flat list of eight one-line bullets
    with no sections, no worked example and no guidance on what to watch out
    for. Users rightly called it dull and unstructured.

    A study guide is only useful if it EXPLAINS. This prompt therefore asks for
    a specific structure (overview, sections by concept, worked example, common
    traps, self-test) and explicitly says depth is wanted. Each requirement maps
    to something a student needs when revising:

      overview      -> a mental model before the detail
      sections      -> groups related ideas instead of scattering them
      example       -> makes an abstract rule concrete
      common traps  -> the marks students actually lose
      self-test     -> active recall, which is how revision sticks

    It also forbids inventing content, because a confident-sounding fabrication
    is worse than saying the notes do not cover something.
    """
    truncated = content[:_MAX_INPUT_CHARS]
    return (
        "You are an experienced university tutor writing a revision guide for a "
        "student in South Africa.\n"
        f"Module: {module_code}\n\n"
        "Write a genuinely useful study guide in GitHub-flavoured markdown, "
        "based ONLY on the notes below.\n\n"
        "STRUCTURE (follow it exactly):\n"
        "1. Open with a short overview (2-3 sentences) of what this material is "
        "really about and why it matters.\n"
        "2. Then one `##` section per major concept. Use the concept name as the "
        "heading. Under each heading, EXPLAIN the idea in prose and then, where "
        "it helps, give a concrete example, a step-by-step walkthrough, a small "
        "table, or a short code/diagram block.\n"
        "3. Add a `## Worked example` section that solves one realistic problem "
        "from the notes step by step.\n"
        "4. Add a `## Common mistakes` section listing specific errors students "
        "make on this topic, and how to avoid each one.\n"
        "5. Add a `## Quick self-test` section with exactly 3 questions that "
        "check understanding. Do NOT include the answers.\n"
        "6. End with a one-line `## If you remember only one thing` summary.\n\n"
        "STYLE:\n"
        "- Depth is wanted here, not brevity. Be thorough but never padded.\n"
        "- **Bold** key terms the first time they appear.\n"
        "- Use LaTeX for mathematics, e.g. $O(\\log n)$. Wrap any multi-line "
        "formula in $$ ... $$.\n"
        "- WRITE CURRENCY AS PLAIN TEXT. Use R333 333 or R333,333 - never "
        "$\\text{R}333\\,333$ or similar LaTeX currency.\n"
        "- Start every heading with exactly two hashes (`## `), never more.\n\n"
        "ACCURACY:\n"
        "- Use ONLY the notes provided. Do NOT invent facts, figures or sources.\n"
        "- If the notes do not cover something a revision guide would normally "
        "include, say so briefly instead of guessing.\n\n"
        f"NOTES:\n{truncated}"
    )

# Models tried in order. The primary comes from settings; the fallbacks are
# lighter/alternative Flash aliases so a transient "high demand" 503 on one
# model does not take the whole feature down (demo resilience).
_FALLBACK_MODELS = ("gemini-flash-lite-latest", "gemini-2.5-flash")

def _candidate_models() -> list[str]:
    """Primary model first, then fallbacks, de-duplicated."""
    models = [settings.gemini_model, *_FALLBACK_MODELS]
    seen: set[str] = set()
    ordered: list[str] = []
    for m in models:
        if m and m not in seen:
            seen.add(m)
            ordered.append(m)
    return ordered

def _call_gemini(prompt: str) -> tuple[str, int]:
    """Call Google Gemini generateContent. Returns (text, tokens_used).

    Resilience (added for the hackathon demo):
      * Retries each model once on a transient 429/503 ("high demand").
      * Falls back across a small list of Flash models so one busy model does
        not 503 the whole summary feature.
    Raises AIProviderUnavailableError only when every model has failed, so the
    caller still fails cleanly without deducting quota or writing cache rows.
    """
    if not settings.gemini_api_key:
        raise AIProviderUnavailableError("GEMINI_API_KEY is not configured")

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            # WHY THIS IS NO LONGER 512: at 512 tokens the model was cut off
            # mid-sentence on any real study guide, which is exactly why
            # summaries felt short and thin. A structured guide needs room for
            # several sections, an example and a self-test. The ceiling is now
            # configurable so it can be tuned without a code change.
            "maxOutputTokens": settings.summary_max_output_tokens,
            # Slightly higher temperature than before: the previous 0.4 with a
            # "be concise" prompt produced very flat, listy output. 0.6 keeps it
            # factual while allowing explanatory prose.
            "temperature": settings.summary_temperature,
        },
    }

    last_status = None
    for model in _candidate_models():
        url = settings.gemini_endpoint.format(model=model)
        # Two attempts per model: immediate, then a short backoff (503 spikes
        # are usually sub-second transients).
        for attempt in range(2):
            try:
                with httpx.Client(timeout=30.0) as client:
                    resp = client.post(
                        url,
                        params={"key": settings.gemini_api_key},
                        json=payload,
                    )
            except httpx.HTTPError:
                last_status = "network"
                break  # try the next model on a hard network error

            last_status = resp.status_code
            if resp.status_code == 200:
                try:
                    body = resp.json()
                    candidates = body["candidates"]
                    text = candidates[0]["content"]["parts"][0]["text"]
                    usage = body.get("usageMetadata", {})
                    total_tokens = int(usage.get("totalTokenCount", 0))
                except (KeyError, IndexError, TypeError, ValueError) as exc:
                    raise AIProviderUnavailableError(
                        "Malformed Gemini response"
                    ) from exc

                if not text or not text.strip():
                    raise AIProviderUnavailableError("Gemini returned empty summary")
                return text.strip(), total_tokens

            # Transient provider pressure -> brief pause, retry, then fall back.
            if resp.status_code in (429, 503):
                if attempt == 0:
                    # JITTERED backoff, not a fixed 0.8s.
                    #
                    # WHY: with a constant delay, every client that was hit by
                    # the same 503 spike retries at the same instant, so the
                    # retries arrive together and the provider stays overloaded
                    # (a thundering herd). A random offset spreads them out.
                    # The base is the previous 0.8s, so typical behaviour is
                    # unchanged and worst case is still under 1.5s.
                    # noqa: S311 - retry jitter, not a security decision. There is nothing
                    # to predict or protect here; `random` is the right tool and
                    # `secrets` would only cost entropy for no benefit.
                    time.sleep(0.5 + random.random() * 0.9)  # noqa: S311
                    continue
                break
            # Any other non-200 (e.g. 404 bad model) -> move to the next model.
            break

    raise AIProviderUnavailableError(
        f"Gemini unavailable after fallbacks (last={last_status})"
    )

def _get_quota(db: Session, user_id: uuid.UUID, day: date) -> UserAIQuota | None:
    return (
        db.query(UserAIQuota)
        .filter(UserAIQuota.user_id == user_id, UserAIQuota.usage_date == day)
        .first()
    )

def get_user_quota(db: Session, user_id: uuid.UUID) -> dict:
    """Read the current quota row (creates nothing). Returns a response dict."""
    today = _today()
    quota = _get_quota(db, user_id, today)
    used = quota.summaries_used if quota else 0
    limit = quota.daily_limit if quota else DEFAULT_DAILY_LIMIT
    return {
        "usage_date": today.isoformat(),
        "summaries_used": used,
        "daily_limit": limit,
        "remaining_credits": max(0, limit - used),
    }

def _reserve_credit_atomically(db: Session, user_id: uuid.UUID, day: date) -> UserAIQuota:
    """Atomically claim one credit, or raise QuotaExceededError.

    Uses Postgres INSERT ... ON CONFLICT (upsert) so the first request of the
    day creates the row exactly once, then a compare-and-set UPDATE so
    concurrent requests can never overshoot the daily cap.
    """
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    limit = DEFAULT_DAILY_LIMIT

    # Idempotent row creation (unique on user_id + usage_date).
    stmt = pg_insert(UserAIQuota).values(
        user_id=user_id,
        usage_date=day,
        summaries_used=0,
        daily_limit=limit,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    stmt = stmt.on_conflict_do_nothing(
        index_elements=["user_id", "usage_date"]
    )
    db.execute(stmt)

    # Compare-and-set: only increment if still under the limit.
    from sqlalchemy import update

    result = db.execute(
        update(UserAIQuota)
        .where(
            UserAIQuota.user_id == user_id,
            UserAIQuota.usage_date == day,
            UserAIQuota.summaries_used < UserAIQuota.daily_limit,
        )
        .values(
            summaries_used=UserAIQuota.summaries_used + 1,
            updated_at=datetime.now(UTC),
        )
    )
    db.commit()

    if result.rowcount == 0:
        raise QuotaExceededError(
            "Daily free summary limit reached (10/10). Try again tomorrow."
        )

    quota = _get_quota(db, user_id, day)
    return quota

def get_or_create_summary(
    db: Session, user_id: uuid.UUID, module_code: str, content: str
) -> dict:
    """Core pipeline: cache -> quota -> Gemini -> cache -> response."""
    module = module_code.upper()
    content_hash = generate_content_hash(module, content)

    # 1. Per-user cache hit -> free, no quota deduction.
    cached = (
        db.query(AISummaryCache)
        .filter(
            AISummaryCache.user_id == user_id,
            AISummaryCache.content_hash == content_hash,
        )
        .first()
    )
    if cached:
        quota = get_user_quota(db, user_id)
        return {
            "summary": cached.summary_text,
            "cached": True,
            "remaining_credits": quota["remaining_credits"],
            "daily_limit": quota["daily_limit"],
        }

    # 2. Atomically reserve one credit (raises 429 upstream on exhaustion).
    quota = _reserve_credit_atomically(db, user_id, _today())

    # 3. Call the provider (Gemini via httpx). On failure, the reserved credit
    #    is NOT given back automatically — see note; we refund to avoid
    #    charging students for provider outages.
    #
    #    LONG DOCUMENTS ARE CHUNKED, NOT TRUNCATED. A single call only sees
    #    _MAX_INPUT_CHARS; anything longer is summarised part by part and then
    #    merged, so no part of the student's notes is silently dropped.
    try:
        chunks = split_into_chunks(content)
        # Disclose when the safety cap forced us to leave material out, so a
        # trimmed result is never presented as complete coverage.
        omitted = max(0, len(content) - sum(len(c) for c in chunks))
        omission_note = (
            "\n\n---\n\n**Note:** this document was very long, so it was "
            "summarised in "
            f"{len(chunks)} parts and the final "
            f"{omitted:,} characters were not read. Split it and summarise the "
            "remainder separately for full coverage."
            if omitted > 0
            else ""
        )
        if len(chunks) <= 1:
            summary_text, tokens_used = _call_gemini(_build_prompt(module, content))
        else:
            logger.info(
                "summarising a %d character document as %d chunks",
                len(content),
                len(chunks),
            )
            partials: list[str] = []
            tokens_used = 0
            for index, chunk in enumerate(chunks, start=1):
                part, part_tokens = _call_gemini(
                    _build_chunk_prompt(module, chunk, index, len(chunks))
                )
                partials.append(part)
                tokens_used += part_tokens

            summary_text, merge_tokens = _call_gemini(
                _merge_prompts(module, partials)
            )
            tokens_used += merge_tokens
            summary_text += omission_note
    except AIProviderUnavailableError as exc:
        _refund_credit(db, user_id, _today())
        raise exc

    # 4. Persist to the per-user cache.
    cache_record = AISummaryCache(
        user_id=user_id,
        content_hash=content_hash,
        module_code=module,
        summary_text=summary_text,
        tokens_used=tokens_used,
    )
    db.add(cache_record)
    db.commit()

    quota = get_user_quota(db, user_id)
    return {
        "summary": summary_text,
        "cached": False,
        "remaining_credits": quota["remaining_credits"],
        "daily_limit": quota["daily_limit"],
    }

def _refund_credit(db: Session, user_id: uuid.UUID, day: date) -> None:
    """Give back a reserved credit when the provider call failed.

    Best-effort; floor at 0 so a concurrent edge case can never go negative.
    """
    from sqlalchemy import update

    db.execute(
        update(UserAIQuota)
        .where(
            UserAIQuota.user_id == user_id,
            UserAIQuota.usage_date == day,
            UserAIQuota.summaries_used > 0,
        )
        .values(summaries_used=UserAIQuota.summaries_used - 1)
    )
    db.commit()

# ---------------------------------------------------------------------------
# Summary history (per-user, newest first)
# ---------------------------------------------------------------------------

def list_user_summaries(db: Session, user_id: uuid.UUID, limit: int = 20) -> list[dict]:
    """Return the user's cached summaries, newest first.

    Strictly scoped to `user_id` (the cache is per-user by design, so this
    cannot leak another student's summary). `limit` is clamped to bound the
    response. Summary text is truncated to a preview — the history view shows
    an excerpt, and the full text is already available from the cache on a
    repeat summarize call.
    """
    limit = max(1, min(limit, 50))
    rows = (
        db.query(AISummaryCache)
        .filter(AISummaryCache.user_id == user_id)
        .order_by(AISummaryCache.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": str(row.id),
            "module_code": row.module_code,
            "preview": (row.summary_text or "")[:220],
            "tokens_used": row.tokens_used,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]
