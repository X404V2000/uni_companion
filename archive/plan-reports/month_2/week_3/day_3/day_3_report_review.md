# Day 3 Report — Architectural Review

**Reviewer:** Senior Systems Design & Architecture Engineer
**Date:** 27 September 2026
**Status:** Day 3 **APPROVED** — with one required correction before Day 4

---

## §1. Sign-Off

Day 3 is approved. This is a strong report — arguably the strongest submitted across the whole project. It doesn't just say "done"; it explains *why* each decision was made and *what was caught* when the system was actually run.

**What landed well:**

| Deliverable | Assessment |
|---|---|
| Index `ix_materials_module_url` | Correct — declared on model AND in migration, so they can't drift |
| `/admin/materials/coverage` endpoint | Correct — role-gated, bounded, both invariants hold on live data |
| Route ordering | Handled — `/coverage` above `/{material_id}` |
| 18 tests, 422 full suite | 18 new tests is generous; nothing regressed |
| The two trap catches (§5, §6) | Textbook — both were real and neither was obvious from reading the spec |
| Contract drift gate | `[PASS]` on 41 routes |
| No new packages | Honoured |

**Two catches worth naming explicitly, because they show real engineering judgment:**

1. **Unstable sort (§5.2).** The spec specified `total DESC, module_code ASC`. A naive reader might see the tiebreaker as cosmetic. The report correctly identifies it as *the only thing preventing silent pagination corruption* when totals collide. That's an insight that separates a competent implementation from a mechanical one.

2. **Index test that verifies the column, not the name (§6).** The first version of the test searched the index definition string for `"url"` — and failed, because the *name* `ix_materials_module_url` contains `url` too. Reading `pg_index.indkey` is the correct approach. This is a class of bug (name substring masking column intent) that's easy to miss.

The report also verified the test **fails when the index is dropped** and **passes when restored**. That's how you prove a test isn't passing by luck. Excellent discipline.

---

## §2. The Migration Numbering Deviation — Correct Call, But It Reveals a Gap

The report says:

> *"By implementation time, `0010` was already occupied by `0010_brief_documents_and_chunks.py` (the 'Chat with your brief' RAG tables, added after the spec was authored)."*

**This is a real discovery, and it means my blueprint was built on a stale baseline.** The migration chain I assumed was `0009` → `0010` (this index). The actual chain is `0009` → `0010` (RAG tables) → `0011` (this index).

**The engineer's decision to ship as `0011` is correct.** Reusing `0010` would have been catastrophic — Alembic would fail to resolve the chain, breaking `alembic upgrade head` in every environment.

**But the deeper question is: when was the RAG migration added, and by whom?**

There's no Day in the project plan for "Chat with your brief (RAG)." The feature list document mentions it, but no blueprint was ever written for it. Either:

- **The senior developer added it during his absence** — in which case, good, but I need to know.
- **A previous session's work** was merged without documentation.
- **Some other branch's work** was merged into `develop` without my review.

**This matters because:** if there's unvetted work in the migration chain, the drift-gate and test-coverage assumptions of the last two days are built on a foundation I don't fully know. The full suite passing at 422 suggests it's not broken. But "passing" and "reviewed" aren't the same thing.

**Required action before Day 4:**

Run these three commands and paste the output:

```bash
cd ~/Desktop/projects/university_helper
git log --oneline --all -- alembic/versions/0010_brief_documents_and_chunks.py
```

```bash
git log --oneline --all -- app/models/brief.py app/services/brief_service.py app/api/v1/briefs.py 2>/dev/null | head -20
```

```bash
ls ~/Desktop/projects/university_helper/app/models/ ~/Desktop/projects/university_helper/app/api/v1/ | grep -i brief
```

This tells me: which commit added the RAG work, when, and what files exist. If it was added cleanly with tests and matches the codebase's pattern, we move on. If it was added without review and without tests, we pause Day 4 and audit it first.

---

## §3. The `export_openapi.py` Process Hazard — Already Known, Still Worth Escalating

The report says:

> *"`scripts/export_openapi.py` prints its summary to stdout, so redirecting stdout into the file corrupts it. It must be run without a redirect. The spec's §8 verification block (`... > docs/openapi.json`) would produce a corrupt file if followed literally."*

**This is a real bug in my blueprint, not in the implementation.** The earlier blueprints (Week 2 Day 1) specified the redirect pattern. Later ones did not, but the older ones still exist as documentation and would mislead anyone reading them.

**Required fix (small, post-Day-4):** update every blueprint in `plan/` that contains `export_openapi.py > docs/openapi.json`. Replace with:

```bash
python scripts/export_openapi.py   # writes the file itself; do NOT redirect
```

This isn't a code change. It's a documentation fix. But documentation that misleads is worse than no documentation. I'll add it to the backlog.

---

## §4. Verification Depth

The live verification at §8 is exactly right:

```
summary: {'total_materials': 116, 'approved': 116, 'unapproved': 0,
          'modules_with_materials': 11, 'starved_modules': 0}
invariants: approved+unapproved==total  |  starved==starved_total
by_module page: [('COS132', 14), ('COS212', 14), ('INF154', 14)]
```

Both invariants hold. Ordering is correct. `starved=0` correctly reflects reality. The endpoint works on real data with real edges.

**One small note:** `unapproved: 0` in the live data means all materials are currently approved. That's expected — the fixture seeds approved rows — but it means the "unapproved" branch isn't exercised in the live run, only in tests. The test `test_coverage_summary_counts_correct` covers it, so this is fine. Just noting it.

---

## §5. The Two Outstanding Items

### §5.1 — The mobile question (§12.1)

The report correctly flags:

> *"Day 3 is backend analytics; it contains no mobile work. No mobile scope document exists anywhere in `plan/`."*

**This is correct, and it's on me as architect.** The founder's request to "start building the real mobile software for the MVP" was directed at Day 3's scope. Day 3's scope, as written, had nothing to do with mobile. The engineer correctly implemented the spec as written rather than inventing mobile requirements.

**The mobile scope is next.** Either it belongs to Day 4 (if we pivot) or to a separate blueprint after the backend Week 3 arc closes. My recommendation: **finish the backend Week 3 arc (Day 4: search relevance, Day 5: coherence review), THEN write a dedicated mobile blueprint.**

Rationale: Day 4 (search relevance) makes the materials feature actually useful on mobile, which is where it will be consumed. Day 5's coherence review is small. Both are ~2 days total. Then we pivot to mobile with a clean backend and 10 days of runway.

### §5.2 — The PWA recommendation (§12.1)

The report includes:

> *"Recommendation: for a Sunday pitch, a PWA of the existing app (installable, offline-cached, full-screen) delivers the mobile experience with no second codebase and no new frameworks."*

**This is a strong recommendation and I endorse it as the interim mobile strategy.** The founder's earlier preference was "real mobile app," but the report correctly notes that a PWA gives 80% of the mobile experience for 10% of the work.

**Proposed sequence:**

1. **Next two days:** Backend Day 4 (search relevance) + Day 5 (coherence).
2. **Following two days:** PWA-ify the existing Figma frontend — add manifest, service worker, offline caching. Deploy to Cloudflare Pages. This becomes the "mobile app" for student testing.
3. **Parallel:** Write a proper React Native / Expo blueprint for a future decision. This is the "real mobile app" the founder wants, but it's a bigger lift and not needed for validation.

The PWA validates the concept with students in 4 days. The native app comes later, once the concept has signal.

---

## §6. Day 4 Blueprint — Search Relevance Upgrade

Since the report is approved and the mobile question is deferred, Day 4 stays as planned.

**Objective:** Replace the `ILIKE`-only materials search with ranked results. No LLM. No external APIs. Retrieval-first.

### §6.1 Scope

- Add a `relevance_score` computation to the search query.
- Rank by: exact title match > title contains > description contains > recency tiebreaker.
- Add a `sort` query parameter: `relevance` (default), `recent`, `title`.
- Keep existing filters (`module_code`, `resource_type`, `q`, pagination) unchanged.
- Bound `q` length at 100 chars (already in place).

**In scope:** one service function change, one schema change, ~8 tests.
**Out of scope:** embeddings, vector search, LLM synthesis, external ranking.

### §6.2 The ranking rule (concrete)

```
score = 
    100 if title.lower() == q.lower()
     80 if title.lower().startswith(q.lower())
     60 if title.lower() contains q.lower()
     40 if description.lower() contains q.lower()
     20 otherwise (only included if q matches resource_type or module_code)
```

Sort by `score DESC, updated_at DESC, id ASC` (id as final tiebreaker for stability).

**This is deterministic, testable, and defensible.** A judge or reviewer can read the rule and understand why a result ranks where it does. No black box.

### §6.3 File map

| File | Action |
|---|---|
| `app/services/material_service.py` | UPDATED — `search_materials_paginated` gains `sort` param and relevance scoring |
| `app/schemas/material.py` | UPDATED — response includes `relevance_score` field |
| `app/api/v1/materials.py` | UPDATED — `sort` query param |
| `tests/test_materials_search_relevance.py` | NEW — ~8 tests |
| `docs/openapi.json` | REGENERATED |

### §6.4 Acceptance criteria (draft)

1. Default sort is `relevance`.
2. Exact title match ranks first.
3. `sort=recent` preserves existing behavior (updated_at DESC).
4. `sort=title` sorts alphabetically.
5. Relevance scores are deterministic (same input → same output).
6. Response includes `relevance_score` field per item.
7. Stable sort: ties broken by updated_at, then id.
8. Existing search filters continue to work.
9. No regressions; full suite stays green.
10. No new packages.

Full blueprint in the next message once §2's questions are answered.

---
