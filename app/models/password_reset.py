"""app/models/password_reset.py

PURPOSE
-------
A single-use, expiring credential that lets a locked-out student set a new
password.

WHY THIS EXISTS AT ALL
----------------------
There was no password recovery of any kind. A student who forgot their password
was locked out permanently and had to make a new account, abandoning their
modules and deadlines. That is the worst possible failure for an app whose whole
promise is "you will not be blocked" - and it fails silently, because a locked-out
student simply leaves and never tells you.

WHY THE TOKEN IS ISSUED BY A HUMAN, NOT EMAILED
-----------------------------------------------
Sending an email requires a provider, a verified domain and money. None of that
exists yet. An admin-generated token, handed over directly (WhatsApp, in person,
a QR code) gives the same security property - a one-time secret that only the
right person receives - at zero cost. When email is configured, the same table
and the same validation path are reused; only the delivery changes.

WHY ONLY THE HASH IS STORED
---------------------------
Same reasoning as refresh tokens. An admin hands the raw token to the student
once and never needs it again. If the database leaks, the stored hashes are
useless: a reset token is a credential for an account, and storing it in the
clear would make a backup leak equivalent to a password leak.

WHY `used_at` RATHER THAN DELETE
--------------------------------
A deleted row cannot tell you whether a token was used or simply guessed wrong.
Keeping the row, marked used, makes a replay attempt distinguishable from a bad
token - which matters when the only protection against abuse is an admin's
attention.
"""
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # SHA-256 of the raw token. The raw value is never stored.
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Who issued it, for the audit trail. Nullable: a future self-service flow
    # has no issuing admin.
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (
        # Every validation looks a token up by hash. Unique also guarantees two
        # live tokens can never collide.
        Index("uq_password_reset_token_hash", "token_hash", unique=True),
        # Admin view: the live tokens for one account.
        Index("ix_password_reset_user", "user_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<PasswordResetToken user={self.user_id} used={self.used_at is not None}>"
