# Day 2 (Tuesday) — User Model + Consent Fields

## What this delivers
The "users" table definition — including POPIA consent tracking — plus
the validation rules for what a signup request must look like. No
signup/login LOGIC yet (that's Wednesday/Thursday); today just defines
the shape of the data.

## 1. Files to copy into your existing repo
Copy these into your `varsity-companion/` project, replacing the
existing versions where they already exist:

```
varsity-companion/
├── app/
│   ├── main.py              <- REPLACE (adds table creation on startup)
│   ├── core/
│   │   └── legal.py         <- NEW
│   ├── models/
│   │   ├── __init__.py      <- REPLACE (now imports User)
│   │   └── user.py          <- NEW
│   └── schemas/
│       └── user.py          <- NEW
```

`core/config.py` and `db/session.py` from Monday are unchanged — leave
them as they are.

## 2. Run it
```
uvicorn app.main:app --reload
```

Watch the terminal output on startup. Because of the `lifespan` change
in `main.py`, the app will now create the `users` table in Neon
automatically the moment it starts, if that table doesn't already exist.

## 3. Confirm the table was actually created
This is the real test for today. You have two easy options:

**Option A — Neon's dashboard (no extra tools needed):**
Go to your Neon project → find the "Tables" or "SQL Editor" section →
you should now see a `users` table listed, with all the columns from
`models/user.py` (id, email, hashed_password, consent_given, etc.).

**Option B — SQL Editor query:**
In Neon's SQL Editor, run:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'users';
```
You should see a row for every field defined in `models/user.py`.

## 4. What's NOT built yet (on purpose)
- No way to actually create a user yet through the API — `UserCreate`
  only defines what VALID input would look like, nothing calls it yet.
- No password hashing logic yet — `hashed_password` exists as a column,
  but nothing writes to it until Wednesday.
- No endpoints added to main.py for users — Wednesday adds the actual
  signup route that uses today's schema and model together.

## 5. Known limitation, stated plainly
`Base.metadata.create_all()` (used in `main.py`) only creates tables
that don't exist yet — it will NOT alter the `users` table automatically
if you change `models/user.py` after the table already exists in Neon.
This is fine while there's no real data to protect, but before this app
has real users, we'll introduce a proper migration tool (Alembic) so
schema changes can happen safely without risking existing data.
