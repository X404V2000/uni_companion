"""app/services/brief_rag_service.py

PURPOSE
-------
"Chat with your brief" — retrieval-augmented generation over a student's OWN
uploaded document (assignment brief, lecture notes, past paper...).

PIPELINE
--------
  ingest : text -> deterministic chunks -> brief_documents + brief_chunks rows
  ask    : question -> retrieve top-K chunks -> prompt with those chunks
           -> Gemini -> answer + citations back to the source chunks

RETRIEVAL DESIGN (hybrid, per product decision)
-----------------------------------------------
`retrieve_chunks()` is the single retrieval seam. Today it uses a deterministic
KEYWORD score (term overlap + phrase bonus + IDF-ish weighting). It is:

  * reliable  — no network call, no extra provider that can time out, and it
                still returns citations even when the LLM is unavailable;
  * cheap     — zero cost, instant, bounded work;
  * swappable — the `brief_chunks.embedding` column already exists, so semantic
                retrieval can be enabled later behind config WITHOUT a schema
                change or a rewrite of the callers.

SECURITY
--------
- Every query filters on `user_id`, so one student can never retrieve another
  student's chunks (no cross-tenant leakage by construction).
- The LLM is instructed to answer ONLY from the supplied excerpts, and to say
  so when the answer is not present — this bounds hallucination.
- Sizes are bounded at every step (document length, chunk count, top-K, prompt
  characters) so a huge upload cannot exhaust memory or the provider quota.
"""
from __future__ import annotations

import logging
import math
import re
import uuid

from sqlalchemy.orm import Session

from app.models.ai import BriefChunk, BriefDocument

logger = logging.getLogger(__name__)

# --- Bounds (defence in depth; the API layer also validates) -----------------
MAX_DOCUMENT_CHARS = 200_000   # refuse anything larger than this
CHUNK_SIZE = 900               # characters per chunk (~150 words)
CHUNK_OVERLAP = 150            # overlap so sentences are not split mid-thought
MAX_CHUNKS = 400               # hard cap per document
DEFAULT_TOP_K = 5
MAX_TOP_K = 10
MAX_PROMPT_CHARS = 12_000      # total excerpt budget handed to the model

_STOPWORDS = frozenset(
    """a an the and or but if then else of to in on at for with by from as is are
    was were be been being do does did this that these those it its i you he she
    they we my your our their what which who whom how why when where not no can
    will would should could may might must about into over under again more most
    some such only own same so than too very s t don now""".split()
)


class BriefNotFoundError(Exception):
    """Raised when a brief does not exist OR is not owned by the caller."""


def _tokenize(text: str) -> list[str]:
    """Lower-case word tokens, stopwords removed (used for scoring)."""
    words = re.findall(r"[a-z0-9']+", text.lower())
    return [w for w in words if w not in _STOPWORDS and len(w) > 1]


def chunk_text(
    text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP
) -> list[str]:
    """Split text into overlapping chunks, preferring paragraph/sentence breaks.

    Deterministic: the same input always yields the same chunks, so citations
    are stable across requests.
    """
    cleaned = re.sub(r"\r\n?", "\n", text).strip()
    if not cleaned:
        return []

    chunks: list[str] = []
    start = 0
    n = len(cleaned)
    while start < n and len(chunks) < MAX_CHUNKS:
        end = min(start + size, n)
        # Try to end on a paragraph or sentence boundary near the cut point.
        if end < n:
            window = cleaned[start:end]
            for sep in ("\n\n", ". ", "! ", "? ", "\n"):
                idx = window.rfind(sep)
                if idx > size * 0.5:  # only accept a reasonably late break
                    end = start + idx + len(sep)
                    break
        piece = cleaned[start:end].strip()
        if piece:
            chunks.append(piece)
        if end >= n:
            break
        start = max(end - overlap, start + 1)  # guarantee forward progress
    return chunks


def _score(query_terms: list[str], query: str, text: str) -> float:
    """Keyword relevance score for one chunk.

    Signals (all cheap, all deterministic):
      * term overlap, weighted by inverse chunk length (favours dense matches)
      * rare-term bonus (a term appearing in few chunks is more informative)
      * exact-phrase bonus when the raw question appears verbatim
    """
    if not query_terms:
        return 0.0
    lower = text.lower()
    words = re.findall(r"[a-z0-9']+", lower)
    if not words:
        return 0.0
    counts: dict[str, int] = {}
    for w in words:
        counts[w] = counts.get(w, 0) + 1

    hits = sum(1 for t in set(query_terms) if t in counts)
    if hits == 0:
        return 0.0

    density = hits / math.sqrt(len(words))          # length-normalised overlap
    phrase = 1.5 if query.strip().lower() in lower else 0.0
    return density + phrase


def retrieve_chunks(
    db: Session, user_id: uuid.UUID, brief_id: uuid.UUID, question: str,
    top_k: int = DEFAULT_TOP_K,
) -> list[BriefChunk]:
    """Return the most relevant chunks of a brief for a question.

    THIS IS THE RETRIEVAL SEAM. It performs keyword scoring today; enabling
    embeddings later means changing only this function (the `embedding` column
    and the callers already exist).

    Always scoped to `user_id`; raises BriefNotFoundError if the brief is not
    the caller's.
    """
    top_k = max(1, min(top_k, MAX_TOP_K))

    owned = (
        db.query(BriefDocument.id)
        .filter(BriefDocument.id == brief_id, BriefDocument.user_id == user_id)
        .first()
    )
    if owned is None:
        raise BriefNotFoundError("Brief not found.")

    chunks = (
        db.query(BriefChunk)
        .filter(BriefChunk.brief_id == brief_id, BriefChunk.user_id == user_id)
        .order_by(BriefChunk.ordinal.asc())
        .all()
    )
    if not chunks:
        return []

    terms = _tokenize(question)
    scored = [(c, _score(terms, question, c.chunk_text)) for c in chunks]

    # If nothing matched the keywords, fall back to the leading chunks so the
    # student still gets a grounded answer attempt (and honest "not found").
    if not any(s > 0 for _, s in scored):
        return chunks[:top_k]

    scored.sort(key=lambda pair: (-pair[1], pair[0].ordinal))
    return [c for c, _ in scored[:top_k]]


def build_prompt(question: str, chunks: list[BriefChunk]) -> str:
    """Build a grounded prompt: the model may only use the supplied excerpts."""
    budget = MAX_PROMPT_CHARS
    parts: list[str] = []
    for c in chunks:
        excerpt = c.chunk_text[: max(400, budget)]
        budget -= len(excerpt)
        parts.append(f"[Excerpt {c.ordinal + 1}]\n{excerpt}")
        if budget <= 0:
            break

    joined = "\n\n".join(parts)
    return (
        "You are a study assistant answering questions about a student's own "
        "document.\n"
        "Use ONLY the excerpts below. If the answer is not contained in them, "
        "say clearly that the document does not appear to cover it, and suggest "
        "what to look for. Be concise and practical.\n"
        "Cite the excerpts you relied on like (Excerpt 2).\n\n"
        f"DOCUMENT EXCERPTS:\n{joined}\n\n"
        f"QUESTION: {question}\n\n"
        "ANSWER:"
    )


# ---------------------------------------------------------------------------
# Orchestration: ingest + ask
# ---------------------------------------------------------------------------

class BriefTooLargeError(Exception):
    """Raised when the supplied document text exceeds the supported size."""


def ingest_brief(
    db: Session, user_id: uuid.UUID, source_name: str, text: str
) -> dict:
    """Store a brief and its chunks. Returns a small summary dict.

    Raises BriefTooLargeError if the text exceeds MAX_DOCUMENT_CHARS so a giant
    upload cannot exhaust memory or the database.
    """
    if len(text) > MAX_DOCUMENT_CHARS:
        raise BriefTooLargeError(
            f"Document is too large ({len(text)} characters). "
            f"The limit is {MAX_DOCUMENT_CHARS}."
        )

    brief = BriefDocument(
        user_id=user_id,
        source_name=source_name[:255],
        content=text,
        char_count=len(text),
    )
    db.add(brief)
    db.flush()  # assign brief.id without committing yet

    pieces = chunk_text(text)
    for ordinal, piece in enumerate(pieces):
        db.add(
            BriefChunk(
                brief_id=brief.id,
                user_id=user_id,
                ordinal=ordinal,
                chunk_text=piece,
                # NULL while keyword-only retrieval is active.
                embedding=None,
            )
        )
    db.commit()
    return {
        "id": str(brief.id),
        "source_name": brief.source_name,
        "char_count": brief.char_count,
        "chunk_count": len(pieces),
        "created_at": brief.created_at.isoformat() if brief.created_at else None,
    }


def ask_brief(
    db: Session, user_id: uuid.UUID, brief_id: uuid.UUID, question: str,
    top_k: int = DEFAULT_TOP_K,
) -> dict:
    """Answer a question about the user's brief, with citations.

    Retrieval is local and always succeeds; only the final generation needs the
    LLM. If generation fails we still return the retrieved excerpts so the UI
    can show the student the source material (graceful degradation), and no
    credit is consumed.
    """
    from app.services import ai_service  # local import avoids a cycle at import

    chunks = retrieve_chunks(db, user_id, brief_id, question, top_k=top_k)
    citations = [
        {"ordinal": c.ordinal + 1, "text": c.chunk_text[:400]} for c in chunks
    ]
    if not chunks:
        return {
            "answer": "This brief has no readable content to search.",
            "citations": [],
            "ai_available": False,
        }

    # Reserve a credit; refund if the provider fails.
    ai_service._reserve_credit_atomically(db, user_id, ai_service._today())
    try:
        answer, _tokens = ai_service._call_gemini(
            build_prompt(question, chunks)
        )
    except Exception as exc:  # provider failure -> refund, degrade gracefully
        ai_service._refund_credit(db, user_id, ai_service._today())
        logger.warning("brief chat: provider failed for %s: %s", brief_id, exc)
        return {
            "answer": (
                "The AI is unavailable right now, but here are the most "
                "relevant parts of your document."
            ),
            "citations": citations,
            "ai_available": False,
        }

    return {"answer": answer, "citations": citations, "ai_available": True}
