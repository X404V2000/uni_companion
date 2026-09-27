# Reconciliation v2 — Fix CI + restore reverted work

**Branch:** `chore/reconcile-develop-v2`
**Date:** 18 September 2026
**Report to:** Senior Systems Design & Architecture Engineer
**Report from:** Lead Developer
**Status:** Ready for review; predicted to turn `main` CI green and restore reverted features.

---

## 0. One-paragraph summary

CI on `main` was red because the pytest `pythonpath` fix (`2189b35`) was never
merged — PR #11 only carried its sibling (the exporter psycopg fix). The red CI
then triggered two panicked reverts (Day 1 admin materials, and the Week 1 Day 5
sync-security fix), neither of which actually fixed CI. This branch, built off
the real `origin/main` (`f17d423`), merges the missing pytest fix, reverts both
reverts (restoring Day 1 AND the clock-skimming security fix), and re-applies
the analytics + Day 2 work. Full suite: **238 passed / 0 failed**; ruff clean;
drift gate `[PASS]` from a clean shell (31 routes).

---

## 1. Root cause (evidence-based)

| Fact | Finding |
| :--- | :--- |
| CI on `main` tip `f17d423` | "Lint, Migrate & Test" → **failure** |
| Day 1 merge `f4c3618` CI | same failure |
| Day 1 revert `0ac97e8` CI | **still failure** (revert did not fix CI) |
| `2189b35` (pytest `pythonpath`) on main | ❌ absent |
| `pyproject.toml` on main has `pythonpath` | ❌ no |

The failing step is `pytest -q` in the "Lint, Migrate & Test" job. Without
`pythonpath = ["."]`, `tests/conftest.py`'s `from app.core.config import settings`
raises `ModuleNotFoundError: No module named 'app'` → exit code 4 → job red. The
exporter psycopg fix (`721a9a7`) was merged, but its second commit (`2189b35`,
the pytest fix) was not — so CI stayed red, and the two reverts were cosmetic
reactions that never addressed the actual cause.

---

## 2. What this branch does (in order)

1. `8a64beb` — merge `2189b35` (pytest `pythonpath`) — **fixes CI**.
2. `87d92ef` — `git revert 0ac97e8` — **restore Day 1 admin materials**
   (it was reverted only because it made the pre-existing CI red visible).
3. `5f12edf` — merge `f830a0c` — analytics `share_conversion_rate` fix.
4. `59d9773` — merge `77c0c20` — Day 2 bulk materials import.
5. `bc80ee2` — `git revert a5f54d5` — **restore Week 1 Day 5 sync security fix**
   (clock-skimming clamp: far-future `updated_at` coerced, absurd `due_date`
   rejected). This is a real security hole, not just a feature.
6. `9addfd1` — pin env defaults in `check_contract_drift.py` (the sibling of the
   exporter that was still crashing from a clean shell).

Final tip: `9addfd1`.

---

## 3. Verification

| Check | Result |
| :--- | :--- |
| `ruff check app/ tests/ scripts/` | Pass |
| Full test suite (fresh ephemeral Postgres 15) | **238 passed, 0 failed** |
| `export_openapi.py` from clean shell (no env) | 31 routes |
| `check_contract_drift.py` from clean shell (no env) | `[PASS]` |
| Migration chain | 0006 → 0007 → 0008 → 0009 contiguous |
| Merge conflicts | None |

---

## 4. Why `git revert <revert>` instead of re-merging

The Day 1 commit (`a53ec09`) is already in `main`'s *history* (via PR #12) but
its *content* was reverted (PR #13). `git merge a53ec09` therefore reports
"Already up to date." `git revert 0ac97e8` semantically reverses the revert,
restoring the content with a clean, auditable "Reapply" commit. Same for the
Week 1 Day 5 security fix (`git revert a5f54d5`).

---

## 5. What this does NOT do (deliberate)

- Does **not** rewrite `main`/`develop` (no force-push). This is a PR-ready
  branch for review.
- Does **not** change the `main`→`develop` relationship; `develop` is still a
  stale `22be127` and is a separate decision.

---

## 6. Recommended next steps

1. Open a PR from `chore/reconcile-develop-v2` → `main`. CI should go green on
   the PR (the pytest fix is now in).
2. After merge, optionally fast-forward `develop` to the new `main` (or adopt a
   `develop`-first workflow going forward).
3. Then cut Day 3 (coverage analytics + `(module_code, url)` index `0010`) off
   the new tip.

---

## 7. Open items (not blocking)

- Shared `conftest.py` truncation fixture (systemic test-isolation fix) — still
  recommended by Day 5.
- The `(module_code, url)` index (migration `0010`) — Day 3's scope.
