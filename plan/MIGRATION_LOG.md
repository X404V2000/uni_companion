# Migration Log

**Every commit that adds, removes, or renumbers a file in `alembic/versions/`
must add a row to this table.**

## Why this file exists

On Day 3 of Week 3, the coverage-index migration was specified as revision
`0010`. By implementation time `0010` was already taken by the RAG brief tables,
so it had to ship as `0011`.

That surprise happened because **no single place recorded which migrations
existed**. The blueprint was written against a stale baseline, and the mismatch
was only discovered while writing the code. Had it been missed, two files would
have declared `revision = "0010"` and `alembic upgrade head` would have broken in
every environment — a failure that is invisible until someone builds a database.

This file closes that gap. One row per migration, forever. It costs about thirty
seconds per migration.

**Enforced by:** `tests/test_migration_chain.py` (chain integrity) and
`.github/PULL_REQUEST_TEMPLATE.md` (asks for the row on every PR).

## The chain

| Revision | down_revision | File | Purpose | Added |
|---|---|---|---|---|
| `0001` | base | `0001_initial_user_schema.py` | users table + POPIA consent fields | 2026-09-07 |
| `0002` | `0001` | `0002_add_user_roles.py` | RBAC role column (VARCHAR + CHECK) | 2026-09-07 |
| `0003` | `0002` | `0003_academic_tracker_schema.py` | modules, timetable_slots, academic_tasks | 2026-09-07 |
| `0004` | `0003` | `0004_ai_summary_engine_tables.py` | user_ai_quotas, ai_summary_caches | 2026-09-12 |
| `0005` | `0004` | `0005_study_materials_schema.py` | study_materials table | 2026-09-12 |
| `0006` | `0005` | `0006_add_updated_at_timetable_slots.py` | updated_at on timetable_slots (LWW sync) | 2026-09-12 |
| `0007` | `0006` | `0007_usage_events_and_feedback.py` | usage_events, feedback | 2026-09-15 |
| `0008` | `0007` | `0008_add_duration_ms.py` | duration_ms column on usage_events | 2026-09-15 |
| `0009` | `0008` | `0009_materials_admin_columns.py` | updated_at, created_by_user_id on materials | 2026-09-18 |
| `0010` | `0009` | `0010_brief_documents_and_chunks.py` | RAG: brief_documents + brief_chunks tables | 2026-09-26 |
| `0011` | `0010` | `0011_materials_module_url_index.py` | composite index `(module_code, url)` on study_materials | 2026-09-27 |

**Head at last review:** `0011`
**Locked by:** `tests/test_migration_chain.py::test_head_is_expected`

> Revision `0010` was added outside the blueprint process (RAG feature, built on
> direct founder instruction). Its provenance was audited on Day 4 — commit
> `179e667`, tested, on `origin/demo`. See
> `plan/month_2/week_3/day_3/rag_provenance_audit.md`. Its absence from the
> planning documents is precisely why this log was created.

## How to add a migration

1. Generate the file: `venv/bin/alembic revision -m "short description"`.
2. Set `revision` to the next number and `down_revision` to the current head.
3. Apply it: `venv/bin/alembic upgrade head`, then verify the downgrade too.
4. **Add a row to the table above**, with the real filename and today's date.
5. Update `EXPECTED_HEAD` in `tests/test_migration_chain.py`.
6. Run `venv/bin/pytest tests/test_migration_chain.py`.

Skipping step 4 or 5 fails CI, by design.
