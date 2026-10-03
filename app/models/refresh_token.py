"""
models/refresh_token.py

PURPOSE
-------
The refresh_tokens table: the long-lived half of the two-token session.

WHY THIS EXISTS
---------------
Every student was being logged out every 15 minutes. `jwt_access_token_expire_minutes`
is 15, there was no refresh mechanism, and `jwt_refresh_token_expire_days` sat in
config.py unused - someone intended this feature and it was never built. On a phone,
where retyping a strong password is painful and often happens on mobile data, four
logouts an hour is the failure the product exists to prevent.

WHY NOT JUST MAKE THE ACCESS TOKEN LONGER
-----------------------------------------
Because a JWT is stateless: it cannot be revoked before it expires. A 24-hour token
means a stolen or lost phone keeps a valid session for a day with no way to kill it.
This app holds a student's email, module list and academic schedule, which is
sensitive under POPIA. Short access token + revocable refresh token is the correct
shape, and the config already anticipated it.

WHY THE TOKEN IS OPAQUE AND NOT A JWT
-------------------------------------
A JWT refresh token would have the same problem the access token has: it cannot be
revoked. An opaque 256-bit random string can be, because we store a hash of it and
can therefore mark it revoked, expire it, and detect replay. That is the whole point
of the design.

WHY ONLY THE HASH IS STORED
---------------------------
If the database leaks, the attacker gets hashes, not usable tokens. This is the same
reasoning as password hashing. A SHA-256 (not bcrypt) is correct here because the
input is 256 bits of cryptographic randomness - there is no dictionary to attack, so
a slow hash buys nothing and would cost latency on every refresh.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


def _utcnow() -> datetime:
    """Timezone-aware now. Naive datetimes are a bug waiting to happen."""
    return datetime.now(UTC)


class RefreshToken(Base):
    """
    One issued refresh token. Rows are never edited in place except to record
    rotation (`replaced_by`), last use, and revocation - and the append-only
    history is what makes replay detection possible.
    """

    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    ## CASCADE is not optional. The POPIA guarantee is that deleting an account
    ## removes that student's data; a refresh token is a live credential for that
    ## account, so it must go with it. Without this, a deleted student's tokens
    ## would remain valid until they expired - a session surviving its own
    ## account deletion.
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    ## SHA-256 hex of the opaque token. The token itself is NEVER stored, and is
    ## never logged. Lookup on every refresh, so it must be unique and indexed.
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    ## Set when the token is deliberately invalidated: logout, reuse detection, or
    ## sign-out-all-devices. A revoked token is refused even if unexpired.
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    ## Updated on each successful rotation. Useful for spotting a dormant session
    ## and for showing "last active" in a future device list.
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    ## ROTATION AND REUSE DETECTION
    ## ---------------------------
    ## On refresh, the presented token is consumed and a new one issued; this
    ## column records which token replaced it, forming a chain.
    ##
    ## If a token that already has `replaced_by` set is presented AGAIN, it has
    ## been replayed: either it was stolen, or a client bug double-fired. The
    ## correct response is to revoke the whole chain and force a fresh login,
    ## because we cannot tell which holder is the legitimate one. That is the
    ## standard OAuth rotation pattern, and it is what makes a stolen refresh
    ## token recoverable rather than silently usable for its full lifetime.
    replaced_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("refresh_tokens.id", ondelete="SET NULL"),
        nullable=True,
    )

    ## Optional device label, so a future "signed-in devices" screen can say
    ## something more useful than a UUID. Nullable and unused by the refresh path.
    device_hint: Mapped[str | None] = mapped_column(String(120), nullable=True)

    __table_args__ = (
        ## Sign-out-all-devices, and the cascade on account deletion: both filter
        ## by user_id and would otherwise be a sequential scan.
        Index("ix_refresh_tokens_user_id", "user_id"),
        ## Finding a user's live tokens without scanning revoked/expired rows.
        Index("ix_refresh_tokens_user_active", "user_id", "revoked_at"),
    )

    def is_usable(self, now: datetime | None = None) -> bool:
        """
        True when this token may still be exchanged.

        Deliberately a method rather than three inline checks at the call site, so
        "usable" has exactly one definition. Expiry and revocation must BOTH be
        absent - checking only one is the classic mistake here.
        """
        moment = now or _utcnow()
        if self.revoked_at is not None:
            return False
        # Compare in UTC. A naive `expires_at` from a driver would raise on
        # comparison with an aware datetime, which is why the column is
        # TIMESTAMPTZ and the default is aware.
        return self.expires_at > moment
