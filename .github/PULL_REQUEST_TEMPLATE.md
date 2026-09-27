## Summary

<!-- One or two sentences on what this PR changes and why. -->

## Checklist

- [ ] Branch is off `develop` (not another feature branch)
- [ ] `ruff check app/ tests/ scripts/` passes
- [ ] Full test suite passes locally
- [ ] `python scripts/export_openapi.py` was run **without** stdout redirect
      (the script prints progress to stdout *and* writes the file, so
      `> docs/openapi.json` corrupts it)
- [ ] `python scripts/check_contract_drift.py` returns `[PASS]`
- [ ] No new packages installed (or: listed below with justification)

## Migrations

- [ ] This PR does **not** touch `alembic/versions/`

  **OR**

- [ ] This PR touches `alembic/versions/` **and** a row has been added to
      `plan/MIGRATION_LOG.md`
- [ ] `tests/test_migration_chain.py::test_head_is_expected` was updated if the
      head changed

> Why this matters: on Week 3 Day 3, a migration was specified as `0010` when
> `0010` was already taken. Nothing in the suite would have caught the resulting
> broken chain — the app imports and every test passes; the damage only appears
> when someone runs `alembic upgrade head`. The log and the chain tests exist to
> make that class of surprise impossible.

## Notes for the architect

<!-- Anything the reviewer should know: deviations from the blueprint, traps
     found by running the code, or follow-ups discovered along the way. -->
