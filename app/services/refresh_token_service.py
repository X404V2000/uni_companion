"""
services/refresh_token_service.py

PURPOSE
-------
Issue, rotate, and revoke refresh tokens. This is the backend half of the fix for
"every student is logged out every 15 minutes".

THE SHAPE OF THE PROBLEM
------------------------
An access token is a stateless JWT. It cannot be revoked, so it must be short-lived
(15 minutes here). That is correct for security and hostile to students, who then
have to re-authenticate four times an hour. The standard resolution is a second,
long-lived credential that CAN be revoked - and the only way to make one revocable
is to store server-side state, which is what this module manages.

THE THREE THINGS THIS MUST GET RIGHT
------------------------------------
1. ROTATION. Every refresh consumes the presented token and issues a new one.
   A refresh token is single-use. This bounds the damage from a stolen token to a
   single use, and gives us a signal when one is replayed.

2. REUSE DETECTION. If a token that was already consumed is presented again, either
   it was stolen or a client double-fired. We cannot tell which, so the safe
   response is to revoke the whole chain and force a fresh login. Without this, a
   stolen token is silently usable for its full lifetime - which is the whole
   reason for choosing an opaque token over a JWT.

3. CASCADE ON ACCOUNT DELETION. The FK is ON DELETE CASCADE so a deleted student's
   sessions die with the account. That is a POPIA guarantee, not a convenience.

WHY HASHING WITH SHA-256 IS CORRECT HERE
----------------------------------------
The input is 256 bits from `secrets.token_urlsafe`, so there is no dictionary and no
brute force. A slow hash (bcrypt) would add latency to every refresh and buy
nothing. This is deliberately different from password hashing, where the input is
low-entropy and a slow hash is essential.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.refresh_token import RefreshToken

## 32 bytes = 256 bits of entropy, url-safe so it survives headers, cookies and JSON
## without escaping. This is the same construction used for password-reset tokens.
_TOKEN_BYTES = 32


class RefreshTokenError(Exception):
    """Base class so callers can catch the family, not each member."""


class InvalidRefreshTokenError(RefreshTokenError):
    """Unknown, expired, or revoked. The caller maps this to 401."""


class RefreshTokenReuseError(RefreshTokenError):
    """
    A already-consumed token was presented again.

    Distinct from InvalidRefreshTokenError because it is a security EVENT, not just
    a failed lookup - the whole chain has been revoked as a result, and a caller may
    want to log or alert on it.
    """


def _hash_token(raw_token: str) -> str:
    """
    SHA-256 hex digest of the opaque token.

    Plain SHA-256, not HMAC and not bcrypt: the token is already 256 bits of
    randomness, so there is nothing to slow down. The hash exists so a database
    leak does not hand over usable sessions.
    """
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _utcnow() -> datetime:
    return datetime.now(UTC)


def issue_refresh_token(
    db: Session,
    user_id: uuid.UUID,
    device_hint: str | None = None,
) -> str:
    """
    Create a new refresh token for a user and return the RAW token.

    The raw value is returned exactly once, here, and never stored. If the caller
    loses it, the only remedy is a new login - which is the correct property for a
    credential we cannot read back.

    Callers must commit. This deliberately does not commit, so that login can issue
    a refresh token in the same transaction as whatever else it is doing.
    """
    raw_token = secrets.token_urlsafe(_TOKEN_BYTES)
    expires_at = _utcnow() + timedelta(days=settings.jwt_refresh_token_expire_days)

    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=_hash_token(raw_token),
            expires_at=expires_at,
            device_hint=(device_hint or None),
        )
    )
    return raw_token


def _revoke_chain(db: Session, token: RefreshToken) -> int:
    """
    Revoke a token and everything in its rotation chain, both directions.

    Walks backwards through `replaced_by` to the chain's origin, then forwards to
    the tip, revoking as it goes. Both directions are needed: an attacker holds a
    LATER token than the one they replayed, so revoking only the presented token
    and its ancestors would leave the stolen descendant alive.

    Returns the number of rows revoked, which the caller can log.

    CHAIN INTEGRITY ASSUMPTION
    --------------------------
    The forward walk depends on `replaced_by` pointers being intact. Deleting a row
    in the middle of a chain nulls its descendants' pointers (ON DELETE SET NULL)
    and silently makes them unreachable - a replay would then revoke nothing. See
    `purge_expired` for the guard that prevents this; do not add a bulk delete of
    refresh tokens anywhere else without reading it first.
    """
    now = _utcnow()
    seen: set[uuid.UUID] = set()
    revoked = 0

    # Walk back to the origin.
    current: RefreshToken | None = token
    while current is not None and current.id not in seen:
        seen.add(current.id)
        if current.revoked_at is None:
            current.revoked_at = now
            revoked += 1
        if current.replaced_by is None:
            current = None
        else:
            current = (
                db.query(RefreshToken)
                .filter(RefreshToken.id == current.replaced_by)
                .one_or_none()
            )

    # Walk forward to the tip. `replaced_by` is a forward pointer, so descendants
    # are found by querying for rows that were replaced BY something in `seen`.
    frontier = set(seen)
    while frontier:
        children = (
            db.query(RefreshToken)
            .filter(RefreshToken.replaced_by.in_(frontier))
            .all()
        )
        frontier = set()
        for child in children:
            if child.id in seen:
                continue
            seen.add(child.id)
            if child.revoked_at is None:
                child.revoked_at = now
                revoked += 1
            frontier.add(child.id)

    return revoked


def rotate_refresh_token(
    db: Session,
    raw_token: str,
    device_hint: str | None = None,
) -> tuple[str, uuid.UUID]:
    """
    Exchange a refresh token for a new one. Returns (new_raw_token, user_id).

    This is the single-most security-sensitive function in the auth flow, so the
    order of operations matters and is deliberate:

      1. Look the token up by hash. An unknown hash is a plain 401.
      2. If it was already consumed (`replaced_by` set) -> REUSE. Revoke the chain
         and raise. This check must come BEFORE the expiry check, because a replayed
         token is a security event regardless of whether it is still in date.
      3. If revoked or expired -> 401.
      4. Otherwise consume it (set replaced_by to the new token), stamp last_used,
         and issue the replacement.

    Raises InvalidRefreshTokenError or RefreshTokenReuseError; the API layer maps
    both to 401 so a caller cannot distinguish them by response, but the reuse case
    is separately catchable for logging.
    """
    token_hash = _hash_token(raw_token)
    token = (
        db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).one_or_none()
    )

    if token is None:
        raise InvalidRefreshTokenError("Unknown refresh token.")

    ## Checked BEFORE expiry/revocation, on purpose. A consumed token being
    ## presented is evidence of theft; that matters whether or not it is in date.
    if token.replaced_by is not None:
        _revoke_chain(db, token)
        db.commit()
        raise RefreshTokenReuseError(
            "Refresh token was already used. All sessions for this account have "
            "been revoked as a precaution."
        )

    if not token.is_usable():
        raise InvalidRefreshTokenError("Refresh token is expired or revoked.")

    ## Issue the replacement first, so the old row can point at its successor.
    new_raw = secrets.token_urlsafe(_TOKEN_BYTES)
    replacement = RefreshToken(
        user_id=token.user_id,
        token_hash=_hash_token(new_raw),
        expires_at=_utcnow() + timedelta(days=settings.jwt_refresh_token_expire_days),
        device_hint=device_hint or token.device_hint,
    )
    db.add(replacement)
    db.flush()  ## assigns replacement.id without ending the transaction

    now = _utcnow()
    token.replaced_by = replacement.id
    token.last_used_at = now
    token.revoked_at = now  ## consumed tokens are revoked, not merely marked used

    return new_raw, token.user_id


def revoke_refresh_token(db: Session, raw_token: str) -> bool:
    """
    Revoke one token. Returns True if a live token was revoked.

    Used by logout. Deliberately does NOT raise on an unknown token: logging out
    with a token we do not recognise is not an error worth surfacing to a student
    who is trying to leave.
    """
    token = (
        db.query(RefreshToken)
        .filter(RefreshToken.token_hash == _hash_token(raw_token))
        .one_or_none()
    )
    if token is None or token.revoked_at is not None:
        return False
    token.revoked_at = _utcnow()
    return True


def revoke_all_for_user(db: Session, user_id: uuid.UUID) -> int:
    """
    Revoke every live token for a user. Returns the count.

    The "sign out all devices" capability. One UPDATE rather than a loop, because
    this may be called on a user with many sessions.

    Not wired to a UI yet - the architectural engineer's recommendation, and the
    right one: build the capability now because it is cheap, expose the button when
    there is a devices screen to put it on.
    """
    return (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .update({RefreshToken.revoked_at: _utcnow()}, synchronize_session=False)
    )


def purge_expired(db: Session, older_than_days: int = 30) -> int:
    """
    Delete long-dead rows. Returns the count.

    Keeps the table from growing without bound. Deliberately keeps recently-expired
    rows rather than deleting on expiry, so that a replay of a just-expired token
    can still be recognised as reuse rather than as an unknown token.

    CHAIN SEVERANCE - WHY THIS IS NOT A PLAIN DELETE
    ------------------------------------------------
    `replaced_by` is a forward pointer with ON DELETE SET NULL, and `_revoke_chain`
    finds descendants by `replaced_by.in_(frontier)`. So deleting a row that others
    point AT nulls their pointers and SEVERS the chain. A severed chain is worse
    than a broken link: the forward walk can no longer reach a live descendant, so
    replaying an ancestor would not revoke it - and because the severed row also
    loses its own `replaced_by`, the replay is not even recognised as REUSE. It is
    treated as a plain expired token and NO chain revocation happens at all.

    Verified by experiment: build a 3-token chain, hard-delete the middle row, then
    replay the first. The third token remains usable.

    WHY IT CANNOT FIRE TODAY
    ------------------------
    With a 7-day lifetime and a 30-day cutoff, no purged row can have a live
    descendant: a descendant is issued after its ancestor and lives 7 days, so for
    a descendant to still be valid the ancestor would have to be under ~14 days old,
    which is nowhere near the 30-day cutoff.

    WHEN IT WOULD FIRE
    ------------------
    The moment the cutoff stops being comfortably larger than the lifetime:
    `purge_expired(older_than_days=7)`, or raising the refresh lifetime past 30 days.
    Both are plausible future edits, which is why this is guarded rather than
    documented.

    THE GUARD
    ---------
    Only delete rows that nothing points AT, and whose `replaced_by` is either NULL
    or already deleted. That is exactly the set of rows whose removal cannot sever
    anything. It costs one extra NOT EXISTS clause and makes the failure mode
    structurally impossible rather than merely unlikely.
    """
    cutoff = _utcnow() - timedelta(days=older_than_days)

    ## A row is safe to remove when neither end of its chain link would be lost:
    ##  - nothing references it (no descendant would have its pointer nulled), AND
    ##  - it references nothing that still exists (so removing it leaves no
    ##    dangling pointer that a future walk would try to follow).
    ## Rows failing either condition are retained. They are small, and correctness
    ## beats reclaiming a few hundred bytes.
    ##
    ## Both conditions live inline in `removable` below. A `referenced = ...` subquery
    ## used to be built here and then never used - dead code left over from an earlier
    ## version, which `ruff` F841 flagged. Removed so the guard reads as one thing.

    removable = (
        db.query(RefreshToken)
        .filter(RefreshToken.expires_at < cutoff)
        # Nothing points at this row.
        .filter(~RefreshToken.id.in_(db.query(RefreshToken.replaced_by).filter(
            RefreshToken.replaced_by.isnot(None)
        )))
        # And it does not point at a surviving row.
        .filter(
            (RefreshToken.replaced_by.is_(None))
            | (RefreshToken.replaced_by.in_(db.query(RefreshToken.id).filter(
                RefreshToken.expires_at < cutoff
            )))
        )
    )

    ids = [row.id for row in removable.all()]
    if not ids:
        return 0
    return (
        db.query(RefreshToken)
        .filter(RefreshToken.id.in_(ids))
        .delete(synchronize_session=False)
    )
