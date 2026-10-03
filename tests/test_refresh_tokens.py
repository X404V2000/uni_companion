"""
tests/test_refresh_tokens.py

PURPOSE
-------
Prove the refresh-token mechanism does what the design says, and prove the two
security properties specifically - rotation and reuse detection - rather than
assuming them from the code reading.

WHY THESE TESTS MATTER MORE THAN USUAL
--------------------------------------
Every student was being logged out every 15 minutes because a configured refresh
lifetime was never implemented. Adding it back means adding a credential that lives
for days, so the tests that matter are the ones about what happens when that
credential is abused, not the happy path.

The happy path (refresh returns a new pair) is the easy part and is tested once.
The rest of this file is about the cases where a refresh token is replayed, expired,
revoked, or belongs to a deleted account.
"""

import uuid
from datetime import UTC, datetime, timedelta

# Deliberately obviously-fake. This is a hash INPUT for throwaway rows created in
# tests; it is never used to authenticate against anything. An earlier version
# used a string resembling the demo account password, which is not a credential
# (verified: the live API returns 401 for it) but reads like one and would trip a
# secret scanner for no reason.
_FIXTURE_PASSWORD = "test-fixture-password-not-a-credential"

import pytest

from app.core.config import settings
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.services import refresh_token_service


def _make_user(db, email: str) -> User:
    """Create a real user row so the FK to users.id is satisfied."""
    from app.core.security import hash_password

    user = User(
        email=email,
        hashed_password=hash_password(_FIXTURE_PASSWORD),
        full_name="Refresh Test",
        university="Test University",
        field_of_study="Computer Science",
        year_of_study=2,
        # POPIA consent columns are NOT NULL - every real signup records them, so
        # a fixture that omits them is not a realistic user and fails the insert.
        terms_version="1.0",
        privacy_version="1.0",
        accepted_at=datetime.now(UTC),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# The happy path, tested once
# ---------------------------------------------------------------------------


def test_issue_and_rotate_returns_a_new_token(db):
    """A refresh token can be exchanged for a new pair."""
    user = _make_user(db, f"rotate-{uuid.uuid4().hex[:8]}@example.com")

    first = refresh_token_service.issue_refresh_token(db, user.id)
    db.commit()

    second, returned_user_id = refresh_token_service.rotate_refresh_token(db, first)
    db.commit()

    assert second != first, "rotation must produce a NEW token"
    assert returned_user_id == user.id, "the refresh must resolve to the right user"


def test_only_the_hash_is_stored(db):
    """The raw token must never be readable from the database."""
    user = _make_user(db, f"hash-{uuid.uuid4().hex[:8]}@example.com")
    raw = refresh_token_service.issue_refresh_token(db, user.id)
    db.commit()

    rows = db.query(RefreshToken).filter(RefreshToken.user_id == user.id).all()
    assert len(rows) == 1
    # The whole point: a database leak must not yield usable sessions.
    assert rows[0].token_hash != raw
    assert raw not in rows[0].token_hash
    assert len(rows[0].token_hash) == 64, "SHA-256 hex digest"


# ---------------------------------------------------------------------------
# Rotation: a refresh token is single-use
# ---------------------------------------------------------------------------


def test_rotation_consumes_the_old_token(db):
    """After rotation, the presented token is revoked, not merely superseded."""
    user = _make_user(db, f"consume-{uuid.uuid4().hex[:8]}@example.com")
    first = refresh_token_service.issue_refresh_token(db, user.id)
    db.commit()
    refresh_token_service.rotate_refresh_token(db, first)
    db.commit()

    old = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user.id)
        .order_by(RefreshToken.created_at.asc())
        .first()
    )
    assert old.revoked_at is not None, "a consumed token must be revoked"
    assert old.replaced_by is not None, "and must point at its successor"
    assert old.last_used_at is not None, "and record when it was used"


# ---------------------------------------------------------------------------
# Reuse detection - the security property the design rests on
# ---------------------------------------------------------------------------


def test_replaying_a_consumed_token_raises_reuse_error(db):
    """
    THE CENTRAL SECURITY TEST.

    Presenting an already-consumed token means it was stolen or replayed. The
    service must refuse it AND revoke the chain, because we cannot tell which
    holder is the legitimate one.
    """
    user = _make_user(db, f"reuse-{uuid.uuid4().hex[:8]}@example.com")
    first = refresh_token_service.issue_refresh_token(db, user.id)
    db.commit()

    # Legitimate client rotates.
    second, _ = refresh_token_service.rotate_refresh_token(db, first)
    db.commit()

    # Attacker replays the now-consumed first token.
    with pytest.raises(refresh_token_service.RefreshTokenReuseError):
        refresh_token_service.rotate_refresh_token(db, first)


def test_reuse_revokes_the_entire_chain(db):
    """
    Detecting reuse is not enough - the live descendant must die too.

    Revoking only the replayed token would leave the attacker's newer token (or the
    legitimate user's) alive, which is precisely the session a thief would hold.
    """
    user = _make_user(db, f"chain-{uuid.uuid4().hex[:8]}@example.com")
    first = refresh_token_service.issue_refresh_token(db, user.id)
    db.commit()
    second, _ = refresh_token_service.rotate_refresh_token(db, first)
    db.commit()

    # The second token is live right now.
    live_before = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .count()
    )
    assert live_before == 1

    with pytest.raises(refresh_token_service.RefreshTokenReuseError):
        refresh_token_service.rotate_refresh_token(db, first)

    live_after = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .count()
    )
    assert live_after == 0, "the whole chain must be revoked, including the descendant"

    # And the descendant is genuinely unusable afterwards.
    with pytest.raises(refresh_token_service.InvalidRefreshTokenError):
        refresh_token_service.rotate_refresh_token(db, second)


def test_reuse_of_a_token_from_another_user_does_not_affect_them(db):
    """
    Chain revocation must be scoped to the affected account.

    A blunt "revoke everything" would turn one compromised account into a
    denial-of-service against other students.
    """
    victim = _make_user(db, f"victim-{uuid.uuid4().hex[:8]}@example.com")
    attacker = _make_user(db, f"attacker-{uuid.uuid4().hex[:8]}@example.com")

    victim_token = refresh_token_service.issue_refresh_token(db, victim.id)
    attacker_token = refresh_token_service.issue_refresh_token(db, attacker.id)
    db.commit()

    # Consume the attacker's, then replay it.
    refresh_token_service.rotate_refresh_token(db, attacker_token)
    db.commit()
    with pytest.raises(refresh_token_service.RefreshTokenReuseError):
        refresh_token_service.rotate_refresh_token(db, attacker_token)

    # The victim's session must be entirely untouched.
    victim_live = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == victim.id, RefreshToken.revoked_at.is_(None))
        .count()
    )
    assert victim_live == 1
    # And still usable.
    refresh_token_service.rotate_refresh_token(db, victim_token)


# ---------------------------------------------------------------------------
# Expiry and revocation
# ---------------------------------------------------------------------------


def test_unknown_token_is_rejected(db):
    with pytest.raises(refresh_token_service.InvalidRefreshTokenError):
        refresh_token_service.rotate_refresh_token(db, "not-a-real-token-at-all")


def test_expired_token_is_rejected(db):
    """Expiry is enforced on the row, not merely assumed from config."""
    user = _make_user(db, f"expired-{uuid.uuid4().hex[:8]}@example.com")
    raw = refresh_token_service.issue_refresh_token(db, user.id)
    db.commit()

    row = db.query(RefreshToken).filter(RefreshToken.user_id == user.id).one()
    row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()

    with pytest.raises(refresh_token_service.InvalidRefreshTokenError):
        refresh_token_service.rotate_refresh_token(db, raw)


def test_revoked_token_is_rejected(db):
    user = _make_user(db, f"revoked-{uuid.uuid4().hex[:8]}@example.com")
    raw = refresh_token_service.issue_refresh_token(db, user.id)
    db.commit()

    assert refresh_token_service.revoke_refresh_token(db, raw) is True
    db.commit()

    with pytest.raises(refresh_token_service.InvalidRefreshTokenError):
        refresh_token_service.rotate_refresh_token(db, raw)


def test_revoking_twice_is_not_an_error(db):
    """
    Logout is idempotent. A student double-tapping sign-out, or a client retrying,
    must not produce an error.
    """
    user = _make_user(db, f"idem-{uuid.uuid4().hex[:8]}@example.com")
    raw = refresh_token_service.issue_refresh_token(db, user.id)
    db.commit()

    assert refresh_token_service.revoke_refresh_token(db, raw) is True
    db.commit()
    assert refresh_token_service.revoke_refresh_token(db, raw) is False


def test_revoking_an_unknown_token_is_not_an_error(db):
    """Signing out with a token we do not know must not block the student."""
    assert refresh_token_service.revoke_refresh_token(db, "unknown-token") is False


def test_revoke_all_for_user_kills_every_session(db):
    """The sign-out-all-devices capability."""
    user = _make_user(db, f"all-{uuid.uuid4().hex[:8]}@example.com")
    for _ in range(3):
        refresh_token_service.issue_refresh_token(db, user.id)
    db.commit()

    assert refresh_token_service.revoke_all_for_user(db, user.id) == 3
    db.commit()

    live = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .count()
    )
    assert live == 0


def test_revoke_all_is_scoped_to_one_user(db):
    """Sign-out-all must not sign out other students."""
    a = _make_user(db, f"scope-a-{uuid.uuid4().hex[:8]}@example.com")
    b = _make_user(db, f"scope-b-{uuid.uuid4().hex[:8]}@example.com")
    refresh_token_service.issue_refresh_token(db, a.id)
    refresh_token_service.issue_refresh_token(db, b.id)
    db.commit()

    refresh_token_service.revoke_all_for_user(db, a.id)
    db.commit()

    b_live = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == b.id, RefreshToken.revoked_at.is_(None))
        .count()
    )
    assert b_live == 1


# ---------------------------------------------------------------------------
# POPIA: deletion must cascade
# ---------------------------------------------------------------------------


def test_deleting_a_user_deletes_their_refresh_tokens(db):
    """
    A live credential outliving its own account deletion would be a hole in the
    POPIA guarantee, not merely untidy.
    """
    user = _make_user(db, f"cascade-{uuid.uuid4().hex[:8]}@example.com")
    refresh_token_service.issue_refresh_token(db, user.id)
    db.commit()

    user_id = user.id
    db.delete(user)
    db.commit()

    remaining = (
        db.query(RefreshToken).filter(RefreshToken.user_id == user_id).count()
    )
    assert remaining == 0, "refresh tokens must cascade with the account"


# ---------------------------------------------------------------------------
# Lifetime is the configured value, not a hard-coded one
# ---------------------------------------------------------------------------


def test_lifetime_comes_from_config(db):
    """
    `jwt_refresh_token_expire_days` existed in config for months while being used
    nowhere. This asserts the value is now actually honoured, so it cannot silently
    become dead configuration again.
    """
    user = _make_user(db, f"lifetime-{uuid.uuid4().hex[:8]}@example.com")
    before = datetime.now(UTC)
    refresh_token_service.issue_refresh_token(db, user.id)
    db.commit()

    row = db.query(RefreshToken).filter(RefreshToken.user_id == user.id).one()
    expected = before + timedelta(days=settings.jwt_refresh_token_expire_days)
    # Allow a generous window for execution time; the point is the magnitude.
    assert abs((row.expires_at - expected).total_seconds()) < 60


def test_purge_removes_only_long_expired_rows(db):
    """Housekeeping must not delete rows whose replay we still want to detect."""
    user = _make_user(db, f"purge-{uuid.uuid4().hex[:8]}@example.com")
    refresh_token_service.issue_refresh_token(db, user.id)
    db.commit()

    # Work with the row ID, not the ORM instance.
    #
    # purge_expired issues a bulk DELETE with synchronize_session=False, which
    # leaves previously-loaded ORM instances stale; touching one afterwards raises
    # ObjectDeletedError. Counting by ID keeps the assertion about the database,
    # which is what the behaviour under test actually is.
    row_id = db.query(RefreshToken).filter(RefreshToken.user_id == user.id).one().id

    def rows_for(token_id):
        db.expire_all()
        return db.query(RefreshToken).filter(RefreshToken.id == token_id).count()

    # Just expired: must be KEPT. A replay of it should still read as reuse rather
    # than as an unknown token, which is why purge keeps recently-expired rows.
    (
        db.query(RefreshToken)
        .filter(RefreshToken.id == row_id)
        .update({RefreshToken.expires_at: datetime.now(UTC) - timedelta(hours=1)})
    )
    db.commit()
    refresh_token_service.purge_expired(db, older_than_days=30)
    db.commit()
    assert rows_for(row_id) == 1, (
        "a just-expired token must be kept so a replay of it is detected as reuse"
    )

    # Long expired: safe to remove.
    (
        db.query(RefreshToken)
        .filter(RefreshToken.id == row_id)
        .update({RefreshToken.expires_at: datetime.now(UTC) - timedelta(days=90)})
    )
    db.commit()
    refresh_token_service.purge_expired(db, older_than_days=30)
    db.commit()
    assert rows_for(row_id) == 0, "a long-expired token should be removed"


# ---------------------------------------------------------------------------
# Chain integrity: purge must not sever a chain
# ---------------------------------------------------------------------------


def _chain_of(db, user_id):
    """Return the user's tokens oldest-first, as (id, replaced_by) pairs."""
    db.expire_all()
    rows = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user_id)
        .order_by(RefreshToken.created_at.asc())
        .all()
    )
    return [(r.id, r.replaced_by) for r in rows]


def test_purge_does_not_sever_a_chain(db):
    """
    THE LANDMINE, PINNED.

    `replaced_by` is ON DELETE SET NULL and `_revoke_chain` walks forward through
    it. A plain `DELETE WHERE expires_at < cutoff` can therefore remove a row that
    others point at, nulling their pointers and making a live descendant
    unreachable - after which a replay revokes nothing, and is not even recognised
    as reuse.

    This asserts the guard: purge must keep any row that a surviving row points at.

    Reachability note, because severity matters: with a 7-day lifetime and a 30-day
    cutoff this cannot fire through the normal call. The test drives it directly so
    the guard is proven rather than assumed - the moment someone raises the lifetime
    past the cutoff, or calls purge with a short window, this is live.
    """
    user = _make_user(db, f"sever-{uuid.uuid4().hex[:8]}@example.com")

    # Build a three-token chain: A -> B -> C
    rt_a = refresh_token_service.issue_refresh_token(db, user.id)
    db.commit()
    rt_b, _ = refresh_token_service.rotate_refresh_token(db, rt_a)
    db.commit()
    rt_c, _ = refresh_token_service.rotate_refresh_token(db, rt_b)
    db.commit()

    chain = _chain_of(db, user.id)
    assert len(chain) == 3
    id_a, id_b, id_c = chain[0][0], chain[1][0], chain[2][0]

    # Age the MIDDLE row past the cutoff. This is the row whose deletion would
    # null BOTH the ancestor's and the descendant's pointers.
    (
        db.query(RefreshToken)
        .filter(RefreshToken.id == id_b)
        .update({RefreshToken.expires_at: datetime.now(UTC) - timedelta(days=90)})
    )
    db.commit()

    refresh_token_service.purge_expired(db, older_than_days=30)
    db.commit()

    surviving = {row_id for row_id, _ in _chain_of(db, user.id)}
    assert id_b in surviving, (
        "purge deleted a mid-chain row. Its removal nulls the replaced_by pointers "
        "of the rows around it, so a live descendant becomes unreachable by "
        "_revoke_chain and a replay would revoke nothing."
    )
    # And the links on either side are still intact.
    links = dict(_chain_of(db, user.id))
    assert links[id_a] == id_b, "the ancestor must still point at the middle row"
    assert links[id_b] == id_c, "the middle row must still point at the descendant"


def test_purge_still_removes_a_safe_chain_origin(db):
    """
    The guard must not make purge useless.

    The chain ORIGIN is safe to delete: nothing points at it, so nothing is
    severed. This is the ordinary case, since expires_at is set at issue time and
    older tokens therefore expire first.
    """
    user = _make_user(db, f"origin-{uuid.uuid4().hex[:8]}@example.com")
    rt_a = refresh_token_service.issue_refresh_token(db, user.id)
    db.commit()
    rt_b, _ = refresh_token_service.rotate_refresh_token(db, rt_a)
    db.commit()

    chain = _chain_of(db, user.id)
    id_a = chain[0][0]

    # Age the ORIGIN past the cutoff, and the descendant too, so the "points at a
    # surviving row" condition cannot be what saves it.
    (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user.id)
        .update({RefreshToken.expires_at: datetime.now(UTC) - timedelta(days=90)})
    )
    db.commit()

    removed = refresh_token_service.purge_expired(db, older_than_days=30)
    db.commit()
    assert removed > 0, "purge must still delete rows when it is safe to do so"
    surviving = {row_id for row_id, _ in _chain_of(db, user.id)}
    assert id_a not in surviving


def test_severed_chain_is_the_failure_this_guard_prevents(db):
    """
    Demonstrates the failure mode directly, by severing the chain by hand.

    If this test ever starts failing, the guard in purge_expired has been bypassed
    by some other code path and the landmine is live.
    """
    user = _make_user(db, f"demo-sever-{uuid.uuid4().hex[:8]}@example.com")
    rt_a = refresh_token_service.issue_refresh_token(db, user.id)
    db.commit()
    rt_b, _ = refresh_token_service.rotate_refresh_token(db, rt_a)
    db.commit()
    rt_c, _ = refresh_token_service.rotate_refresh_token(db, rt_b)
    db.commit()

    chain = _chain_of(db, user.id)
    id_b = chain[1][0]

    # Bypass the guard entirely: hard-delete the middle row.
    db.query(RefreshToken).filter(RefreshToken.id == id_b).delete(
        synchronize_session=False
    )
    db.commit()

    db.expire_all()
    tip = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user.id)
        .order_by(RefreshToken.created_at.desc())
        .first()
    )
    assert tip.is_usable(), "precondition: the tip is live before the replay"

    # Replaying the ancestor should raise Invalid (not Reuse) once severed, and
    # crucially must NOT revoke the tip.
    with pytest.raises(refresh_token_service.RefreshTokenError):
        refresh_token_service.rotate_refresh_token(db, rt_a)

    db.expire_all()
    tip_after = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user.id)
        .order_by(RefreshToken.created_at.desc())
        .first()
    )
    assert tip_after.is_usable(), (
        "documents the failure: with a severed chain, replaying an ancestor does "
        "NOT revoke the live descendant. purge_expired must never cause this."
    )
