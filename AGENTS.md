# AGENTS.md — Varsity Companion

**Read this file first, every session.** It is the single source of truth for what this
project is, how it is laid out, and the rules every agent follows. If this file and another
document disagree, **this file wins**, and you raise the conflict with the Tech Lead.

---

## 1. What this is

**Varsity Companion** — an AI study companion for South African university students.
Course-aware summaries, deadline tracking, a curated study-materials library, and
POPIA-compliant handling of student data. Built for high data costs and intermittent
connectivity.

**The product promise, which every decision serves:**

> *A student must not be blocked the night a deadline is due.*

That promise is the reason for the offline work, the refresh tokens, and the "answer
honestly or say you don't know" rule in the UI.

---

## 2. Live deployment

| Piece | Where | Notes |
|---|---|---|
| Web frontend | `https://uni-companion.scrapymog.workers.dev` | Cloudflare Workers |
| Backend API | `https://uni-companion.onrender.com` | Render (Docker). **Free tier — keep-warm ping active** |
| Database | Neon (`eu-west-2`) | Migration head **`0013`** |
| Mobile | expo-router app in `mobile/` | Expo SDK 57 |

**Render free-tier budget:** the keep-warm ping consumes ~720 of 750 free instance-hours.
**A second Render service exceeds the free tier.** Any proposal to add a service must clear
this budget with the Tech Lead first.

---

## 3. Repository layout

```
app/                    FastAPI application
  api/v1/               routes (auth, academic, ai, materials, analytics, sync, dashboard, admin)
  schemas/              Pydantic v2
  services/             business logic — all real work happens here
  models/               SQLAlchemy 2.0
  core/                 config, security, rate limiting, logging
alembic/versions/       migrations 0001 → 0013 (head: 0013)
tests/                  backend suite (543 tests) — runs against real Postgres
frontend/               React 19 + Vite + Tailwind 4 web client (wired, live)
mobile/                 React Native + Expo client (Thread A)
scripts/                operational scripts (openapi export, drift gate, seeds)
docs/                   API contract, deployment, project history
agents/                 THIS TEAM — roster, briefs, coordination state
conversation/           local coordination notes (gitignored, do not rely on it)
plan/                   founder's archive (gitignored — DO NOT WRITE HERE)
```

**Not in this repo:** `new_frontend_layout/`. Several older planning documents refer to it.
It does not exist; `frontend/` is the web client. If a document says otherwise, the document
is stale — trust the tree.

---

## 4. The rules (non-negotiable)

### 4.1 Git and review

**Changed 2026-10-21 by founder decision: agents and the Tech Lead push directly to
`main`.** No branches, no pull requests. This was chosen because Cloudflare's GitHub
integration deploys from `main`, and the review cycle was costing more than it saved in the
run-up to a fixed deadline.

1. **Commit and push straight to `main`.** Work on a checked-out, up-to-date `main`:
   ```bash
   git fetch origin && git checkout main && git pull --ff-only
   # ... work ...
   git add -A && git commit -m "type(scope): what and why"
   git push origin main
   ```
2. **Still never force-push.** Rewriting shared history on `main` would destroy other
   work. If a push is rejected, pull and re-apply your change — do not force.
3. **One task per commit.** A commit that does three things cannot be reverted cleanly.
   Verify the tree is clean of unrelated edits before committing.
4. **CI runs on every push to `main`** (`.github/workflows/ci.yml`). Check it after
   pushing; a red `main` is now everyone's problem because there is no PR to gate it.
5. **A push to `main` deploys.** Cloudflare builds and publishes the web frontend from
   `main` on every push. A broken commit therefore reaches the live site — verify before
   pushing, not after.
6. **Enable the local hooks in your clone, once:**
   ```bash
   ./scripts/setup_hooks.sh
   ```
   They run `ruff` on staged Python, scan for credentials, and refuse a force-push or a
   remote branch delete. **They no longer block commits to `main`** — that rule was
   reversed on 2026-10-21. The secret scan and ruff checks still apply.
   **GitHub branch protection is unavailable on this private repository** (it requires
   GitHub Pro or a public repo), so these hooks are the only mechanical guard. `--no-verify`
   skips them, so the rule still binds you even when the hook does not. See
   `agents/README.md` §7.

### 4.2 Packages

**Do not install any package, library, or dependency without explicit founder approval.**
Not a dev dependency, not "just a small one", not a type package. If you believe one is
needed, **stop and raise it** (see §5) — the Tech Lead will take it to the founder.

Existing dependencies are fine to use. `playwright` is **not** installed and must not be
added without approval.

### 4.3 Data and security

6. **No raw user content stored.** No lecture notes, no assignment text, no summary inputs.
   Metadata only. This is a POPIA requirement, not a preference.
7. **Every list endpoint is bounded.** Page size ≤ 100.
8. **Every query is index-backed.** No full-table scans in production paths.
9. **Every mutation is tenant-guarded.** Cross-user access returns a generic 404.
10. **Never commit credentials.** No passwords, tokens, keys, or `.env` contents — not in
    code, tests, docs, logs, or commit messages. A test double uses a placeholder, never a
    real value.

### 4.4 Verification

11. **A test that cannot fail is worse than no test.** Before reporting a check as passing,
    **revert the fix and show the check failing.** This rule has caught six real defects on
    this project.
12. **Run it, don't just read it.** Every defect of consequence in this project's history was
    found by executing something.
13. **Test more than one case before concluding.** A single successful run is not a general
    result.
14. **Name the property that is unverified**, not the artefact that is missing. "Blocked:
    device pass" is weaker than "blocked: whether the banner renders on hardware."

### 4.5 Documentation

15. Any change to `alembic/versions/` must add a row to `plan/MIGRATION_LOG.md` — **ask the
    founder to do this**, since `plan/` is gitignored and you cannot commit there.
16. If you change the API contract, regenerate: `python scripts/export_openapi.py`, then
    `python scripts/check_contract_drift.py` must print `[PASS]`.

---

## 5. How you communicate

Agents do not talk to each other directly. They coordinate through **structured JSON files**
in `agents/state/`, which are committed. This exists because prose handoffs are lost,
paraphrased, or forgotten between sessions; JSON is not.

| File | Owner | Purpose |
|---|---|---|
| `agents/state/tasks.json` | Tech Lead | The single task board. Every unit of work has an ID. |
| `agents/state/handoffs.json` | Whoever hands off | Completed work and what depends on it |
| `agents/state/blockers.json` | Whoever is stuck | Questions for the founder or Tech Lead |
| `agents/state/decisions.json` | Tech Lead | Rulings, with reasoning, so they are not re-litigated |

**Rules for the state files:**

- **Read all four at the start of every session.** They are your memory.
- **Append, never delete history.** Mark items `done`/`resolved`; do not remove them.
- **Only the owner writes the file.** Others read.
- **Every entry carries an `id`, an `author`, an ISO-8601 `at` timestamp, and the `task_id`
  it relates to.** No freeform entries.
- **If you are blocked, write to `blockers.json` and stop.** Do not guess past a blocker,
  and do not "work around" a rule in §4 to unblock yourself.

See `agents/README.md` for the schema and the exact workflow.

---

## 6. What the codebase already does (do not rebuild it)

Repeatedly, planning documents have described the repo as it was months ago. Before building
anything, **verify it does not already exist**:

- Auth: login/signup/me/logout with **refresh tokens** (migration `0013`), single-flight
  refresh on both web and mobile.
- Admin: materials CRUD, bulk import with dry-run, coverage analytics.
- AI: chunked map-reduce summaries, brief RAG, recommendations, quota control.
- Materials: search by module code with a **module-name ranking boost**, **YouTube excluded by
  default** behind `INCLUDE_YOUTUBE_DEFAULT`.
- Web: auth guard, dashboard, planner (pessimistic updates, relative due dates), summaries
  (paste + PDF/DOCX upload), materials, network banner, server-side logout.
- Mobile: five tabs, offline staleness banner, blocked offline writes, refresh tokens.

**Six items across two past scopes were already built.** Check first; it costs a minute.

---

## 7. Testing and verification commands

```bash
# Backend
ruff check app/ tests/ scripts/
pytest -q                                   # 543 tests, needs Postgres

# Contract
python scripts/export_openapi.py
python scripts/check_contract_drift.py      # must print [PASS]

# Web
cd frontend && npx tsc --noEmit && npm run build

# Mobile
cd mobile && npx tsc --noEmit && npx jest
```

---

## 8. The team

See `agents/README.md` for the roster, each member's brief in `agents/team/`, and the
machine-readable roster in `agents/org.json`.

**The Tech Lead (Architect) is your first point of contact.** All design decisions, scope
questions, and disagreements go through them. The founder reviews and merges.
