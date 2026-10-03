"""tests/test_migration_chain.py

Locks the Alembic migration chain so it cannot silently break.

WHY THIS EXISTS
---------------
On Day 3 the coverage-index migration was specified as revision `0010`. By
implementation time `0010` was already taken by the RAG brief tables, so it had
to ship as `0011`. Had that been missed, two files would have declared
`revision = "0010"` and `alembic upgrade head` would have failed in EVERY
environment - a break that is invisible until someone tries to build a database.

Nothing in the test suite would have caught that: the app imports fine, the
tests pass, and the damage only appears at deploy time. These assertions close
that gap by inspecting the migration files themselves.

Guards against:
  - duplicate revision ids (the Day 3 near-miss)
  - dangling down_revision references (usually a bad rebase or manual edit)
  - multiple roots, or a missing root
  - multiple heads (a branched chain)
  - an unexpected head

WHEN A NEW MIGRATION LANDS: update EXPECTED_HEAD below, and add a row to
plan/MIGRATION_LOG.md. The failure message says exactly that.
"""
from __future__ import annotations

import re
from pathlib import Path

VERSIONS_DIR = Path(__file__).parent.parent / "alembic" / "versions"

# The single expected head. Update deliberately when a migration is added.
EXPECTED_HEAD = "0013"

# Matches both `revision = "0001"` and the annotated `revision: str = "0001"`.
_REVISION_RE = re.compile(
    r"^revision(?:\s*:\s*[^=]+)?\s*=\s*[\"']([^\"']+)[\"']", re.MULTILINE
)
_DOWN_REVISION_RE = re.compile(
    r"^down_revision(?:\s*:\s*[^=]+)?\s*=\s*[\"']([^\"']+)[\"']", re.MULTILINE
)


def _parse_migrations() -> list[dict]:
    """Read every migration file and return its revision metadata.

    Parsed from the source text rather than by importing, so a migration that
    fails to import still gets validated - a broken import is exactly what this
    test should surface, not skip.
    """
    migrations = []
    for path in sorted(VERSIONS_DIR.glob("*.py")):
        if path.name.startswith("__"):
            continue
        text = path.read_text(encoding="utf-8")
        revision_match = _REVISION_RE.search(text)
        if not revision_match:
            continue
        down_match = _DOWN_REVISION_RE.search(text)
        migrations.append(
            {
                "file": path.name,
                "revision": revision_match.group(1),
                "down_revision": down_match.group(1) if down_match else None,
            }
        )
    return migrations


def test_migrations_are_discoverable():
    """Sanity: the parser found the files at all.

    Without this, a broken path or regex would make every other test in the file
    pass vacuously against an empty list - the most dangerous kind of green.
    """
    migrations = _parse_migrations()
    assert len(migrations) >= 11, (
        f"only found {len(migrations)} migrations in {VERSIONS_DIR}; "
        "the path or the regex is wrong"
    )


def test_no_duplicate_revisions():
    """Every revision id must be unique.

    This is the exact failure that was narrowly avoided on Day 3.
    """
    revisions = [m["revision"] for m in _parse_migrations()]
    duplicates = sorted({r for r in revisions if revisions.count(r) > 1})
    assert not duplicates, (
        f"duplicate revision ids: {duplicates}. Two migrations claim the same "
        "revision, so `alembic upgrade head` cannot resolve the chain. "
        "Renumber the newer one and add it to plan/MIGRATION_LOG.md."
    )


def test_exactly_one_root():
    """Exactly one migration has down_revision = None, and it is 0001."""
    roots = [m for m in _parse_migrations() if m["down_revision"] is None]
    assert len(roots) == 1, (
        f"expected exactly 1 root migration, got {len(roots)}: "
        f"{[r['file'] for r in roots]}"
    )
    assert roots[0]["revision"] == "0001", roots[0]


def test_no_dangling_parent_references():
    """Every down_revision must point at a revision that actually exists."""
    migrations = _parse_migrations()
    known = {m["revision"] for m in migrations}
    for migration in migrations:
        parent = migration["down_revision"]
        if parent is not None:
            assert parent in known, (
                f"{migration['file']}: down_revision={parent!r} does not exist. "
                "Usually a bad rebase or a manual edit."
            )


def test_exactly_one_head():
    """Exactly one migration is unreferenced by any other (no branching)."""
    migrations = _parse_migrations()
    parents = {m["down_revision"] for m in migrations if m["down_revision"]}
    heads = [m["revision"] for m in migrations if m["revision"] not in parents]
    assert len(heads) == 1, (
        f"expected exactly 1 head, got {sorted(heads)} - the chain has branched, "
        "which requires an explicit merge migration"
    )


def test_head_is_expected():
    """Head matches EXPECTED_HEAD, so an unnoticed migration cannot ship."""
    migrations = _parse_migrations()
    parents = {m["down_revision"] for m in migrations if m["down_revision"]}
    heads = [m["revision"] for m in migrations if m["revision"] not in parents]
    assert heads == [EXPECTED_HEAD], (
        f"head is {heads}, expected {[EXPECTED_HEAD]!r}. If a migration was "
        "intentionally added, update EXPECTED_HEAD here AND add a row to "
        "plan/MIGRATION_LOG.md. If it was removed, investigate."
    )


def test_chain_is_linear_and_complete():
    """Walking the chain from the head reaches every migration exactly once.

    These are the individual checks above combined into the property that
    actually matters: the chain is a single unbranched path covering all files.
    """
    migrations = _parse_migrations()
    by_revision = {m["revision"]: m for m in migrations}
    parents = {m["down_revision"] for m in migrations if m["down_revision"]}
    head = next(m["revision"] for m in migrations if m["revision"] not in parents)

    walked: list[str] = []
    current: str | None = head
    while current is not None:
        assert current not in walked, f"cycle detected at {current}"
        walked.append(current)
        current = by_revision[current]["down_revision"]

    assert len(walked) == len(migrations), (
        f"walked {len(walked)} migrations from the head but {len(migrations)} "
        "files exist - some are unreachable from the head"
    )
    assert walked[-1] == "0001", f"chain does not terminate at 0001: {walked[-1]}"
    # Highest revision should be the head.
    assert head == max(by_revision), f"head {head} is not the highest revision"
