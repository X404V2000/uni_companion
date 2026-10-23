# Varsity Companion

An AI study companion for South African university students. Summarise lecture
material, find curated study resources per module, plan deadlines, and detect
which modules are at academic risk — built to work on low-data, intermittent
connections.

This repository contains the **product** (backend + web client). It is separate
from the hackathon submission repository.

> **New here? Read `docs/PROJECT_HISTORY.md` first.** It records what exists, why
> each decision was made, the bugs already fixed so they are not reintroduced, and
> how the live deployment is wired.

---

## What it does

| Feature | Description |
|---|---|
| **AI summaries** | Upload a PDF/DOCX/PPTX, paste text, or give a link. Long documents are chunked and merged rather than truncated, so a 60-page guide is covered in full. |
| **Find materials** | Ranked search over a curated, per-module resource library (articles, journals, PDFs, YouTube). Deterministic relevance tiers — no black box. |
| **Chat with your brief** | Ask questions about your own uploaded document, with answers grounded in and citing that document. |
| **Planner** | Modules, deadlines, and priority/weight tracking. |
| **At-risk detection** | Flags tasks at risk from deadline proximity, weighting, and workload clustering. |
| **Module recommendations** | AI reads a module *name* and suggests what to study next and where to find it. |
| **POPIA compliance** | Consent tracking, soft delete, and hard purge on request. |

---

## Stack

- **Backend** — FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, PostgreSQL 15
- **Frontend** — React 19, TypeScript, Vite, Tailwind
- **AI** — Google Gemini (summaries, recommendations, brief Q&A)
- **Auth** — JWT (HS256), bcrypt password hashing, RBAC (STUDENT / ADMIN / SUPERUSER)

No paid infrastructure is required to run it locally.

---

## Quick start

### 1. Database

```bash
docker run -d --name vc_pg \
  -e POSTGRES_USER=app_user \
  -e POSTGRES_PASSWORD=app_password \
  -e POSTGRES_DB=varsity_companion_dev \
  -p 5544:5432 \
  postgres:15-alpine
```

### 2. Backend

```bash
python3 -m venv venv
source venv/bin/activate
pip install -e .

cp .env.example .env
# then edit .env and set JWT_SECRET_KEY and DATABASE_URL (and GEMINI_API_KEY
# if you want AI features to work)

alembic upgrade head
uvicorn app.main:app --reload
```

API docs: <http://127.0.0.1:8000/docs>

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Running the tests

The suite is **self-sufficient** — it sets its own test defaults, so it runs on a
fresh clone with no `.env`:

```bash
pytest
```

By default it targets a local PostgreSQL on port 5544 named
`varsity_companion_test`. Override with `TEST_DATABASE_URL` if your setup differs:

```bash
TEST_DATABASE_URL="postgresql+psycopg://user:pass@host:port/varsity_companion_test" pytest
```

**Safety guard:** the suite refuses to run against any database whose name does
not end in `_test`, so a misconfigured URL can never point tests at real data.

---

## Migrations

All schema changes go through Alembic. The chain must stay linear.

```bash
alembic upgrade head          # apply
alembic downgrade -1          # reverse one
alembic current               # what is applied
```

**Every commit that touches `alembic/versions/` must add a row to
[`plan/MIGRATION_LOG.md`](plan/MIGRATION_LOG.md)**, and update `EXPECTED_HEAD` in
`tests/test_migration_chain.py`.

`tests/test_migration_chain.py` enforces this: it fails on duplicate revision
ids, dangling parents, multiple heads, or an unexpected head. That test exists
because a duplicate revision id once nearly shipped — nothing else in the suite
would have caught it, since the app imports fine and the damage only appears when
someone builds a database.

---

## Project layout

```
app/
  api/v1/         route handlers (auth, academic, ai, materials, admin, …)
  core/           config, security, rate limiting, sanitisation, roles
  db/             engine + session
  models/         SQLAlchemy ORM models
  schemas/        Pydantic request/response contracts
  services/       business logic (the bulk of the system)
alembic/versions/ schema migrations (see MIGRATION_LOG.md)
tests/            469 tests
frontend/         React client
scripts/          operational tooling (bring-up, seeding, contract export)
docs/             generated OpenAPI contract
plan/             architecture blueprints and reports
```

---

## Development conventions

- **`ruff`** must pass: `ruff check app/ tests/ scripts/`
- **OpenAPI contract is frozen.** After changing a route or schema:
  ```bash
  python scripts/export_openapi.py        # writes docs/openapi.json itself
  python scripts/check_contract_drift.py  # must print [PASS]
  ```
  Do **not** redirect stdout — `> docs/openapi.json` corrupts the file, because
  the script prints progress to stdout *and* writes the file.
- **No new dependencies without justification.** The project is deliberately
  lightweight for low-data users.

---

## Security notes

- Never commit `.env`. It is gitignored; `.env.example` holds placeholders only.
- Secrets are read from the environment, never hard-coded.
- Materials are **global curated content**; the academic tracker is per-user and
  tenant-isolated. `tests/test_week3_isolation_audit.py` asserts both, so the
  semantics cannot drift by accident.
- All `/admin/*` routes require ADMIN or SUPERUSER, audited across the full
  admin surface by that same test file.

---

## Licence

[**PolyForm Noncommercial 1.0.0**](LICENSE) — free to read, study, modify, and use
for any noncommercial purpose, including personal projects, research, and
teaching. **All commercial rights are reserved.**

GitHub lists this as "Other" because it is not in their licence library; the
file above is the authoritative text.
