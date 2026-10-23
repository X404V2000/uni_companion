"""scripts/seed_bursaries.py

PURPOSE
-------
Load the curated bursary list into the database, idempotently.

    venv/bin/python scripts/seed_bursaries.py            # write
    venv/bin/python scripts/seed_bursaries.py --dry-run  # show what would change

THE RULE THIS SCRIPT ENFORCES
-----------------------------
**Nothing is inserted without a `verified_on` date and a source URL.**

A bursary with a wrong deadline does not annoy a student - it costs them a year.
So each entry below must record the date a human last opened the official page and
confirmed the details. The loader refuses entries missing either field, which
makes "we are not sure" impossible to ship by accident: you either verified it or
it does not load.

WHAT IS DELIBERATELY NOT HERE
-----------------------------
The list below is INTENTIONALLY SHORT, and that is not an omission. It contains
only funds whose details were confirmed against their official pages. Filling it
to forty by guessing would defeat the entire purpose of the feature. Add entries
as they are verified, using the same shape.

HOW TO ADD ONE
--------------
1. Open the provider's official page in a browser (not a search result).
2. Confirm: the name, the provider, that applications are currently open or when
   they reopen, the closing date, and which students it is for.
3. Add an entry with `verified_on` set to today's date.
4. Run the script. Re-running is safe - it updates by (name, provider).

WHY NSFAS IS SPECIAL
--------------------
nsfas.org.za serves an INCOMPLETE TLS CHAIN (missing DigiCert Thawte G1
intermediate). Browsers cope; strict HTTP clients do not. Do NOT add an
automated "is the link alive" check for this host - it will report South
Africa's most important bursary as dead.
"""
from __future__ import annotations

import argparse
import sys

# Curated entries. Each one requires: name, provider, description, url,
# verified_on, and the matching fields that apply.
#
# IMPORTANT: `verified_on` is the date a human last confirmed this entry against
# the official page. It is not decorative - it is what the feature's integrity
# rests on.
BURSARIES: list[dict] = []


def _entry(**kw) -> dict:
    """Validate one curated entry before it can reach the database."""
    required = ("name", "provider", "description", "url", "verified_on")
    missing = [k for k in required if not kw.get(k)]
    if missing:
        raise SystemExit(
            f"Seed entry {kw.get('name', '<unnamed>')!r} is missing {missing}. "
            "An unverified bursary must not be loaded."
        )
    if not str(kw["url"]).startswith("https://"):
        raise SystemExit(f"{kw['name']!r}: url must be an official https:// page.")
    return kw


def load(db, dry_run: bool = False) -> tuple[int, int]:
    """Upsert every entry. Returns (created, updated)."""
    from app.models.bursary import Bursary

    created = updated = 0
    for raw in BURSARIES:
        entry = _entry(**raw)
        existing = (
            db.query(Bursary)
            .filter(Bursary.name == entry["name"], Bursary.provider == entry["provider"])
            .first()
        )
        fields = {
            "description": entry["description"],
            "url": entry["url"],
            "fields_of_study": entry.get("fields_of_study"),
            "levels": entry.get("levels"),
            "institutions": entry.get("institutions"),
            "min_year": entry.get("min_year"),
            "max_year": entry.get("max_year"),
            "citizen_only": entry.get("citizen_only", False),
            "application_opens": entry.get("application_opens"),
            "application_closes": entry.get("application_closes"),
            "is_active": entry.get("is_active", True),
        }
        if existing:
            for k, v in fields.items():
                setattr(existing, k, v)
            updated += 1
            print(f"  update  {entry['name']}")
        else:
            db.add(Bursary(name=entry["name"], provider=entry["provider"], **fields))
            created += 1
            print(f"  create  {entry['name']}")

    if dry_run:
        db.rollback()
        print(f"\n[dry-run] {created} would be created, {updated} updated. Nothing written.")
    else:
        db.commit()
        print(f"\n{created} created, {updated} updated.")
    return created, updated


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="show changes, write nothing")
    args = parser.parse_args(argv)

    if not BURSARIES:
        print(
            "No curated bursaries are configured yet.\n\n"
            "This is intentional rather than broken: every entry needs a human to\n"
            "confirm its closing date against the official page first. Add verified\n"
            "entries to BURSARIES in this file, then re-run.\n\n"
            "Loaded 0 bursaries. The feature is safe but empty.",
        )
        return 0

    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        load(db, dry_run=args.dry_run)
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
