"""POPIA consent framework: user_consents + improvement_signals

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-29

WHY THIS EXISTS
---------------
Consent must be PROVABLE, not merely stored. A boolean column records the
current state but not the history, so a user who toggles on -> off -> on shows
`true` with no evidence the withdrawal ever happened. Under POPIA you may have
to demonstrate that consent was obtained and that a withdrawal was honoured, so
both events are recorded as append-only rows.

WHAT WAS DELIBERATELY LEFT OUT
------------------------------
Neither table has a column that could hold user content. That is enforcement by
structure rather than by discipline: there is simply nowhere for a lecture note
to go. Storing raw student content for model training is the highest-risk and
lowest-marginal-value data we could collect, and it is not needed - the useful
signal is WHICH output was preferred, not what the output said.

The consequence is intentional and documented: `ai_summary_caches` keeps only a
HASH of the AI input, so there is no (input, output) training pair. That gap is
correct under this framework. Anyone tempted to "fix" it by storing the input
should read plan/DATA_COLLECTION_FRAMEWORK.md first.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # user_consents — append-only audit log of consent state changes
    # ------------------------------------------------------------------
    op.create_table(
        "user_consents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Extensible: 'product_improvement' today; a future purpose gets its
        # own series without a schema change.
        sa.Column("purpose", sa.String(40), nullable=False),
        # True = granted, False = withdrawn. Both are stored as rows so the
        # full sequence is preserved.
        sa.Column("granted", sa.Boolean, nullable=False),
        # Which privacy-notice text the user actually saw. If the text
        # changes, old consents remain attributable to the version agreed to.
        sa.Column("policy_version", sa.String(20), nullable=False),
        # 'onboarding' or 'settings' — where the decision was made.
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "source IN ('onboarding', 'settings')",
            name="ck_user_consents_source_valid",
        ),
    )
    # Current state = latest row per (user, purpose). DESC on recorded_at makes
    # that a first-row read rather than a sort of the whole history.
    op.create_index(
        "ix_user_consents_user_purpose_recorded",
        "user_consents",
        ["user_id", "purpose", sa.text("recorded_at DESC")],
    )

    # ------------------------------------------------------------------
    # improvement_signals — quality signals on AI output; NO content
    # ------------------------------------------------------------------
    op.create_table(
        "improvement_signals",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # 'summary' today; 'recommendation' / 'brief_qa' later.
        sa.Column("sample_type", sa.String(30), nullable=False),
        # SHA-256 of an identifier (e.g. ai_summary_caches.content_hash).
        # Never the input text itself.
        sa.Column("subject_hash", sa.String(64), nullable=False),
        sa.Column("signal", sa.String(20), nullable=False),
        # Only populated for a preference pair: the subject_hash this one was
        # preferred over. This is the signal that actually improves a prompt -
        # "A beat B" is far more useful than "A was fine".
        sa.Column("compared_with", sa.String(64), nullable=True),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        # Enforced in the database, not only in Pydantic, so no code path
        # (including a future script or manual fix) can write a typo'd signal
        # that would silently break later analysis.
        sa.CheckConstraint(
            "signal IN ('helpful', 'unhelpful', 'preferred_over')",
            name="ck_improvement_signals_signal_valid",
        ),
        # A preference with nothing to prefer over carries no information, so
        # the invalid state is rejected at the schema level.
        sa.CheckConstraint(
            "(signal = 'preferred_over' AND compared_with IS NOT NULL) "
            "OR (signal <> 'preferred_over')",
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
    op.drop_index(
        "ix_improvement_signals_subject_hash", table_name="improvement_signals"
    )
    op.drop_index(
        "ix_improvement_signals_type_recorded", table_name="improvement_signals"
    )
    op.drop_table("improvement_signals")
    op.drop_index(
        "ix_user_consents_user_purpose_recorded", table_name="user_consents"
    )
    op.drop_table("user_consents")
