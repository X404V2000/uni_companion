# Migration log

**Every commit that adds, removes, or renumbers a file in `alembic/versions/`
must add a row to this table.**

## Why this file exists

On Day 3 of Week 3, the coverage-index migration was specified as revision
`0010`. By implementation time `0010` was already taken by the RAG brief tables,
so it had to ship as `0011`.

That happened because **no single place recorded which migrations existed**. The
blueprint was written against a stale baseline, and the mismatch was only found
while writing the code. Had it been missed, two files would have declared
`revision = "0010"` and `alembic upgrade head` would have broken in every
environment — a failure invisible until someone builds a database.

This file closes that gap. One row per migration, forever.

**WHY IT LIVES HERE AND NOT IN `plan/`:** the original was
`plan/MIGRATION_LOG.md`, but `plan/` is gitignored (`.gitignore:241`), so the log
was never actually committed and could not serve its purpose. This copy is the
tracked one. A log nobody can read is the same as no log.

**Enforced by:** `tests/test_migration_chain.py` (chain integrity and the
expected head). A new migration that is not reflected in `EXPECTED_HEAD` fails CI.

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
| `0012` | `0011` | `0012_consent_and_signals.py` | POPIA: user_consents (audit) + improvement_signals (no content) | 2026-09-29 |
| `0013` | `0012` | `0013_refresh_tokens.py` | refresh_tokens: revocable sessions, rotation + replay detection | 2026-10-03 |
| `0014` | `0013` | `0014_bursaries.py` | bursaries table + (is_active, closes) and unique (name, provider) | 2026-10-23 |

## Rules for a new migration

1. **Next number, next chain.** Read the head from `alembic heads`, never guess.
2. **Additive only** unless there is no alternative. A new column on an existing
   table must be nullable or carry a server default, or `upgrade head` fails on
   a populated database.
3. **Test the downgrade.** `alembic downgrade <previous>` must work. The bursary
   migration was verified both ways before commit.
4. **Update `EXPECTED_HEAD`** in `tests/test_migration_chain.py` in the same
   commit, or CI fails.
5. **Add the row here** in the same commit.
