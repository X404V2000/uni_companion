## Monday — **Project foundation + database connection**
Set up the FastAPI project structure (folders for routes, models, schemas, core config), environment variable handling (.env + .gitignore configured correctly from commit one), and the connection to your Neon Postgres instance via SQLAlchemy. Nothing user-facing yet — this is the skeleton everything else attaches to.

## Tuesday — **User data model**
Define the User table (SQLAlchemy model) and matching Pydantic schemas for validation. This includes the fields for consent capture (timestamp, consent version) since that needs to exist at the schema level before signup logic is written, not bolted on after.

## Wednesday — **Signup endpoint**
Build the actual registration flow: input validation, bcrypt password hashing, consent capture written to the DB, and the account creation logic. This is the first endpoint you'll be able to test with real requests.

## Thursday — **Login, JWT, and rate limiting**
Login endpoint issuing JWT access/refresh tokens via httpOnly secure cookies, a dependency for protecting routes (checking "is this user authenticated"), and rate limiting on both signup and login endpoints to blunt brute-force attempts.

## Friday — **Logging, account deletion, and pulling it together**
Structured logging middleware (request correlation IDs, redaction of sensitive fields, rotating log files), a basic account deletion endpoint (your POPIA right-to-delete baseline), and a pass to make sure Monday through Thursday's pieces work together as one coherent flow — this is what you'll actually review Saturday.
