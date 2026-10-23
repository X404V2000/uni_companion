# FNB Hackathon — feature architecture and integration plan

**Scope:** two features, built Friday 23 – Sunday 25 October 2026.
**Audience:** the engineer building them, and the founder planning time and money.

Companion documents: `docs/HACKATHON_FEATURES.md` (what to build),
`AGENTS.md` (non-negotiables).

---

## 1. The one rule: nothing existing may change to make a new thing work

The system works today and was repaired on 2026-10-21. The risk in adding
features is not that the new code fails — it is that it **breaks something that
already worked**. Every decision below is chosen for reversibility.

Three mechanical guarantees:

| Guarantee | How |
|---|---|
| **Revertible in one commit** | Each feature is additive. Deleting its files, router line and tab entry removes it completely with no residue. |
| **Invisible until ready** | New endpoints exist before any UI calls them. New screens are reached from a new tab; nothing else changes. |
| **Cannot break a working path** | No change to `app/lib` token handling, refresh logic, auth, or existing queries. Where existing code must be *reused*, it is imported, never edited. |

**The single highest-risk action** is editing a file that already works. The plan
below edits only **three** existing files, and each edit is one line:

1. `app/models/__init__.py` — add one import (migrations need models registered)
2. `app/main.py` — add two router lines
3. `frontend/src/App.tsx` — add one tab entry, one render block, one card

Everything else is **new files**.

---

## 2. Component map

```
┌───────────────────────────── NEW: BURSARY VERTICAL ─────────────────────────────┐
│                                                                                  │
│  app/models/bursary.py          Bursary table             [NEW]                  │
│  app/schemas/bursary.py         Request/response shapes   [NEW]                  │
│  app/services/bursary_service.py  matching + scoring      [NEW]                  │
│  app/api/v1/bursaries.py        GET /bursaries/matches    [NEW]                  │
│  scripts/seed_bursaries.py      25-40 curated entries     [NEW]                  │
│  alembic/versions/0014_*.py     create table              [NEW]                  │
│                                                                                  │
│  frontend/src/components/BursariesTab.tsx                 [NEW]                  │
│  frontend/src/lib/bursaryApi.ts                           [NEW]                  │
└──────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────── NEW: STUDY PLAN VERTICAL ──────────────────────────────┐
│                                                                                  │
│  app/schemas/study_plan.py      response shape            [NEW]                  │
│  app/services/study_plan_service.py  hours + priority     [NEW]   (no table)     │
│  app/api/v1/study_plan.py       GET /study-plan           [NEW]                  │
│                                                                                  │
│  frontend/src/components/StudyPlanCard.tsx                [NEW]                  │
└──────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────── TOUCHES EXISTING CODE ───────────────────────────────┐
│  app/models/__init__.py      +1 import                                           │
│  app/main.py                 +2 router lines                                     │
│  frontend/src/App.tsx        +1 tab, +1 render block, +1 card                    │
│  alembic head                0013 -> 0014 (single new revision)                  │
│  docs/openapi.json           REGENERATED  <-- CI fails if forgotten              │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Mobile is out of scope for the hackathon.** The Expo app duplicates these
screens separately. Building a bursary screen twice in a weekend is how Saturday
is lost; the web app is what the judge sees. Note it as follow-up work.

---

## 3. Component breakdown

### C1 — `app/models/bursary.py` [NEW]

The only new table.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | matches project convention |
| `name`, `provider` | String | "NSFAS", "Department of Higher Education" |
| `description` | Text | 1–2 plain sentences |
| `url` | String(500) | **official application page** |
| `fields_of_study` | JSON | null = open to all |
| `levels` | JSON | null = open to all |
| `institutions` | JSON | null = open to all |
| `min_year`, `max_year` | Integer | null = any year |
| `citizen_only` | Boolean | default false |
| `application_opens`, `application_closes` | Date | closes is the important one |
| `is_active` | Boolean | soft retire without deleting |
| `created_at`, `updated_at` | timestamptz | project convention |

Use **JSON, not ARRAY**, for the list fields.

Checked 2026-10-23: **no model currently uses JSON or ARRAY** — every list-like
field in the existing schema is a plain `String`. So there is no house precedent
to follow, and this is one of the few genuinely new things in the feature. Use
`sqlalchemy.JSON` (portable, no import from the postgres dialect beyond what
`analytics.py` already does for `UUID`) and keep the columns nullable: a `NULL`
means "open to everyone", which is the most common case and must not require a
sentinel value.

**Blast radius if wrong:** none. A new table cannot affect existing queries.

### C2 — `alembic/versions/0014_bursaries.py` [NEW]

`down_revision = "0013"`. Creates one table, one index on
`(is_active, application_closes)` because the match query filters on both.

**Must be additive.** No `ALTER` on any existing table. If a change to an existing
table feels necessary, stop — that is a design smell for a weekend feature.

**Rollback:** `alembic downgrade 0013` drops only the new table.

### C3 — `app/services/bursary_service.py` [NEW]

Pure functions plus one query. **No FastAPI imports** — testable without a server.

```
load_active(db)                        -> list[Bursary]
eligible(b, user, today)               -> bool      (hard requirements)
score(b, user, today)                  -> (float, list[str])   score + reasons
rank(bursaries, user, today)           -> list[(Bursary, score, reasons)]
```

Reuses the **shape** of `material_ingest_service.score_candidate()` — same idea,
separate function. Do not import that one; it carries ingestion concerns.

Hard exclusions (not down-ranking — a dead bursary in the list destroys trust):
closed, wrong year, wrong citizenship level.

**Blast radius:** a new module nothing imports yet. Zero risk until wired.

### C4 — `app/api/v1/bursaries.py` [NEW]

```
GET /api/v1/bursaries/matches   auth required, returns items + match_reasons
GET /api/v1/bursaries/{id}      auth required
```

Follow `admin.py`/`auth.py`: `limiter.limit("30/minute")` on the list endpoint,
`Depends(get_current_user)`, response models from `app/schemas/bursary.py`.

### C5 — `scripts/seed_bursaries.py` [NEW]

Idempotent upsert keyed on `(name, provider)`. `--dry-run` supported.

**Rules:**
- Every entry verified against a real page **by a human in a browser**.
- **Never invent a deadline.** An unverified entry does not ship.
- NSFAS and Funza Lushaka serve an incomplete TLS chain — a strict URL validator
  reports them dead when they are fine. Do not validate those hosts
  programmatically.

### C6 — `frontend/src/lib/bursaryApi.ts` [NEW]

Thin wrapper over the existing `api()` helper. **Imports `api()`; never edits it.**
The token/refresh machinery was repaired this week and is out of bounds.

### C7 — `frontend/src/components/BursariesTab.tsx` [NEW]

Self-contained: fetches its own data, owns its own loading/empty/error states,
same visual language as `MaterialsTab`. Takes `notify` as a prop and nothing else.

**Why standalone:** it shares no state with existing tabs, so it cannot cause a
re-render storm elsewhere. This is the same mistake the module cards had (a
placeholder callback), and the isolation prevents repeating it.

### C8 — `app/services/study_plan_service.py` [NEW, NO TABLE]

Reads `AcademicTask` — **read-only**, no writes, no schema change.

```
estimate_hours(task)   -> float
priority(task, today)  -> float
build_plan(tasks, today) -> (weekly_hours, top_3_with_reasons, assumption_note)
```

Deterministic; the assumption is returned in the payload so the UI can show it.

**Blast radius:** a read-only module. Cannot corrupt data even if wrong.

### C9 — `app/api/v1/study_plan.py` [NEW]

`GET /api/v1/study-plan` — auth required, returns the plan. No query parameters
for the hackathon; scope creep lives there.

### C10 — `frontend/src/components/StudyPlanCard.tsx` [NEW]

Rendered inside `OverviewTab`. If the API fails or returns nothing due, the card
**renders nothing at all** — a broken feature must look absent, never broken.

### C11 — Existing-file edits (the only risky part)

| File | Change | Why it is safe |
|---|---|---|
| `app/models/__init__.py` | `from app.models.bursary import Bursary` + `__all__` | Needed for Alembic autogenerate to see the table |
| `app/main.py` | 2 import lines + 2 `include_router` lines | Additive registration, same pattern as the other eight |
| `frontend/src/App.tsx` | tab entry, render block, `<StudyPlanCard />` | Additive; existing branches untouched |

**Every one of these is reverted by deleting the added lines.**

---

## 4. Order of work and why

Strict build order, each step leaves the system deployable:

| Step | Change | State after |
|---|---|---|
| 1 | Table + migration ×1 | deployable, feature invisible |
| 2 | Service + tests (no router) | deployable, invisible |
| 3 | Router + OpenAPI regen | deployable, API callable, no UI |
| 4 | Seed 10 bursaries | deployable, data exists |
| 5 | UI tab | **feature 1 complete** |
| 6 | Study plan service + router + tests | deployable, invisible |
| 7 | Home card | **feature 2 complete** |
| 8 | Planner merge | **both linked** |

If the weekend stops at any step, the site is still working.

---

## 5. The three things that will actually break CI

Found by reading `.github/workflows/ci.yml`, not guessed:

| Gate | What breaks it | Fix |
|---|---|---|
| **OpenAPI contract sync** | Adding endpoints without regenerating | `python scripts/export_openapi.py docs/openapi.json` and commit |
| **Alembic upgrade head** | A migration that does not apply to an empty DB | Test locally against Postgres before pushing |
| **Image < 150 MB** | Adding a heavy dependency | None needed — this plan adds **zero** packages |

The OpenAPI gate is the most likely to bite: it is easy to forget and the failure
is a diff, not an obvious error.

---

## 6. What it costs

**Verified 2026-10-23:** every module these features import
(sqlalchemy, sqlalchemy.orm, fastapi, pydantic, datetime, uuid, decimal, logging)
is already installed in the project environment. Nothing new to add.

**Money: R0.**

| Item | Cost | Why |
|---|---|---|
| New dependencies | **R0** | Everything uses Python stdlib, SQLAlchemy, FastAPI, React — all already installed |
| New hosting | **R0** | Same Render service, same Neon database |
| Render instance hours | **R0, but a budget** | Free tier ≈750 h/month. The keep-warm job uses ≈730. **Do not add a second free service** |
| Neon storage | **R0** | ~40 bursary rows is kilobytes |
| Bursary data | **R0** | Public pages, curated by hand. No paid API |
| Apple Developer (iOS) | not required | Android APK only, per `DEC-0006` |

**Engineering time** (one engineer with AI assistance, realistic):

| Feature | Hours | Breakdown |
|---|---|---|
| **F1 Bursaries** | **10–12 h** | schema+migration 1.5 · service+tests 3 · API 1.5 · seed data 2.5 · UI 3 |
| **F2 Study plan** | **5–7 h** | service+tests 2.5 · API 0.5 · card 2 |
| **F3 Planner merge** | **3–4 h** | merge logic 1.5 · UI 1.5 |
| Regression + APK | **4 h** | full walkthrough 1 · APK build/deps 3 |
| **Total** | **22–27 h** | across Friday–Sunday |

That is tight but realistic: roughly 8 h/day for three days.

**The hidden cost is seed data.** Every bursary needs a human to open the real
page and confirm the deadline. 40 entries is ~2.5 h of careful work and it is the
part most likely to be underestimated. **Reduce to 15–20 strong entries if time
presses** — coverage matters less than correctness.

---

## 7. What I would cut first if the weekend runs short

In this order:

1. **Planner merge (F3)** — nicest story, least functional value. Cut first.
2. **Seed size** — 40 → 20 bursaries. The matching still works.
3. **Study plan card** — but keep the API; it can be shown in the video as a curl output if desperate.

**Never cut:** the migration being additive, the tests, or the OpenAPI regen.
Those are what stop the weekend from ending in a broken `main`.

---

## 8. Definition of done for each component

Each component ships only when all four are true:

1. A test that **fails before the code exists** and passes after
2. `ruff check app/ tests/ scripts/` clean · `tsc --noEmit` clean · build succeeds
3. `docs/openapi.json` regenerated if any route changed
4. Verified in a browser at 390px against the **deployed** API — not just locally

And before the demo: re-run the Wednesday walkthrough end to end (signup → guide →
module → materials → deadline → planner → settings → fonts-blocked). Features
added after a fix are the classic way to silently undo it.
