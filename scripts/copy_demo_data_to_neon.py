"""
Copy the local demo database into Neon.

WHY A SCRIPT RATHER THAN pg_dump | pg_restore
---------------------------------------------
The local database is at migration 0012 and Neon is at 0003, so the two schemas
do NOT match yet. A plain dump would try to insert rows into tables that do not
exist on the target and fail.

So the order matters:
  1. Run migrations on Neon first, bringing it to 0012.
  2. Then copy rows, table by table, in foreign-key order.

The Neon database currently holds one throwaway account (verify-...@example.com)
and no demo data, so this replaces its contents rather than merging.

Nothing is written to the local database. It is read-only here.
"""
import pathlib

from sqlalchemy import create_engine, text


def load_url(key: str) -> str:
    for line in pathlib.Path(".env").read_text().splitlines():
        if line.startswith(f"{key}="):
            url = line.split("=", 1)[1].strip()
            # The app requires the psycopg v3 driver; Neon hands out plain
            # postgresql://. Without this the engine cannot start.
            return url.replace("postgresql://", "postgresql+psycopg://", 1)
    raise SystemExit(f"{key} not found in .env")


local = create_engine(
    load_url("DATABASE_URL"),
    pool_pre_ping=True,
    connect_args={"connect_timeout": 20},
)
remote = create_engine(
    load_url("STAGING_DATABASE_URL"),
    pool_pre_ping=True,
    connect_args={"connect_timeout": 30},
)

# Copied in dependency order so foreign keys always resolve.
TABLES = [
    "users",
    "modules",
    "academic_tasks",
    "timetable_slots",
    "usage_events",
    "user_ai_quotas",
    "ai_summary_caches",
    "study_materials",
    "feedback",
    "user_consents",
    "improvement_signals",
    "brief_documents",
    "brief_chunks",
]

print("=== source (local) ===")
with local.connect() as c:
    src_version = c.execute(text("select version_num from alembic_version")).scalar()
    print(f"  migration: {src_version}")

print("\n=== target (Neon) before ===")
with remote.connect() as c:
    tgt_version = c.execute(text("select version_num from alembic_version")).scalar()
    print(f"  migration: {tgt_version}")

if tgt_version != src_version:
    raise SystemExit(
        f"\nSTOP: Neon is at {tgt_version} but the source is at {src_version}.\n"
        "Run migrations on Neon first, then run this again. Copying into a\n"
        "older schema would fail on missing tables or columns."
    )

print("\n=== copying ===")
# Verify every name actually exists before touching the transaction. A typo here
# previously aborted the whole transaction and reported a confusing error about
# an already-failed transaction rather than naming the missing table.
with remote.connect() as c:
    actual = {
        r[0]
        for r in c.execute(
            text(
                "select table_name from information_schema.tables "
                "where table_schema='public'"
            )
        )
    }
missing = [t for t in TABLES if t not in actual]
if missing:
    raise SystemExit(f"STOP: these tables do not exist on Neon: {missing}")
print(f"  all {len(TABLES)} table names verified against Neon")
total = 0
with local.connect() as src, remote.begin() as dst:
    # Clear the target first so re-running is idempotent rather than a
    # duplicate-key error halfway through.
    for table in reversed(TABLES):
        try:
            dst.execute(text(f"DELETE FROM {table}"))  # noqa: S608 - Table name from the hardcoded TABLES constant, never user input.
        except Exception:  # noqa: S110 - Table may not exist in the target yet; skipping is the documented behaviour.
            pass

    for table in TABLES:
        try:
            rows = src.execute(text(f"SELECT * FROM {table}")).mappings().all()  # noqa: S608 - Table name from the hardcoded TABLES constant, never user input.
        except Exception as exc:
            print(f"  {table:24} skipped ({str(exc)[:50]})")
            continue
        if not rows:
            print(f"  {table:24} 0 rows")
            continue

        cols = list(rows[0].keys())
        col_list = ", ".join(cols)
        placeholders = ", ".join(f":{c}" for c in cols)
        dst.execute(
            text(f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})"),  # noqa: S608 - Table name from the hardcoded TABLES constant; all values are bound :params.
            [dict(r) for r in rows],
        )
        total += len(rows)
        print(f"  {table:24} {len(rows)} rows")

print(f"\n  total rows copied: {total}")

print("\n=== verify on Neon ===")
with remote.connect() as c:
    for table in ("users", "modules", "academic_tasks"):
        n = c.execute(text(f"SELECT count(*) FROM {table}")).scalar()  # noqa: S608 - Table name from the hardcoded TABLES constant, never user input.
        print(f"  {table:24} {n}")
    demo = c.execute(
        text("SELECT count(*) FROM users WHERE email = 'demo@varsitycompanion.co.za'")
    ).scalar()
    print(f"\n  demo account present: {'YES' if demo else 'NO'}")
