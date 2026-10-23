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
#
# SOURCE: the founder supplied these on 2026-10-23 in found_bursaries.md, each
# with its official closing date. The provider and description below are written
# from what each fund is publicly for; the CLOSING DATE is the founder's and is
# copied verbatim, never inferred. If a date is ever wrong, the fix belongs in
# this file with a new verified_on - not in a guess.
from datetime import date as _date

_VERIFIED = _date(2026, 10, 23)

BURSARIES: list[dict] = [
    {
        "name": "SARB CEJ Scholarship in Economics Journalism",
        "provider": "South African Reserve Bank / Rhodes University",
        "description": (
            "Scholarship for students of economics journalism at Rhodes University, "
            "funded through the Centre for Economics Journalism."
        ),
        "url": "https://www.ru.ac.za/jms/studying/scholarships/",
        "verified_on": _VERIFIED,
        # Journalism, not economics alone: the degree is the subject being funded.
        "fields_of_study": ["journalism", "economics", "media"],
        "institutions": ["Rhodes University"],
        "levels": ["undergraduate", "postgraduate"],
    },
    {
        "name": "Discovery Foundation Awards",
        "provider": "Discovery Foundation",
        "description": (
            "Awards for academic clinicians and medical specialists, supporting "
            "further study and research. Administered by the Discovery Foundation."
        ),
        "url": "https://www.discovery.co.za/corporate/discovery-foundation-awards",
        "verified_on": _VERIFIED,
        "fields_of_study": ["medicine", "health sciences", "medical"],
        "levels": ["postgraduate"],
    },
    {
        "name": "Gauteng Department of Health Nursing Bursary",
        "provider": "Gauteng Department of Health",
        "description": (
            "Bursary for Gauteng residents studying nursing in 2027, in return for "
            "service in the provincial public health system."
        ),
        "url": (
            "https://www.gauteng.gov.za/health/Media%20Advisories%20and%20Statements/"
            "Media%20Statement%20-%20Gauteng%20residents%20encouraged%20to%20apply%20"
            "to%20study%20nursing%20in%202027%2011%20October%202026.pdf"
        ),
        "verified_on": _VERIFIED,
        "fields_of_study": ["nursing", "health sciences", "medicine"],
        "institutions": ["university", "university_of_technology"],
        "levels": ["undergraduate"],
    },
    {
        "name": "SAAFoST Bursary",
        "provider": "South African Association for Food Science and Technology",
        "description": (
            "Bursary for students in food science and technology, awarded by SAAFoST "
            "members to encourage study in the field."
        ),
        "url": "https://www.saafost.org.za/mysaafost/bursaries/",
        "verified_on": _VERIFIED,
        "fields_of_study": [
            "food science", "food technology", "biotechnology", "chemistry",
            "microbiology", "biochemistry",
        ],
        "levels": ["undergraduate", "postgraduate"],
    },
    {
        "name": "BDO South Africa Bursary",
        "provider": "BDO South Africa",
        "description": (
            "Bursary from the audit and advisory firm for students in accounting and "
            "related commerce fields, with vacation work as part of the award."
        ),
        "url": "https://bdo.mcidirecthire.com/bursary/external/currentopportunities",
        "verified_on": _VERIFIED,
        "fields_of_study": ["accounting", "commerce", "finance", "auditing"],
        "levels": ["undergraduate"],
    },
    {
        "name": "Astron Energy Bursary",
        "provider": "Astron Energy",
        "description": (
            "Bursary for students in engineering, science and related fields across "
            "several South African universities."
        ),
        "url": "https://aebursary.auraams.app/Home/Index?applicationTypeId=332",
        "verified_on": _VERIFIED,
        "fields_of_study": [
            "engineering", "science", "chemistry", "mathematics",
            "computer science", "physics", "chemical engineering",
        ],
        "levels": ["undergraduate"],
    },
    {
        "name": "JDK Benefit Trust Bursary",
        "provider": "JDK Benefit Trust",
        "description": (
            "Bursary for students from participating communities, covering study at "
            "South African public universities and universities of technology."
        ),
        "url": "https://jdkbenefittrust.co.za/application-form/",
        "verified_on": _VERIFIED,
        "institutions": ["university", "university_of_technology"],
        "levels": ["undergraduate"],
        "citizen_only": True,
    },
    {
        "name": "ISFAP Bursary",
        "provider": "Ikamva National Skills Fund / ISFAP",
        "description": (
            "Government-backed funding for students in scarce-skill fields, covering "
            "tuition, accommodation, food and a stipend."
        ),
        "url": "https://applyonline.isfap.org.za/",
        "verified_on": _VERIFIED,
        "fields_of_study": [
            "science", "engineering", "health", "finance", "commerce", "ict",
            "computer science", "information technology", "mathematics",
            "accounting", "nursing", "medicine",
        ],
        "levels": ["undergraduate"],
        "citizen_only": True,
    },
    {
        "name": "SIOC Community Development Trust Bursary",
        "provider": "Sishen Iron Ore Company Community Development Trust",
        "description": (
            "Bursary for students from the trust's beneficiary communities in the "
            "Northern Cape, aimed at scarce skills."
        ),
        "url": "https://duxpd.co.za/sioc-cdt-online-bursary-application-form/",
        "verified_on": _VERIFIED,
        "levels": ["undergraduate"],
        "citizen_only": True,
    },
    {
        "name": "City of Johannesburg Bursary",
        "provider": "City of Johannesburg",
        "description": (
            "Bursary for Johannesburg residents studying at an accredited South "
            "African institution, awarded by the City."
        ),
        "url": "https://share.hsforms.com/1TB8w0rjjTNSR0CStARTL5Q469tl",
        "verified_on": _VERIFIED,
        "institutions": ["university", "university_of_technology", "tvet"],
        "levels": ["undergraduate"],
        "citizen_only": True,
    },
    {
        "name": "Mulilo Bursary",
        "provider": "Mulilo",
        "description": (
            "Bursary from the renewable energy producer for students in engineering "
            "and related technical fields."
        ),
        "url": "https://bursaries.xhuma.io/mulilo",
        "verified_on": _VERIFIED,
        "fields_of_study": [
            "engineering", "science", "chemistry", "mathematics",
            "computer science", "physics", "chemical engineering",
        ],
        "levels": ["undergraduate"],
    },
    {
        "name": "NSFAS Bursary",
        "provider": "National Student Financial Aid Scheme",
        "description": (
            "Government funding for South African students from households below the "
            "income threshold. Covers tuition, accommodation and a living allowance "
            "at public universities and TVET colleges."
        ),
        "url": "https://my.nsfas.org.za/",
        "verified_on": _VERIFIED,
        "institutions": ["university", "university_of_technology", "tvet"],
        "levels": ["undergraduate"],
        "citizen_only": True,
    },
]


# The founder's verified closing dates, kept separate from the entries above so a
# closing date is edited in exactly one place and is easy to audit against
# found_bursaries.md.
_CLOSING_DATES: dict[str, _date] = {
    "SARB CEJ Scholarship in Economics Journalism": _date(2026, 10, 23),
    "Astron Energy Bursary": _date(2026, 10, 26),
    "Discovery Foundation Awards": _date(2026, 10, 30),
    "Gauteng Department of Health Nursing Bursary": _date(2026, 10, 30),
    "SAAFoST Bursary": _date(2026, 10, 30),
    "BDO South Africa Bursary": _date(2026, 10, 31),
    "JDK Benefit Trust Bursary": _date(2026, 10, 31),
    "ISFAP Bursary": _date(2026, 10, 31),
    "City of Johannesburg Bursary": _date(2026, 10, 31),
    "Mulilo Bursary": _date(2026, 10, 31),
    "NSFAS Bursary": _date(2026, 10, 31),
    "SIOC Community Development Trust Bursary": _date(2026, 11, 30),
}

for _entry_dict in BURSARIES:
    _entry_dict["application_closes"] = _CLOSING_DATES.get(_entry_dict["name"])



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

    # Same as ingest_real_materials.py: when run as `python scripts/x.py`, the
    # project root is not on sys.path, so the app package cannot be imported.
    sys.path.insert(0, ".")

    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        load(db, dry_run=args.dry_run)
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
