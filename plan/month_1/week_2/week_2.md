# **Week 2 Engineering Blueprint & Execution Plan**

**Project:** Varsity Companion API  
**Target Window:** Month 1, Week 2  
**Focus:** Database Migrations (Alembic), Service Layer Architecture, & Role-Based Access Control (RBAC)

## **1\. Week 2 Technical Objectives**

Now that the identity core and security baseline are complete and live-verified (62 tests passing), Week 2 shifts from raw prototype endpoints to scalable backend architecture.

┌──────────────────────────────────────────────────────────┐  
│                      FastAPI Router                      │  
│            (app/api/v1/ \- Schemas & Auth HTTP)           │  
└────────────────────────────┬─────────────────────────────┘  
                             │  
                             ▼  
┌──────────────────────────────────────────────────────────┐  
│                      Service Layer                       │  
│        (app/services/ \- Pure Business & DB Logic)        │  
└────────────────────────────┬─────────────────────────────┘  
                             │  
                             ▼  
┌──────────────────────────────────────────────────────────┐  
│                    SQLAlchemy Models                     │  
│               (app/models/ \- Data Engine)                │  
└────────────────────────────┬─────────────────────────────┘  
                             │  
                             ▼  
┌──────────────────────────────────────────────────────────┐  
│                   Alembic Migrations                     │  
│           (alembic/ \- Controlled Versioning)             │  
└──────────────────────────────────────────────────────────┘

## **2\. Day-by-Day Implementation Roadmap**

### **Monday — Alembic Integration & Dev-DDL Retirement**

> * **Objective:** Eliminate Base.metadata.create\_all() and manual lifespan ALTER TABLE statements.  
> * **Tasks:**  
  1. Install Alembic and execute alembic init alembic.  
  2. Configure alembic/env.py to import Base.metadata from app.models and read DATABASE\_URL from app.core.config.settings.  
  3. Generate the baseline migration script:  
     alembic revision \--autogenerate \-m "0001\_initial\_user\_schema"  
  4. Remove the lifespan dev DDL (ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted\_at...) from app/main.py.  
  5. Test migration forward and rollback cycles on a local/test database.

### **Tuesday — Service Layer Refactoring (UserService)**

> * **Objective:** Decouple database access and password operations from FastAPI route handlers.  
> * **Tasks:**  
  1. Create app/services/user\_service.py.  
  2. Move ORM operations, bcrypt calls, and DUMMY\_HASH logic out of app/api/v1/auth.py and into reusable methods:  
     * UserService.create\_user(db, user\_in)  
     * UserService.authenticate\_user(db, email, password)  
     * UserService.soft\_delete\_user(db, user, password)  
  3. Keep auth.py strictly focused on Pydantic validation, status codes, and set-cookie headers.

### **Wednesday — Role-Based Access Control (RBAC)**

> * **Objective:** Establish user permission tiers to secure upcoming core domain modules.  
> * **Tasks:**  
  1. Add a role column to the User model using a Python Enum (STUDENT, ADMIN, SUPERUSER) with default STUDENT.  
  2. Generate Alembic revision 0002\_add\_user\_roles.  
  3. Update app/schemas/user.py and app/schemas/auth.py to include roles where appropriate.  
  4. Create a role-checking dependency factory in app/api/deps.py:  
     Python  
     def require\_role(allowed\_roles: list\[UserRole\]):  
         def role\_checker(current\_user: User \= Depends(get\_current\_user)):  
             if current\_user.role not in allowed\_roles:  
                 raise HTTPException(status\_code=403, detail="Operation not permitted")  
             return current\_user  
         return role\_checker

### **Thursday — Email Service Integration (Resend / Brevo)**

> * **Objective:** Connect a free-tier transactional email delivery service without introducing blocking latency.  
> * **Tasks:**  
  1. Add an email client utility in app/core/email.py using Resend or Brevo free tier.  
  2. Implement an asynchronous welcome email trigger upon successful user registration (POST /signup).  
  3. Implement background task execution via FastAPI's BackgroundTasks to prevent HTTP response delays.

### **Friday — POPIA Hard-Purge Job Architecture & Coherence Test Pass**

> * **Objective:** Build the background worker skeleton to permanently remove soft-deleted accounts past the legal retention window.  
> * **Tasks:**  
  1. Create app/services/purge\_service.py:  
     * Query records where is\_active \== False and deleted\_at \<= now() \- timedelta(days=30).  
     * Executing physical DELETE on identified rows.  
  2. Add administrative trigger route POST /api/v1/admin/purge-deleted-users protected by require\_role(\[UserRole.ADMIN\]).  
  3. Expand unit and endpoint test coverage from 62 to 75+ passing tests.

## **3\. Targeted File Structure Additions for Week 2**

alembic/  
├── env.py                       \# Configuration connecting SQLAlchemy metadata & settings  
└── versions/  
    ├── 0001\_initial\_user\_schema.py  
    └── 0002\_add\_user\_roles.py  
app/  
├── core/  
│   └── email.py                 \# Resend/Brevo transactional email dispatcher  
├── services/  
│   ├── \_\_init\_\_.py  
│   ├── user\_service.py          \# Decoupled auth & user CRUD logic  
│   └── purge\_service.py         \# POPIA background hard-purge worker  
└── api/  
    └── v1/  
        └── admin.py             \# Role-gated admin routes

## **4\. Key Security & Architectural Guidelines**

> 1. **Transaction Integrity:** Service layer operations mutating data must execute within explicit DB transactions with IntegrityError handling.  
> 2. **Strict RBAC Enforcement:** Never rely on frontend role checks; all protected endpoints must declare explicit dependency gates via deps.py.  
> 3. **Async Email Safety:** Email failures must be caught gracefully in background threads so failed outbound emails do not roll back successful user registration.

Which area shall we begin with first—setting up the **Alembic migration configuration** or drafting the **UserService decoupling layer**?