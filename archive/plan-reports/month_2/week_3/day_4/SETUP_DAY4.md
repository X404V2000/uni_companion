# Day 4 Blueprint — Search Relevance Upgrade

**Branch:** `month2/week3-day4-relevance` off `develop`
**Baseline:** head `0011`
**No migration** — this is a pure application-layer day.
**Prerequisite:** Day 3 approved. Unpushed commits from Day 3 should be pushed first (founder action, §12.2 of Day 3's report).

---

## §0. Scope

Replace the current `ILIKE`-only materials search with **ranked results**. The search stays retrieval-first — no LLM, no embeddings, no external APIs. The ranking is a **deterministic scoring rule** that a reviewer can read and understand.

**In scope:**
- Add a `relevance_score` field to `MaterialResponse`.
- Add a `sort` query param: `relevance` (default), `recent`, `title`.
- Compute the score in the service layer.
- Stable sort — ties broken deterministically.
- ~8 new tests.

**Out of scope:**
- Embeddings / vector search
- LLM synthesis
- Cross-module search
- Search analytics
- Frontend changes

---

## §1. Technical Objectives

1. **Deterministic relevance scoring** — same input, same output, always.
2. **Backward-compatible default** — `sort` defaults to `relevance`, but the response shape stays backward-compatible (existing fields unchanged; new field added).
3. **Bounded and indexed** — the query still leads with `module_code` (via `ix_materials_module_type`) and remains O(log N + M log M).
4. **No new packages.** Stdlib only.
5. **Stable sort** — `score DESC, updated_at DESC, id ASC`. The `id` tiebreaker is mandatory (this is the lesson from Day 3's §5.2).

---

## §2. Architectural Strategy

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    RANKED MATERIALS SEARCH                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Request: GET /materials/search?module_code=INF154&q=loops&sort=relevance│
│                                                                          │
│  Pipeline:                                                               │
│    1. Filter by module_code (index: ix_materials_module_type)            │
│    2. Filter by is_approved = true (existing behavior)                   │
│    3. If q provided:                                                     │
│         a. Pull candidate rows (module-scoped; bounded)                  │
│         b. Score each row using the rule (below)                         │
│         c. Drop rows with score < MIN_SCORE (only when q was given)      │
│    4. Apply sort:                                                        │
│         relevance → score DESC, updated_at DESC, id ASC                  │
│         recent    → updated_at DESC, id ASC                              │
│         title     → title ASC, id ASC                                    │
│    5. Paginate: offset/limit                                              │
│    6. Return paginated envelope                                           │
│                                                                          │
│  Relevance scoring rule (deterministic, case-insensitive):               │
│    score =                                                               │
│      100  if title.lower() == q.lower()                                  │
│       80  if title.lower().startswith(q.lower())                         │
│       60  if q.lower() in title.lower()                                  │
│       40  if q.lower() in description.lower()                            │
│       20  if q.lower() in resource_type.lower()                          │
│        0  otherwise                                                      │
│                                                                          │
│    Rows with score == 0 are excluded from results when q is provided.    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Why this shape:**

- **Deterministic, not learned.** A judge or reviewer can read the rule and predict the output. That's a feature, not a limitation.
- **Bounded.** The candidate set is already module-scoped; the score is O(1) per row. Total cost stays O(log N + M log M) where M is the module's material count.
- **Additive.** Existing clients that don't pass `sort` get `relevance` by default, but the fields they already use are unchanged. No breaking changes.

---

## §3. File Implementation Map

| File Path | Action | Purpose |
|---|---|---|
| `app/schemas/material.py` | **UPDATED** | Add `relevance_score: int` to `MaterialResponse` |
| `app/services/material_service.py` | **UPDATED** | Extend `search_materials_paginated` with scoring + `sort` |
| `app/api/v1/materials.py` | **UPDATED** | Add `sort` query param |
| `tests/test_materials_search_relevance.py` | **NEW** | ~8 tests |
| `docs/openapi.json` | **REGENERATED** | Drift gate |

**No new packages. No migration. No new tables.**

---

## §4. Step-by-Step Developer Guide

### §4.1 Schema (`app/schemas/material.py`)

Find `MaterialResponse`. Add one field:

```python
class MaterialResponse(BaseModel):
    id: uuid.UUID
    module_code: str
    title: str
    description: str | None = None
    url: str
    resource_type: Literal["YOUTUBE", "JOURNAL", "PDF", "ARTICLE"]
    quality_resolution: str
    relevance_score: int = 0   # NEW — 0 when no query was provided
```

**Why `= 0` default:** when the caller doesn't pass `q`, there is nothing to score against. Returning 0 is honest. The field still exists in the schema, so clients can rely on it consistently.

### §4.2 Service (`app/services/material_service.py`)

Two changes:

**Change 1 — Add a scoring helper at module level:**

```python
# Relevance score tiers. Higher = more relevant. Deterministic.
_SCORE_EXACT_TITLE = 100
_SCORE_TITLE_PREFIX = 80
_SCORE_TITLE_CONTAINS = 60
_SCORE_DESCRIPTION_CONTAINS = 40
_SCORE_RESOURCE_TYPE = 20
_SCORE_NONE = 0

def _score_material(material: StudyMaterial, q_lower: str) -> int:
    """
    Deterministic relevance score. q_lower must already be lowercased.
    Time: O(len(title) + len(description)).
    """
    title_lower = (material.title or "").lower()
    if title_lower == q_lower:
        return _SCORE_EXACT_TITLE
    if title_lower.startswith(q_lower):
        return _SCORE_TITLE_PREFIX
    if q_lower in title_lower:
        return _SCORE_TITLE_CONTAINS

    description_lower = (material.description or "").lower()
    if q_lower in description_lower:
        return _SCORE_DESCRIPTION_CONTAINS

    if q_lower in (material.resource_type or "").lower():
        return _SCORE_RESOURCE_TYPE

    return _SCORE_NONE
```

**Change 2 — Extend `search_materials_paginated`:**

Replace the existing function with:

```python
def search_materials_paginated(
    db: Session,
    module_code: str,
    query_str: str | None = None,
    resource_type: str | None = None,
    sort: str = "relevance",
    page: int = 1,
    size: int = 20,
) -> dict:
    """
    Retrieves paginated study materials bounded by module code and search keywords.

    Time:  O(log N + M log M) where M = the module's material count.
    Space: O(M) for the candidate list, bounded by corpus size for one module.

    sort:
      "relevance" (default) — score DESC, updated_at DESC, id ASC
      "recent"              — updated_at DESC, id ASC
      "title"               — title ASC, id ASC
    """
    page = max(1, page)
    size = max(1, min(size, 100))

    query = db.query(StudyMaterial).filter(
        StudyMaterial.module_code == module_code.upper(),
        StudyMaterial.is_approved.is_(True),
    )
    if resource_type:
        query = query.filter(StudyMaterial.resource_type == resource_type)

    # Pull candidates. Module-scoped, so bounded by that module's corpus.
    candidates = query.all()

    # Score + filter when q is provided
    q_lower = (query_str or "").strip().lower()
    scored: list[tuple[StudyMaterial, int]] = []
    if q_lower:
        for m in candidates:
            s = _score_material(m, q_lower)
            if s > _SCORE_NONE:
                scored.append((m, s))
    else:
        scored = [(m, 0) for m in candidates]

    # Sort
    if sort == "recent":
        scored.sort(key=lambda t: (t[0].updated_at, str(t[0].id)), reverse=True)
    elif sort == "title":
        scored.sort(key=lambda t: ((t[0].title or "").lower(), str(t[0].id)))
    else:  # "relevance" default
        scored.sort(
            key=lambda t: (t[1], t[0].updated_at, str(t[0].id)),
            reverse=True,
        )

    total = len(scored)
    offset = (page - 1) * size
    page_slice = scored[offset : offset + size]
    pages = (total + size - 1) // size if total > 0 else 1

    # Build response items with the score
    items = []
    for material, score in page_slice:
        # Attach the score so Pydantic can serialize it
        material.relevance_score = score  # type: ignore[attr-defined]
        items.append(material)

    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size,
        "pages": pages,
    }
```

**Note on the `relevance_score` attachment:** SQLAlchemy models are not Pydantic; setting an extra attribute works but is slightly hacky. A cleaner alternative is to return a list of Pydantic `MaterialResponse` objects directly from the service. But that couples the service to the schema layer. **The chosen approach (attach + let Pydantic coerce via `model_config = {"from_attributes": True}`)** matches the existing codebase pattern — the previous `MaterialResponse` already uses `from_attributes`. So this works. If ruff complains, `# type: ignore[attr-defined]` suppresses it.

### §4.3 Router (`app/api/v1/materials.py`)

Find the `search_materials` route. Add the `sort` query param and pass it through:

```python
@router.get(
    "/search",
    response_model=PaginatedResponse[MaterialResponse],
    status_code=status.HTTP_200_OK,
)
def search_materials(
    module_code: str = Query(..., min_length=2, max_length=20),
    q: Optional[str] = Query(default=None, max_length=100),
    resource_type: Optional[Literal["YOUTUBE", "JOURNAL", "PDF", "ARTICLE"]] = Query(default=None),
    sort: Literal["relevance", "recent", "title"] = Query(default="relevance"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return material_service.search_materials_paginated(
        db=db,
        module_code=module_code,
        query_str=q,
        resource_type=resource_type,
        sort=sort,
        page=page,
        size=size,
    )
```

**Why `Literal` on `sort`:** Pydantic validates it — an invalid value returns 422. The `Literal` list is the single source of truth.

### §4.4 Tests (`tests/test_materials_search_relevance.py`)

Eight tests:

1. `test_default_sort_is_relevance` — no `sort` param → results ordered by score DESC
2. `test_exact_title_match_ranks_first` — seed title match + partial matches → exact wins
3. `test_title_prefix_beats_contains` — "Loops Intro" beats "Intro to Loops" for `q=loops`
4. `test_title_contains_beats_description` — title match ranks above description match
5. `test_relevance_score_present_in_response` — every item has `relevance_score`
6. `test_sort_recent_orders_by_updated_at` — `sort=recent` ignores score
7. `test_sort_title_orders_alphabetically` — `sort=title` sorts by title
8. `test_no_query_returns_all_module_materials` — `q` absent → all module rows, `relevance_score=0`

**Deterministic tie test (bonus, worth adding):** two materials with the same score → the one with the more recent `updated_at` ranks first; if same time, by `id`.

---

## §5. Time/Space Complexity Audit

| Component | Time | Space | Safeguard |
|---|---|---|---|
| Fetch candidates | O(log N + M) | O(M) | module_code leads via `ix_materials_module_type` |
| Score each candidate | O(1) per row | O(1) per row | string length bounded by schema (title ≤ 255) |
| Sort | O(M log M) | O(M) | stdlib sort, stable |
| Paginate | O(1) | O(size) | slice |
| Response | — | O(P), P ≤ 50 | `size` capped at 50 |

**Total:** O(log N + M log M). For a single module's corpus (typically ≤ 500 rows), this is microseconds. Well within any scale we'll see for a year.

**Why not SQL-level scoring:** a `CASE WHEN` in SQL could push the scoring into the DB. But the rule has multiple tiers and readability matters more than a few microseconds. If a future day shows this is a bottleneck (it won't), it can move to SQL.

---

## §6. Security & Scale Guarantees

| Guarantee | Mechanism |
|---|---|
| Auth required | `get_current_user` (existing) |
| Bounded query length | `q` max 100 (existing) |
| Bounded response | `size` max 50 (existing) |
| No injection | No string interpolation into SQL; scoring is Python-side on already-fetched rows |
| No PII | Response fields unchanged |
| Deterministic | Score is a pure function of (material, q) |
| Stable sort | `id` as final tiebreaker |
| Backward compatible | Existing fields unchanged; new field additive |

---

## §7. Acceptance Criteria

1. `GET /materials/search` without `sort` → results ordered by relevance score DESC.
2. `sort=relevance`, `sort=recent`, `sort=title` all accepted; anything else → 422.
3. Exact title match ranks above prefix match; prefix above contains; contains above description.
4. Rows with score 0 excluded when `q` provided.
5. `q` absent → all approved module materials returned, each with `relevance_score=0`.
6. Response items include `relevance_score` as an integer.
7. Ties broken by `updated_at` DESC, then `id` ASC — stable across calls.
8. Existing filters (`module_code`, `resource_type`, pagination) still work.
9. `docs/openapi.json` regenerated; drift gate `[PASS]`.
10. 8+ new tests pass; full suite no regressions.
11. `ruff check app/ tests/ scripts/` clean.
12. **No new packages. No migration.**

---

## §8. Verification Steps

```bash
# 1. Lint + new tests
ruff check app/ tests/ scripts/
pytest tests/test_materials_search_relevance.py -v

# 2. Full suite
pytest -q

# 3. Drift gate (NO stdout redirect — the script writes the file itself)
python scripts/export_openapi.py
python scripts/check_contract_drift.py     # [PASS]

# 4. Manual smoke (fixture user + a module with materials)
curl -s "http://127.0.0.1:8000/api/v1/materials/search?module_code=INF154&q=loops" \
  -H "Authorization: Bearer $TOKEN" | jq '.items[] | {title, relevance_score}'

curl -s "http://127.0.0.1:8000/api/v1/materials/search?module_code=INF154&sort=recent" \
  -H "Authorization: Bearer $TOKEN" | jq '.items[0].title'
```

---

## §9. Defect-Discovery Prompts

> Run it, don't just read it.

- **Results are unsorted despite `sort=relevance`** → the sort key on tuples of mixed types (int, datetime, str) may behave unexpectedly; ensure the key is a uniform tuple. The `reverse=True` on the relevance branch reverses the whole tuple, which reverses `id` too — **this is a bug.** Fix: sort ascending by `(-score, -updated_at.timestamp(), str(id))` OR sort descending by score with a reverse-sorted tie. **Verify explicitly with a tie-test.**
- **`relevance_score` missing from response** → the schema field wasn't added, or Pydantic ignored the attached attribute. Confirm `from_attributes = True` is set on `MaterialResponse`.
- **Excluding score-0 rows removes rows the user expects** → if `q` matches the resource type but not the title, the row scores 20 and is kept. If it matches nothing at all, it's dropped. Verify against the rule in §2.
- **`sort=title` returns mixed case order** → the sort key uses `title` not `title.lower()`. Fix.
- **Pagination total is wrong** → `total` must be `len(scored)` **after** filtering, not before.
- **Two identical materials return in different order across calls** → missing `id` tiebreaker.
- **`q` with trailing spaces behaves differently** → `q_lower = query_str.strip().lower()`. The strip must happen.

**The first prompt is the important one.** Tuple-sort with `reverse=True` and mixed tuple types is a subtle trap. Test 4 in the list (`test_title_contains_beats_description`) will catch it if the test is written with equal-score-but-different-updated_at rows. **Make sure the tests exercise ties.**

---

## §10. Sign-Off Checklist

- [ ] `relevance_score: int = 0` added to `MaterialResponse`
- [ ] `_score_material` helper added to `material_service.py`
- [ ] `search_materials_paginated` accepts `sort` and uses deterministic scoring
- [ ] `sort` query param added to router with `Literal["relevance", "recent", "title"]`
- [ ] Score-0 rows excluded only when `q` is provided
- [ ] Sort tiebreakers: score DESC, updated_at DESC, id ASC (verify with test)
- [ ] `q` absent → all module rows returned with score 0
- [ ] 8+ tests added, including a tie-breaking test
- [ ] `docs/openapi.json` regenerated; drift gate `[PASS]`
- [ ] Full suite no regressions
- [ ] `ruff check` clean
- [ ] **No new packages. No migration.**
- [ ] Branch: `month2/week3-day4-relevance` off `develop`

---

## §11. Optional Bundles

**Bundle (prevent subtle bugs):**
- **§11.1** — Add `test_tie_breaks_by_updated_at_then_id` explicitly. The tuple-sort trap is real.
- **§11.2** — Add `test_score_zero_rows_excluded_only_when_query_present` — verifies the exclusion is conditional.

**Defer:** search analytics, search suggestion/autocomplete, synonym expansion, fuzzy matching.

**Recommendation: bundle both.** ~30 lines total, both prevent classes of bugs the blueprint's §9 flags.

---
