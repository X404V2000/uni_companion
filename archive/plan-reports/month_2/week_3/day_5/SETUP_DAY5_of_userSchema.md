# Day 3.5 Blueprint — Consent Framework Implementation

**To:** Founder (for confirmation) → DeepSeek V4 (for implementation)
**From:** Senior Systems Design & Architecture Engineer
**Date:** 29 September 2026
**Status:** Specification Active
**Branch:** `month2/week3-5-consent-framework` off `develop`
**Baseline:** head `0011` → **head after this day: `0012`**
**Duration:** medium day (one migration, one service, two endpoints, ~15 tests)

---

## §0. Scope

Implement the POPIA-compliant consent framework approved in the previous message. This is the foundation for all future data collection for product improvement.

**Delivers:**

1. Migration `0012` — `user_consents` + `improvement_signals` tables.
2. `ConsentService` — grant / withdraw / current state / auditable history.
3. Analytics gating — `record_event` accepts a `has_consent` argument (no per-event query).
4. `POST /analytics/consent` — toggle consent on/off.
5. `GET /analytics/consent` — read current state + history.
6. `POST /ai/summaries/{subject_hash}/signal` — record a quality signal.
7. Withdrawal cascade — deletes Category B data immediately.
8. POPIA-specific tests (5 mandatory) + signal tests (~5).

**Explicitly not in scope:**

- Frontend (consent screen, settings toggle, thumbs up/down UI)
- Aggregation pipeline (90-day rollup)
- Privacy notice copy
- Any change to Category A data collection (service operation, unchanged)

---

## §1. Technical Objectives

1. **Auditable consent.** Every grant and withdrawal is a row, timestamped, with source and policy version.
2. **No per-event query on hot paths.** Consent is resolved once per request (on `current_user`), not per event.
3. **Immediate deletion on withdrawal.** No grace period. Simpler, more defensible.
4. **Cascade on account deletion.** Existing POPIA hard-purge wipes consent rows and signals too.
5. **Comparison signal from day one.** Schema supports `preferred_over` even if the frontend doesn't surface it yet.
6. **No raw content.** Ever. Category C is enforced by schema design — signal tables have no text columns.

---

## §2. Architectural Strategy

```
┌───────────────────────────────────────────────────────────────────────────┐
│                    CONSENT FRAMEWORK — DATA FLOW                          │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  REQUEST LIFECYCLE                                                        │
│  ─────────────────                                                        │
│                                                                           │
│    Incoming request                                                       │
│         │                                                                 │
│         ▼                                                                 │
│    get_current_user  ──► loads User row                                   │
│         │                                                                 │
│         ├──► ConsentService.has_consent(user.id)   (one read, cached on   │
│         │                                            the user object)     │
│         ▼                                                                 │
│    Endpoint handler                                                       │
│         │                                                                 │
│         ├──► record_event(..., has_consent=user._has_improvement_consent) │
│         │        │                                                        │
│         │        └──► if not has_consent: return early (no write, no      │
│         │             query)                                              │
│         ▼                                                                 │
│    Response                                                               │
│                                                                           │
│  TOTAL ADDED QUERIES PER REQUEST: 1 (amortized)                           │
│  TOTAL ADDED QUERIES ON HOT PATHS: 0                                      │
│                                                                           │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  CONSENT LIFECYCLE                                                        │
│  ─────────────────                                                        │
│                                                                           │
│    Grant       ──► INSERT user_consents (granted=true, source=..., ...)   │
│                    has_consent() → true                                   │
│                                                                           │
│    Withdraw    ──► INSERT user_consents (granted=false, source=..., ...)  │
│                    DELETE usage_events WHERE user_id=?                    │
│                    DELETE improvement_signals WHERE user_id=?             │
│                    has_consent() → false                                  │
│                                                                           │
│    Delete acct ──► existing POPIA hard-purge                              │
│                    + CASCADE deletes user_consents, improvement_signals   │
│                                                                           │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  WHAT'S STORED (NO RAW CONTENT)                                           │
│  ──────────────────────────────                                           │
│                                                                           │
│    user_consents:                                                         │
│      user_id, purpose, granted, policy_version, source, recorded_at       │
│      → No content. No PII beyond user_id. Audit only.                     │
│                                                                           │
│    improvement_signals:                                                   │
│      user_id, sample_type, subject_hash, signal, compared_with, recorded_at│
│      → No content. subject_hash is a SHA-256 hash of an identifier.       │
│      → compared_with is a nullable hash reference (for preference pairs). │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

**Design principle:** The schema cannot store raw content. There are no text columns that could hold it. This is enforcement by structure, not by discipline.

---

## §3. File Implementation Map

| File Path | Action | Purpose |
|---|---|---|
| `alembic/versions/0012_consent_and_signals.py` | **NEW** | Two tables |
| `app/models/analytics.py` | **UPDATED** | `UserConsent`, `ImprovementSignal` |
| `app/services/consent_service.py` | **NEW** | Consent lifecycle logic |
| `app/services/analytics_service.py` | **UPDATED** | Gate `record_event` |
| `app/api/deps.py` | **UPDATED** | Resolve consent on `current_user` |
| `app/api/v1/analytics.py` | **UPDATED** | `POST/GET /analytics/consent` |
| `app/api/v1/ai.py` | **UPDATED** | `POST /ai/summaries/{hash}/signal` |
| `app/schemas/analytics.py` | **UPDATED** | Consent + signal schemas |
| `tests/test_consent_api.py` | **NEW** | Consent lifecycle + gating + cascade |
| `tests/test_improvement_signals_api.py` | **NEW** | Signal shape + comparison |
| `tests/test_migration_chain.py` | **UPDATED** | `EXPECTED_HEAD` → `0012` |
| `plan/MIGRATION_LOG.md` | **UPDATED** | Add `0012` row |
| `docs/openapi.json` | **REGENERATED** | Drift gate |

**No new packages.**

---

## §4. Step-by-Step Developer Guide

### §4.1 Migration `0012`

Create `alembic/versions/0012_consent_and_signals.py`:

```python
"""
POPIA consent framework: user_consents + improvement_signals.

Revision ID: 0012
Revises: 0011

Rationale
---------
Consent must be auditable: a boolean cannot prove when consent was
granted or when it was withdrawn. This migration introduces:

1. user_consents      — append-only audit log of every grant/withdraw
2. improvement_signals — quality signals on AI outputs; NO raw content

Neither table stores user content. See plan/DATA_COLLECTION_FRAMEWORK.md
for the justification of every field.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---------- user_consents ----------
    op.create_table(
        "user_consents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("purpose", sa.String(40), nullable=False),
        sa.Column("granted", sa.Boolean, nullable=False),
        sa.Column("policy_version", sa.String(20), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    # Latest row per (user, purpose) is the current state.
    op.create_index(
        "ix_user_consents_user_purpose_recorded",
        "user_consents",
        ["user_id", "purpose", sa.text("recorded_at DESC")],
    )

    # ---------- improvement_signals ----------
    op.create_table(
        "improvement_signals",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sample_type", sa.String(30), nullable=False),
        sa.Column("subject_hash", sa.String(64), nullable=False),
        sa.Column("signal", sa.String(20), nullable=False),
        sa.Column("compared_with", sa.String(64), nullable=True),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "signal IN ('helpful', 'unhelpful', 'preferred_over')",
            name="ck_improvement_signals_signal_valid",
        ),
        sa.CheckConstraint(
            "(signal = 'preferred_over' AND compared_with IS NOT NULL) "
            "OR (signal != 'preferred_over')",
            name="ck_improvement_signals_preferred_requires_compared_with",
        ),
    )
    op.create_index(
        "ix_improvement_signals_type_recorded",
        "improvement_signals",
        ["sample_type", sa.text("recorded_at DESC")],
    )
    op.create_index(
        "ix_improvement_signals_subject_hash",
        "improvement_signals",
        ["subject_hash"],
    )


def downgrade() -> None:
    op.drop_index("ix_improvement_signals_subject_hash", table_name="improvement_signals")
    op.drop_index("ix_improvement_signals_type_recorded", table_name="improvement_signals")
    op.drop_table("improvement_signals")
    op.drop_index("ix_user_consents_user_purpose_recorded", table_name="user_consents")
    op.drop_table("user_consents")
```

**Why the CHECK constraints:**
- `signal IN (...)` — enforces the enum at the DB level. Prevents typos from breaking later analysis.
- `preferred_over requires compared_with` — the comparison signal is meaningless without a target. Enforce it in the schema so no code path can write an invalid row.

### §4.2 Models (`app/models/analytics.py`)

Add at the bottom of the file:

```python
import uuid
from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID

# ... existing imports at the top of the file ...

class UserConsent(Base):
    """
    Append-only audit log of consent state changes.

    Current state for a (user_id, purpose) is the row with the latest recorded_at.
    History is preserved indefinitely while the user exists.
    """
    __tablename__ = "user_consents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    purpose: Mapped[str] = mapped_column(String(40), nullable=False)
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    policy_version: Mapped[str] = mapped_column(String(20), nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (
        Index(
            "ix_user_consents_user_purpose_recorded",
            "user_id",
            "purpose",
            text("recorded_at DESC"),
        ),
    )


class ImprovementSignal(Base):
    """
    Quality signal on an AI output. NO raw content stored.

    subject_hash  — SHA-256 hash of an identifier (e.g. the content_hash from
                    ai_summary_caches). Never the input text.
    compared_with — nullable; the subject_hash a preferred_over signal was
                    preferred over.
    """
    __tablename__ = "improvement_signals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    sample_type: Mapped[str] = mapped_column(String(30), nullable=False)
    subject_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    signal: Mapped[str] = mapped_column(String(20), nullable=False)
    compared_with: Mapped[str | None] = mapped_column(String(64), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            "signal IN ('helpful', 'unhelpful', 'preferred_over')",
            name="ck_improvement_signals_signal_valid",
        ),
        CheckConstraint(
            "(signal = 'preferred_over' AND compared_with IS NOT NULL) "
            "OR (signal != 'preferred_over')",
            name="ck_improvement_signals_preferred_requires_compared_with",
        ),
        Index(
            "ix_improvement_signals_type_recorded",
            "sample_type",
            text("recorded_at DESC"),
        ),
        Index("ix_improvement_signals_subject_hash", "subject_hash"),
    )
```

**Import to add at the top of the file:** `from sqlalchemy import text` (for the index `text("recorded_at DESC")`).

**Register the models** in `app/models/__init__.py` if the project uses explicit exports.

### §4.3 Consent service (`app/services/consent_service.py`)

Create the file:

```python
"""
app/services/consent_service.py

POPIA consent lifecycle. Grant, withdraw, read current state, read history.

Design notes:
- Current state = latest row per (user_id, purpose).
- Grant and withdraw are both rows (append-only audit).
- Withdrawal additionally deletes the user's Category B data
  (usage_events, improvement_signals) — immediately, no grace period.
"""
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.analytics import ImprovementSignal, UsageEvent, UserConsent

PURPOSE_PRODUCT_IMPROVEMENT = "product_improvement"
CURRENT_POLICY_VERSION = "1.0"


class ConsentError(Exception):
    """Base class for consent-related errors."""


def has_consent(
    db: Session,
    user_id: uuid.UUID,
    purpose: str = PURPOSE_PRODUCT_IMPROVEMENT,
) -> bool:
    """
    Return True if the user's latest consent row for `purpose` has granted=True.

    One indexed lookup. Called once per request (cached on current_user).
    """
    row = (
        db.query(UserConsent)
        .filter(
            UserConsent.user_id == user_id,
            UserConsent.purpose == purpose,
        )
        .order_by(UserConsent.recorded_at.desc())
        .first()
    )
    return bool(row and row.granted)


def current_state(
    db: Session,
    user_id: uuid.UUID,
    purpose: str = PURPOSE_PRODUCT_IMPROVEMENT,
) -> UserConsent | None:
    """Return the latest consent row for (user_id, purpose), or None."""
    return (
        db.query(UserConsent)
        .filter(
            UserConsent.user_id == user_id,
            UserConsent.purpose == purpose,
        )
        .order_by(UserConsent.recorded_at.desc())
        .first()
    )


def history(
    db: Session,
    user_id: uuid.UUID,
    purpose: str = PURPOSE_PRODUCT_IMPROVEMENT,
) -> list[UserConsent]:
    """Return the full consent history for (user_id, purpose), newest first."""
    return (
        db.query(UserConsent)
        .filter(
            UserConsent.user_id == user_id,
            UserConsent.purpose == purpose,
        )
        .order_by(UserConsent.recorded_at.desc())
        .all()
    )


def grant(
    db: Session,
    user_id: uuid.UUID,
    source: str,
    policy_version: str = CURRENT_POLICY_VERSION,
    purpose: str = PURPOSE_PRODUCT_IMPROVEMENT,
) -> UserConsent:
    """Record a consent grant. Idempotent in effect (adds a row each time)."""
    if source not in ("onboarding", "settings"):
        raise ConsentError(f"Invalid consent source: {source!r}")

    row = UserConsent(
        user_id=user_id,
        purpose=purpose,
        granted=True,
        policy_version=policy_version,
        source=source,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def withdraw(
    db: Session,
    user_id: uuid.UUID,
    source: str,
    purpose: str = PURPOSE_PRODUCT_IMPROVEMENT,
) -> UserConsent:
    """
    Record a consent withdrawal AND delete the user's Category B data.

    Deletion is immediate — no grace period. This matches the user's
    expectation when they flip the toggle: data stops being held, not
    just stops growing.
    """
    if source not in ("onboarding", "settings"):
        raise ConsentError(f"Invalid consent source: {source!r}")

    row = UserConsent(
        user_id=user_id,
        purpose=purpose,
        granted=False,
        policy_version=CURRENT_POLICY_VERSION,
        source=source,
    )
    db.add(row)

    # Delete Category B data for this user.
    db.query(UsageEvent).filter(UsageEvent.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(ImprovementSignal).filter(
        ImprovementSignal.user_id == user_id
    ).delete(synchronize_session=False)

    db.commit()
    db.refresh(row)
    return row
```

**Note on transaction boundaries:** `grant` and `withdraw` each commit. If the delete fails during withdrawal, the whole transaction rolls back — the withdrawal isn't recorded and the delete isn't applied. That's the correct behavior: either both happen or neither.

### §4.4 Analytics gating (`app/services/analytics_service.py`)

Two changes:

**Change 1** — `record_event` accepts `has_consent`:

```python
def record_event(
    db: Session,
    user_id: uuid.UUID,
    event_type: str,
    module_code: str | None = None,
    duration_ms: int | None = None,
    has_consent: bool = False,   # NEW — caller passes user._has_improvement_consent
) -> None:
    """
    Best-effort event recording. Never raises.
    Does nothing when the user has not consented to product improvement.
    """
    if not has_consent:
        return

    try:
        db.add(UsageEvent(
            user_id=user_id,
            event_type=event_type,
            module_code=module_code,
            duration_ms=duration_ms,
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.debug("record_event dropped: %s", type(exc).__name__)
```

**Change 2** — all five callers pass the flag from `current_user`. In the routers:

```python
analytics_service.record_event(
    db=db,
    user_id=current_user.id,
    event_type=...,
    has_consent=getattr(current_user, "_has_improvement_consent", False),
)
```

**Why `getattr` with fallback:** if a request path doesn't go through `get_current_user` (e.g., a webhook), the attribute won't exist. Defaulting to False is the safe behavior.

### §4.5 Consent on `current_user` (`app/api/deps.py`)

In the `get_current_user` dependency, after the user is loaded:

```python
# Resolve consent once per request — no per-event query
from app.services.consent_service import has_consent as _has_consent
user._has_improvement_consent = _has_consent(db, user.id)
return user
```

**Performance note:** this adds exactly one query per authenticated request. The alternative (querying inside `record_event`) would add one query per event, and the dashboard alone fires two events. This is the correct trade.

### §4.6 Endpoints

**`app/api/v1/analytics.py`** — add:

```python
from app.schemas.analytics import ConsentRequest, ConsentState, ConsentHistoryEntry
from app.services import consent_service


@router.post("/consent", response_model=ConsentState, status_code=status.HTTP_200_OK)
def update_consent(
    payload: ConsentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Set the user's product-improvement consent state.

    Granting records a new consent row. Withdrawing records the row AND
    deletes the user's Category B data (usage events, improvement signals).
    """
    if payload.granted:
        consent_service.grant(db, user_id=current_user.id, source=payload.source)
    else:
        consent_service.withdraw(db, user_id=current_user.id, source=payload.source)

    state = consent_service.current_state(db, current_user.id)
    return ConsentState(
        granted=state.granted if state else False,
        policy_version=state.policy_version if state else None,
        updated_at=state.recorded_at if state else None,
    )


@router.get("/consent", response_model=ConsentState, status_code=status.HTTP_200_OK)
def get_consent(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Read the current consent state (and history, if needed by client)."""
    state = consent_service.current_state(db, current_user.id)
    return ConsentState(
        granted=state.granted if state else False,
        policy_version=state.policy_version if state else None,
        updated_at=state.recorded_at if state else None,
    )
```

**`app/api/v1/ai.py`** — add:

```python
from app.schemas.analytics import SignalRequest


@router.post(
    "/summaries/{subject_hash}/signal",
    status_code=status.HTTP_204_NO_CONTENT,
)
def record_summary_signal(
    subject_hash: str,
    payload: SignalRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Record a quality signal on an AI summary. Only stored when the user
    has consented to product improvement. Best-effort — never fails the request.
    """
    if not getattr(current_user, "_has_improvement_consent", False):
        return  # silently accept but do not store
    analytics_service.record_signal(
        db=db,
        user_id=current_user.id,
        sample_type="summary",
        subject_hash=subject_hash,
        signal=payload.signal,
        compared_with=payload.compared_with,
    )
```

### §4.7 Schemas (`app/schemas/analytics.py`)

Add:

```python
from typing import Literal
from pydantic import BaseModel, Field, model_validator


class ConsentRequest(BaseModel):
    granted: bool
    source: Literal["onboarding", "settings"]


class ConsentState(BaseModel):
    granted: bool
    policy_version: str | None = None
    updated_at: datetime | None = None


class SignalRequest(BaseModel):
    signal: Literal["helpful", "unhelpful", "preferred_over"]
    compared_with: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def _preferred_requires_compared_with(self):
        if self.signal == "preferred_over" and not self.compared_with:
            raise ValueError("preferred_over requires compared_with")
        return self
```

### §4.8 Tests

**`tests/test_consent_api.py`** — five mandatory POPIA tests:

1. `test_record_event_skipped_without_consent`
2. `test_withdrawal_stops_collection_immediately`
3. `test_withdrawal_deletes_existing_category_b_data`
4. `test_account_deletion_cascades_to_consent_and_signals`
5. `test_consent_history_is_preserved`

Plus:

6. `test_grant_and_withdraw_recorded_with_timestamps`
7. `test_invalid_source_rejected` — 422 on `source="webhook"`
8. `test_consent_default_is_off` — new user has `granted=false`

**`tests/test_improvement_signals_api.py`** — five signal tests:

9. `test_helpful_signal_recorded_when_consented`
10. `test_unhelpful_signal_recorded_when_consented`
11. `test_preferred_over_requires_compared_with` — 422 without it, 204 with it
12. `test_signal_not_recorded_when_consent_off` — silent accept, DB unchanged
13. `test_signal_table_has_no_text_content_columns` — schema assertion (introspect `information_schema.columns`; assert none of the signal table's columns are named `content`, `text`, `body`, or similar)

**Update `tests/test_migration_chain.py`:** `EXPECTED_HEAD = "0012"`.

### §4.9 Migration log

Add a row to `plan/MIGRATION_LOG.md`:

| Revision | down_revision | File | Purpose | Added |
|---|---|---|---|---|
| 0012 | 0011 | `0012_consent_and_signals.py` | user_consents + improvement_signals (POPIA) | 2026-09-29 |

---

## §5. Time/Space Complexity Audit

| Component | Time | Space | Safeguard |
|---|---|---|---|
| Migration `0012` | O(N) users + O(M) events | O(N + M) index storage | One-time |
| `has_consent` | O(log N) | O(1) | Indexed on `(user_id, purpose, recorded_at DESC)` |
| `grant` | O(1) | O(1) | Single insert |
| `withdraw` | O(K) where K = user's events | O(1) | Two indexed deletes on `user_id` |
| `record_event` with consent check | O(1) | O(1) | Early return when consent absent; no query when denied |
| Signal insert | O(1) | O(1) | Single insert |
| Consent read (per request) | O(log N) | O(1) | One lookup, cached on `current_user` |

**Total added cost per authenticated request:** one indexed lookup (~1ms). On the hot paths: zero.

---

## §6. Security & Scale Guarantees

| Guarantee | Mechanism |
|---|---|
| **Audit integrity** | Every grant/withdrawal is an append-only row |
| **No per-event overhead** | Consent resolved once per request |
| **Category B gating** | `record_event` and signal insert both early-return when not consented |
| **Immediate deletion on withdrawal** | Two indexed deletes in the withdrawal transaction |
| **POPIA cascade** | `ondelete=CASCADE` on both new tables |
| **No content storage** | No text columns in either table; the CHECK constraints enforce signal shape |
| **Schema-enforced signal validity** | Two CHECK constraints catch invalid states at the DB level |
| **Pydantic validation** | `SignalRequest` rejects `preferred_over` without `compared_with` |
| **No new packages** | Stdlib only |
| **Idempotent reads** | `GET /consent` doesn't mutate state |

---

## §7. Acceptance Criteria

1. Migration `0012` applies forward cleanly; downgrade reverses; head = `0012`.
2. Consent lifecycle: `grant` records a row; `withdraw` records a row AND deletes Category B data.
3. `has_consent` returns the latest state correctly.
4. `record_event` **writes nothing** when consent is absent (no query, no insert).
5. `record_event` **writes** when consent is present.
6. `POST /analytics/consent` toggles state; `GET /analytics/consent` reads it.
7. Invalid `source` (not `onboarding`/`settings`) → 422.
8. `POST /ai/summaries/{hash}/signal` accepts all three signals; `preferred_over` without `compared_with` → 422.
9. Signal is silently discarded when consent is off (client gets 204, DB unchanged).
10. Account deletion cascades to `user_consents` and `improvement_signals`.
11. Consent history is preserved across grant → withdraw → grant (three rows).
12. Consent resolution adds exactly one query per authenticated request (verify with query logging).
13. No text columns exist in either new table.
14. `docs/openapi.json` regenerated; drift gate `[PASS]`.
15. Full suite no regressions.
16. `ruff check app/ tests/ scripts/` clean.
17. **No new packages.**

---

## §8. Verification Steps

```bash
# 1. Migration
alembic upgrade head           # 0012
alembic current                # 0012 (head)
alembic downgrade -1           # reverses
alembic upgrade head

# 2. New tests
pytest tests/test_consent_api.py -v
pytest tests/test_improvement_signals_api.py -v
pytest tests/test_migration_chain.py -v

# 3. Full suite
pytest -q

# 4. Lint + contract
ruff check app/ tests/ scripts/
python scripts/export_openapi.py
python scripts/check_contract_drift.py     # [PASS]

# 5. Manual smoke
# With consent off, generate a summary, then verify no event was written:
psql "$TEST_DATABASE_URL" -c "SELECT count(*) FROM usage_events WHERE user_id='$USER_ID';"
# With consent on, repeat; count increases.
```

---

## §9. Defect-Discovery Prompts

> Run it, don't just read it.

- **`record_event` still writes when consent is off** → caller didn't pass `has_consent`, or defaulted to True. Grep for `record_event(` and confirm every call passes `has_consent=getattr(current_user, "_has_improvement_consent", False)`.
- **Consent check adds a query per event** → the flag isn't being cached on `current_user`. Verify with `echo`-logging on the SQLAlchemy engine.
- **Withdrawal deletes `user_consents` rows too** → the delete is too broad. Only `usage_events` and `improvement_signals` should be deleted; the withdrawal record is retained.
- **Account deletion orphans `user_consents` rows** → the FK has no `ondelete=CASCADE`. Check the migration.
- **`preferred_over` accepted with `compared_with=None` at the DB level** → the CHECK constraint is missing or misnamed. Query `pg_constraint` to confirm.
- **Signal recorded when consent is off** → the router doesn't check consent before calling `record_signal`. Add the early return.
- **Existing events reappear after withdrawal** → the delete ran in a transaction that was later rolled back. Confirm the withdrawal commits.
- **Migration chain test fails on `EXPECTED_HEAD`** → update to `0012`; this is expected when a new migration lands.

---

## §10. Sign-Off Checklist

- [ ] Migration `0012` created; forward + downgrade clean; head = `0012`
- [ ] `user_consents` table exists with `(user_id, purpose, recorded_at DESC)` index
- [ ] `improvement_signals` table exists with both CHECK constraints
- [ ] `UserConsent` and `ImprovementSignal` models added
- [ ] `consent_service.py` with `has_consent`, `grant`, `withdraw`, `current_state`, `history`
- [ ] `record_event` gated on `has_consent` (default False)
- [ ] `current_user._has_improvement_consent` resolved in `get_current_user`
- [ ] All five `record_event` callers pass the consent flag
- [ ] `POST/GET /analytics/consent` implemented
- [ ] `POST /ai/summaries/{hash}/signal` implemented
- [ ] Schemas added (`ConsentRequest`, `ConsentState`, `SignalRequest`)
- [ ] Five mandatory POPIA tests pass
- [ ] Signal tests pass
- [ ] `test_migration_chain.py::EXPECTED_HEAD` → `0012`
- [ ] `plan/MIGRATION_LOG.md` updated
- [ ] `docs/openapi.json` regenerated; drift gate `[PASS]`
- [ ] Full suite no regressions
- [ ] `ruff check` clean
- [ ] **No new packages**
- [ ] Branch: `month2/week3-5-consent-framework` off `develop`

---

## §11. Optional Bundles

**Bundle (prevent subtle bugs):**

- **§11.1** — A test that counts queries on a dashboard request with consent off vs on. Asserts the delta is zero (consent resolution is amortized, not per-event).
- **§11.2** — A `docs/DATA_COLLECTION_FRAMEWORK.md` file that captures the justification table from the earlier blueprint. This is the artifact you show a Regulator.

**Defer:**

- The aggregation pipeline (90-day rollup + anonymisation)
- The frontend consent screen
- The privacy notice copy

**Recommendation: bundle both.** ~100 lines of documentation + 1 test. Both are cheap and both pay off the moment you need to demonstrate compliance.

---
