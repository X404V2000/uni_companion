# Hackathon features — build spec (Friday 23 – Sunday 25 October 2026)

**Decision:** two features, built Friday to Sunday.
**Founder chose:** bursary recommendations **+** a smart study plan **+** bursary
deadlines shown in the same planner as academic deadlines.

Read `AGENTS.md` first. This document records the design decisions so that Friday
is execution, not re-deciding. Where a choice is arguable, it says why.

---

## The story these two features tell

One sentence, which is what a judge remembers:

> **Varsity Companion puts every deadline in a student's life — assignments and
> funding applications — in one place, and tells them what to do first.**

That is a stronger story than "a study app with a bursary tab". Both features
serve the existing promise (`AGENTS.md` §1): *a student must not be blocked the
night a deadline is due* — and **a missed NSFAS deadline blocks a student for a
year**, not a night.

---

## Features at a glance

| # | Feature | What the student sees | Depends on |
|---|---|---|---|
| F1 | Bursary recommendations | "3 bursaries match you. NSFAS closes 31 Jan." | existing `User.university/field_of_study/year_of_study` |
| F2 | Smart study plan | "3 deadlines this week, ~9 hours of work. Start with *COS132 Prac 3*." | existing `academic_tasks.due_date/weight_percentage` |
| F3 | One planner | Bursary + academic deadlines in the same list | F1, F2 |

**Build order: F1 → F2 → F3.** F3 is small once F1 and F2 exist. If time runs out,
F1 alone is a complete feature, so build the one that can stand alone first.

---

# F1 — Bursary recommendations

## Where the data comes from (decide this first; it drives everything)

There is **no public API for South African bursaries.** NSFAS, corporates and
universities each publish on their own site. Scraping dozens of sites is not a
two-day job, breaks constantly, and is legally murky.

**Decision: a curated seed of real bursaries, committed to the repository.**

- 25–40 entries covering the common cases: NSFAS, Funza Lushaka (teaching),
  Sasol, Anglo American, Transnet, Nedbank, Investec, Standard Bank, Absa,
  Allan Gray, SETA funds, and the major universities' own funding.
- **Every entry stores the official application URL.** We never host or copy the
  bursary's content beyond a short description; we point at the source. That
  keeps us accurate when they change terms, and keeps the legal surface tiny.
- Seeded by a migration (`0014`) or an idempotent `scripts/seed_bursaries.py`.
  **Prefer the seed script** — bursary data is content, not schema, and it will be
  edited more often than the schema changes.

**Do not invent bursaries.** If an entry cannot be verified against a real page,
it does not ship. A wrong deadline here costs a student a year.

### Verified reachability of the seed sources (checked 2026-10-21)

| Site | Status |
|---|---|
| sasolbursaries.com | 200 |
| nsfas.org.za | 200, but **serves an incomplete certificate chain** (DigiCert Thawte G1 intermediate missing) |
| funzalushaka.doe.gov.za | same certificate problem |

The NSFAS / Funza Lushaka failure is *their* misconfiguration: browsers recover by
caching the intermediate certificate, strict HTTP clients do not. Consequences:

1. **Do not run these URLs through a strict URL validator** in the seed script - it
   will report them dead when they are fine. Verify by opening them in a browser.
2. If we later add a "is this link alive" job for bursaries, it must tolerate an
   incomplete chain for this specific host, or it will silently drop the single
   most important bursary in South Africa.


## Schema

```python
class Bursary(Base):
    __tablename__ = "bursaries"

    id            uuid PK
    name          str(255)            # "NSFAS"
    provider      str(255)            # "Department of Higher Education"
    description   text                # 1-2 sentences, plain language
    url           str(500)            # OFFICIAL application page
    # Matching fields - nullable means "open to anyone"
    fields_of_study   ARRAY[str]|null # ["computing", "engineering"]
    levels            ARRAY[str]|null # ["undergraduate", "postgraduate"]
    institutions      ARRAY[str]|null # ["university", "tvet"] or specific names
    min_year          int|null        # 1..N
    max_year          int|null
    citizen_only      bool            # SA citizenship required
    application_opens   date|null
    application_closes  date|null     # THE important one
    is_active         bool = True
    created_at, updated_at
```

Use `ARRAY` only if PostgreSQL is guaranteed (it is: Neon). Otherwise a JSON
column. Keep it simple — arrays are readable and this is a small table.

## Matching — reuse what already exists

`app/services/material_ingest_service.py` gained `score_candidate()` /
`rank_candidates()` on 2026-10-21. **Do not write a second scoring system.**
Bursary matching is the same shape: score each bursary against the student, keep
above a threshold, sort, return.

Rules (each worth points; a bursary with a **failed hard requirement** is excluded
outright, not just down-ranked):

| Rule | Effect |
|---|---|
| `citizen_only` and student is not SA | **exclude** |
| student's `year_of_study` outside `[min_year, max_year]` | **exclude** |
| closes before today | **exclude** (do not show dead links) |
| `fields_of_study` matches `User.field_of_study` | +2 |
| `institutions` matches `User.university` type | +1 |
| `levels` matches (undergraduate/postgraduate from `year_of_study`) | +1 |
| closes within 30 days | +1 (urgency is relevance) |

**Ordering:** score DESC, then `application_closes` ASC (soonest first at equal
score). Deterministic — same student, same order, every time.

## API

```
GET /api/v1/bursaries/matches      -> { items: [...], total }
GET /api/v1/bursaries/{id}         -> detail
```

Auth required. Scoped to the caller; no admin surface for the hackathon.

Response per item: `id, name, provider, description, url, closes_on,
days_left, match_reasons: [str]`.

**`match_reasons` is the feature.** A list with no explanation is a magic box.
"Matches your field (Computing) and you are in year 2" is what makes a student
believe the recommendation.

## UI

New tab **Bursaries** (or a section under Home if the tab bar is full — it is
currently at four with Settings elsewhere; adding a fifth nav item is acceptable
for the hackathon but check the 390px layout).

Per card: name, provider, **"Closes in 12 days"** in the danger colour when under
14 days, the match reason, and a **"Apply on {provider} site →"** link that opens
the official page in a new tab.

Empty state must be honest: if nothing matches, say so and offer to see all
active bursaries rather than showing a blank screen.

---

# F2 — Smart study plan (workload forecast)

## The idea

Students do not ask "what is due?" — the dashboard already answers that. They ask
**"can I actually get through this week?"**

## The maths (keep it explainable)

No ML. A transparent estimate the student can argue with:

```
hours_for_task = base_hours(task_type) * weight_factor(weight_percentage)
working_days_left = business days between today and due_date
total_hours_this_week = sum(hours_for_task for tasks due in the next 7 days)
```

Suggested base hours by `task_type` (a small lookup, tuned later):

| type | base hours |
|---|---|
| QUIZ / TEST | 2 |
| ASSIGNMENT | 4 |
| PRACTICAL | 5 |
| PROJECT | 10 |
| EXAM | 12 |

`weight_factor` = 1.0 when `weight_percentage` is null; otherwise scale mildly
(0.75 at 10%, 1.0 at 25%, 1.25 at 50%+) and **clamp to [0.5, 2.0]** so one 100%
assessment cannot dwarf everything.

Then a **priority score per task**, which produces the "start with this" ordering:

```
urgency   = 1 / max(1, days_until_due)          # soonest first
impact    = weight_percentage or default(25)
effort    = hours_for_task
priority  = (urgency * impact) / sqrt(max(1, effort))
```

Return the **top 3 in order** with a one-line reason for each:
*"Due in 2 days, worth 40% — start tonight."*

**State the assumption in the UI.** "Based on an estimate of 4 hours per
assignment" — so a student can correct it mentally and still trust the tool.

## API

```
GET /api/v1/study-plan           -> { week: {...}, focus: [top 3], assumption_note }
```

No new tables. This is a read over `academic_tasks`.

## UI

A card at the top of **Home** (above Deadlines):

> **This week: about 9 hours of work across 3 deadlines.**
> 1. COS132 — Prac 3 · due in 2 days · worth 15% → *start tonight*
> 2. ...

Tap a row → Planner. If there is nothing due, the card does not render at all
(no "0 hours" noise).

---

# F3 — One planner

Add bursary closing dates to the Planner as read-only entries with type
`BURSARY`. They are **not** `academic_tasks` (they belong to no module) — query
them separately and merge into the same list, sorted by date.

Mark them visually (badge "BURSARY") so a student never mistakes a funding
deadline for a module deadline. No completion state — you cannot "finish" a
bursary; the apply link is the action.

---

# Order of work, Friday → Sunday

| Slot | Work |
|---|---|
| Fri AM | F1 schema + migration `0014` + seed script with 10 real bursaries |
| Fri PM | F1 matching + `/bursaries/matches` + tests (mirror `test_material_relevance.py`) |
| Sat AM | F1 UI: Bursaries tab, cards, match reasons, empty state |
| Sat PM | F2 `/study-plan` + tests + Home card |
| Sun AM | F3 merge bursary deadlines into Planner |
| Sun PM | **Full regression** (see below) + remaining bursaries seeded + APK build |

## Definition of done for each

- A test that **fails before the code and passes after** (project rule §4.4)
- `ruff check app/ tests/ scripts/` clean, `tsc --noEmit` clean, build succeeds
- Verified in a browser at 390px against the deployed API, not just locally
- API call evidence captured in the handoff

## Sunday regression — do not skip

The app was fully fixed on Wednesday. **Every feature added after that can undo
something.** Before the demo, re-run the Wednesday walkthrough:

1. Signup → first-run guide → add module → module card opens Materials
2. Materials fetch returns results
3. Deadline add → appears on Home
4. Planner renders, Settings opens, delete-account confirms
5. Fonts still render with Google blocked

## What NOT to do in these two days

- **No new npm/pip packages** without asking (project rule §4.2). Everything here
  is standard library, SQLAlchemy and React.
- **No ML model.** See `DEC-0008`.
- **Do not scrape bursary sites.** Curate the seed; link to the official page.
- **Do not touch the token/refresh machinery.** It was fixed this week.
