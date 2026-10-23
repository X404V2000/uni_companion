"""app/services/bursary_service.py

PURPOSE
-------
Decide which bursaries a particular student should see, and why.

DESIGN RULES
------------
1. **Framework-agnostic.** No FastAPI import. Takes plain objects and a Session
   where it needs one, so the scoring rules are unit-testable without a server.
2. **Pure where it can be.** `eligible()`, `score()` and `rank()` take a date
   rather than reading the clock, so every test is reproducible and "closing
   today" can be tested at all.
3. **Deterministic.** The same student on the same day always gets the same
   order. Two runs of the demo cannot show a list that reshuffles itself.

EXCLUSION VERSUS DEMOTION
-------------------------
A bursary that has closed, or that the student cannot apply for, is EXCLUDED -
not ranked last. There is no useful place in a student's list for something
they cannot act on. This is the one place the rule differs from material search,
where an off-topic-but-real resource is merely demoted.

WHAT "UNKNOWN" MEANS
--------------------
A field the student has not filled in must never exclude them. Excluding an
incomplete profile produces an empty screen for the very students most likely
to need the feature. Unknown is treated as "no restriction applies" and
contributes no score.
"""
from __future__ import annotations

import logging
from datetime import date

from sqlalchemy.orm import Session

from app.models.bursary import Bursary
from app.models.user import User

logger = logging.getLogger(__name__)

# --- scoring weights --------------------------------------------------------
# These are deliberately products of judgement, not fitted parameters. They are
# small integers a reader can reason about, and the reasons returned alongside
# the score explain each one in the student's terms.
SCORE_FIELD_MATCH = 2
SCORE_INSTITUTION_MATCH = 1
SCORE_LEVEL_MATCH = 1
SCORE_CLOSING_SOON = 1

# A bursary closing within this many days is urgent enough to promote.
CLOSING_SOON_DAYS = 30

# Below this, a bursary is still shown (it is a real, open fund) but it sits
# at the bottom. Only the two hard requirements remove a bursary from the list.
MINIMUM_SCORE_TO_SHOW = 0


# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------

def _terms(value: str | None) -> set[str]:
    """Lower-case word set for loose comparison.

    'Computer Science' and 'computing' must be able to meet somewhere, so both
    sides are reduced to words and compared as sets. This is intentionally the
    same idea as _terms() in material_ingest_service: explainable, no model.
    """
    if not value:
        return set()
    cleaned = "".join(c if c.isalnum() else " " for c in value.lower())
    return {w for w in cleaned.split() if len(w) >= 3}


def _overlaps(user_value: str | None, allowed: list | None) -> bool:
    """True if `user_value` plausibly falls within `allowed`.

    Matching is deliberately generous: 'Computer Science' should match
    'computing' and 'engineering' should match 'Chemical Engineering'. A false
    positive here only adds a reason line; a false negative hides funding the
    student could have had.
    """
    if not user_value or not allowed:
        return False
    user_terms = _terms(user_value)
    if not user_terms:
        return False
    for entry in allowed:
        allowed_terms = _terms(str(entry))
        if not allowed_terms:
            continue
        if user_terms & allowed_terms:
            return True
        # Prefix match covers 'comput*' style families: comput|ing, comput|er.
        for a in allowed_terms:
            for u in user_terms:
                if len(a) >= 4 and len(u) >= 4 and (a.startswith(u[:5]) or u.startswith(a[:5])):
                    return True
    return False


def _study_level(year_of_study: int | None) -> str | None:
    """Map a year to undergraduate/postgraduate.

    Assumption, and it is an assumption: years 1-4 are undergraduate, 5+ is
    postgraduate. South African degrees vary, but every bursary that specifies a
    level also specifies years, so this is a secondary signal and being wrong
    costs at most one point.
    """
    if year_of_study is None:
        return None
    if year_of_study <= 4:
        return "undergraduate"
    return "postgraduate"


def _days_until(closes: date | None, today: date) -> int | None:
    if closes is None:
        return None
    return (closes - today).days


# ---------------------------------------------------------------------------
# Public rules
# ---------------------------------------------------------------------------

def eligible(bursary: Bursary, user: User, today: date) -> bool:
    """Whether this student could apply today.

    Every check here is a HARD requirement. Returning False removes the bursary
    from the list entirely.
    """
    if not bursary.is_active:
        return False

    # Closed is closed. A bursary closing TODAY is still open - the student can
    # still apply in the next few hours, and hiding it would be the final insult
    # of a feature meant to prevent missed deadlines.
    if bursary.application_closes is not None and bursary.application_closes < today:
        return False

    year = user.year_of_study
    if year is not None:
        if bursary.min_year is not None and year < bursary.min_year:
            return False
        if bursary.max_year is not None and year > bursary.max_year:
            return False

    return True


def score(bursary: Bursary, user: User, today: date) -> tuple[int, list[str]]:
    """Score a bursary for this student, with a human-readable reason per point.

    The reasons are the feature. A list with no explanation is a magic box; a
    student who reads "matches your field and closes in 12 days" believes the
    recommendation and acts on it.
    """
    total = 0
    reasons: list[str] = []

    # --- field of study -----------------------------------------------------
    if _overlaps(user.field_of_study, bursary.fields_of_study):
        total += SCORE_FIELD_MATCH
        reasons.append(f"For {user.field_of_study} students")

    # --- institution --------------------------------------------------------
    if _overlaps(user.university, bursary.institutions):
        total += SCORE_INSTITUTION_MATCH
        reasons.append(f"Open to {user.university} students")

    # --- level --------------------------------------------------------------
    level = _study_level(user.year_of_study)
    if level and bursary.levels and level in [str(x).lower() for x in bursary.levels]:
        total += SCORE_LEVEL_MATCH
        reasons.append(f"For {level} students")

    # --- urgency ------------------------------------------------------------
    days = _days_until(bursary.application_closes, today)
    if days is not None and 0 <= days <= CLOSING_SOON_DAYS:
        total += SCORE_CLOSING_SOON
        if days == 0:
            reasons.append("Closes today")
        elif days == 1:
            reasons.append("Closes tomorrow")
        else:
            reasons.append(f"Closes in {days} days")

    # Never leave a shown bursary with no explanation at all.
    if not reasons:
        reasons.append("Open to all students")

    return total, reasons


def rank(
    bursaries: list[Bursary], user: User, today: date
) -> list[tuple[Bursary, int, list[str]]]:
    """Exclude what cannot apply, then order the rest best-first.

    Order: score DESC, then closing date ASC (soonest first), then name ASC.
    The final name key only exists so the order is total and stable.
    """

    scored: list[tuple[Bursary, int, list[str]]] = []
    for bursary in bursaries:
        if not eligible(bursary, user, today):
            continue
        value, reasons = score(bursary, user, today)
        if value < MINIMUM_SCORE_TO_SHOW:
            continue
        scored.append((bursary, value, reasons))

    # One explicit key, no cleverness. Sorting with `reverse=True` would also
    # reverse the date, which would put the soonest deadline LAST - the exact
    # opposite of what a student wants. So the score is negated and the date is
    # left ascending, in a single pass.
    scored.sort(
        key=lambda item: (
            -item[1],
            # Bursaries with no closing date sort after dated ones at equal
            # score: a known deadline is more actionable than an unknown one.
            item[0].application_closes.toordinal()
            if item[0].application_closes
            else date.max.toordinal(),
            item[0].name,
        )
    )
    return scored


def matches_for_user(
    db: Session, user: User, today: date | None = None, limit: int = 50
) -> list[tuple[Bursary, int, list[str]]]:
    """Load every active bursary and rank it for this student.

    The whole active set is loaded on purpose: it is a few dozen rows, and
    ranking in Python keeps the rules readable and identical to what the tests
    exercise. Pushing the rules into SQL would make the demo faster and the
    behaviour harder to trust.
    """
    today = today or date.today()
    candidates = db.query(Bursary).filter(Bursary.is_active.is_(True)).all()
    ranked = rank(candidates, user, today)
    logger.info(
        "bursary match: %d active, %d eligible after exclusions",
        len(candidates),
        len(ranked),
    )
    return ranked[:limit]
