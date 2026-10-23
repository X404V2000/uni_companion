"""app/schemas/bursary.py

Pydantic shapes for the bursary feature.

WHY `days_left` IS IN THE PAYLOAD
---------------------------------
The client could subtract dates itself, but it would do so using the DEVICE
clock, which may be wrong, in a different timezone, or deliberately changed. The
server computes it once, from the same `today` the matching rules used, so the
number the student reads ("closes in 12 days") always agrees with the reason it
was ranked by. Two clocks, two answers, is a bug waiting to be reported.
"""
import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

StudyLevel = Literal["undergraduate", "postgraduate"]


class BursaryMatch(BaseModel):
    """One bursary, as the student sees it.

    Deliberately flat. The student-facing fields only - the matching columns
    (`min_year`, `institutions`, ...) are rules the server applied, not
    information the student needs.
    """

    id: uuid.UUID
    name: str
    provider: str
    description: str
    # The OFFICIAL application page. The client opens this in a new tab.
    url: str

    closes_on: date | None = None
    opens_on: date | None = None
    # Null when the bursary publishes no closing date. The UI must say "rolling"
    # rather than inventing one.
    days_left: int | None = None

    score: int = 0
    # Why this bursary is in the list, in the student's words. Never empty: a
    # recommendation with no reason is a magic box and gets ignored.
    match_reasons: list[str] = Field(default_factory=list)


class BursaryPage(BaseModel):
    """Envelope matching PaginatedResponse so clients parse one way everywhere."""

    items: list[BursaryMatch]
    total: int
