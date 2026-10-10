# archive/ — preserved from `university_helper`

**Why this directory exists.** Two repositories held this project. All shipping work now
lives in `uni_companion`, and `university_helper` is being archived. Before freezing it, the
two were compared file by file to find anything that existed only there.

Ninety-seven files did. This directory holds the 49 worth keeping.

**This is not the current codebase.** Nothing here is imported, built, or deployed. It is
kept because it records ideas and decisions that are otherwise only readable inside a frozen
repository's branches — and because deleting it would make the comparison impossible to
repeat if we ever ask the same question again.

---

## `old-typescript-backend/` — 29 files

A second, complete application: **Express + Prisma + TypeScript**, written before the backend
was rewritten in Python/FastAPI. It was never migrated, and it is not coming back. It lives
on `university_helper`'s `frontend` branch.

Kept because it contains **feature work that has no equivalent in the shipping stack**:

| File | What it did |
|---|---|
| `src/algorithms/gradeEngine.ts` | grade calculation |
| `src/algorithms/scheduleEngine.ts` | timetable scheduling |
| `src/algorithms/spacedRepetitionEngine.ts` | flashcard learning intervals |
| `src/algorithms/searchEngine.ts` | material search |
| `src/ui-flashcards.ts` | flashcard interface |
| `src/ui-grades.ts` | grade tracking |
| `src/ui-pomodoro.ts` | study timer |
| `src/ui-timetable.ts` | timetable view |
| `src/services/deadlineReminderWorker.ts` | reminder delivery |
| `src/security/rateLimiter.ts`, `sanitizer.ts` | hardening |
| `prisma/schema.prisma` | a full data model |

**These are ideas, not dependencies.** If flashcards or grade tracking are ever built for
ScrapyMog, read these first rather than starting from nothing — but rewrite them against the
Python stack, since none of this can be reused directly.

---

## `plan-reports/` — 20 files

Planning documents and day reports that were **never tracked in `uni_companion`**, because
`plan/` was deliberately purged from that repository. They come from `university_helper`'s
`demo` branch.

They are the historical record of how the backend was scoped and built: the data-collection
framework, the migration log, the week-by-week setup documents, and the RAG provenance audit.

**Kept as reference, not as instructions.** Several describe a repository state from months
ago, and the setup documents name paths that no longer exist.

---

## What was deliberately NOT copied

| Skipped | Why |
|---|---|
| `new_frontend_layout/` (45 files) | **Strictly older** than `frontend/`. Verified: zero files unique to it, every differing file newer in `frontend/` |
| `frontend/pnpm-lock.yaml` | Stale lockfile; the project builds with npm |
| `frontend/university_suite_frontend.zip` | A 27-file export of the old frontend, dated 25 September |
| `migrations/0001_*.sql` | Superseded by the Alembic chain |

---

## How this was found

The comparison was mechanical, not by eye:

```
files on ANY university_helper branch, minus files on master   ->  183
  minus files tracked in uni_companion                          ->   97
    of which source rather than cache or snapshot               ->   49
```

The first attempt compared only `master`, which would have missed all of this: the
TypeScript backend lives on `frontend`, and the plan archive on `demo`. **Checking one branch
would have produced a confident and wrong "nothing is missing".**
