### Week 3 Architectural Blueprint — Core Student Domain & Academic Engine

**Project:** Varsity Companion API

**Target Window:** Month 1, Week 3

**Focus:** Academic Tracker Core (Modules, Timetables, Assignments) & Query Mechanics

**Evaluator:** Senior Systems Design & Architecture Engineer

**Status:** **Week 3 Scope Active / Architectural Plan Ready**

---

### 1. Executive Summary & Week 3 Goals

With Week 1 & 2 complete—delivering identity, auth, Alembic migrations, RBAC, email service, and POPIA hard-purge engines—Week 3 transitions the backend into its **primary domain model: The Academic Tracker Engine**.

By the end of Week 3, the backend will expose complete CRUD functionality, filtering, and local notification triggers for a student's academic life.

```
┌──────────────────────────────────────────────────────────┐
│                   Student API Client                     │
└────────────────────────────┬─────────────────────────────┘
                             │ (Authenticated Request)
                             ▼
┌──────────────────────────────────────────────────────────┐
│             FastAPI Routers (/api/v1/academic)            │
│  - /modules    - /timetable    - /assignments            │
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│               Academic Service Layer                     │
│  (app/services/academic_service.py - Multi-tenant isolation)│
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│           SQLAlchemy Models & Alembic 0003                │
│    (modules ──< timetables / assignments ──< reminders)  │
└──────────────────────────────────────────────────────────┘

```

---

### 2. Relational Schema Design (Alembic Revision `0003_academic_tracker`)

All academic entities must enforce **strict user-level tenant isolation** using foreign key constraints (`user_id` mapped to `users.id` with `ON DELETE CASCADE`).

```sql
-- 1. Modules Entity
CREATE TABLE modules (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,            -- e.g., "INF315"
    name VARCHAR(255) NOT NULL,           -- e.g., "Systems Analysis"
    color_code VARCHAR(7) DEFAULT '#2563eb', -- UI display color hex
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_user_module_code UNIQUE (user_id, code)
);

-- 2. Timetable Entries
CREATE TABLE timetable_slots (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1=Monday, 7=Sunday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    venue VARCHAR(100) NULL,              -- e.g., "Centenary 2"
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 3. Assignments & Exams
CREATE TABLE academic_tasks (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    task_type VARCHAR(20) NOT NULL DEFAULT 'ASSIGNMENT', -- ASSIGNMENT, EXAM, TEST, QUIZ
    due_date TIMESTAMPTZ NOT NULL,
    priority VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',       -- LOW, MEDIUM, HIGH, CRITICAL
    weight_percentage NUMERIC(5, 2) NULL,                 -- e.g., 15.00%
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Indexes for performance
CREATE INDEX ix_timetable_user_day ON timetable_slots (user_id, day_of_week);
CREATE INDEX ix_tasks_user_due ON academic_tasks (user_id, is_completed, due_date);

```

---

### 3. Day-by-Day Implementation Roadmap

#### **Monday — Domain Models & Alembic Migration (`0003`)**

* **Task:** Implement SQLAlchemy ORM models (`Module`, `TimetableSlot`, `AcademicTask`) in `app/models/academic.py`.
* **Migration:** Generate and apply Alembic revision `0003_add_academic_tracker_schema`.
* **Validation:** Verify clean forward upgrade and backward downgrade scripts against `varsityCompanion_Db` and test DBs.

#### **Tuesday — Service Layer & Module Management (`ModuleService`)**

* **Task:** Build `app/services/academic_service.py` handling `Module` operations.
* **Security Control:** Enforce tenant scope across all DB queries (`filter(Module.user_id == current_user.id)`).
* **Endpoints:**
* `POST /api/v1/academic/modules` (Create module)
* `GET /api/v1/academic/modules` (List user modules)
* `DELETE /api/v1/academic/modules/{module_id}` (Delete module)



#### **Wednesday — Timetable Management & Schedule Grid**

* **Task:** Implement scheduling logic and conflict checks.
* **Service Methods:** Slot validation (ensure `end_time > start_time`).
* **Endpoints:**
* `POST /api/v1/academic/timetable` (Add class slot)
* `GET /api/v1/academic/timetable` (Fetch weekly schedule grid sorted by `day_of_week` and `start_time`)



#### **Thursday — Task & Assignment Deadline Tracker**

* **Task:** Build task tracking logic with automated status toggles.
* **Features:** Priority sorting, overdue calculations, weight tracking, completion marking.
* **Endpoints:**
* `POST /api/v1/academic/tasks` (Log assignment/exam)
* `PATCH /api/v1/academic/tasks/{task_id}/complete` (Mark finished)
* `GET /api/v1/academic/tasks` (Query active vs. completed tasks)



#### **Friday — Unified Filtering, Pagination, & Test Suite Expansion**

* **Task:** Add unified pagination (`page`, `size`) and query parameters (`module_id`, `priority`, `from_date`, `to_date`).
* **Quality Assurance:** Expand test suite by 15+ new unit and endpoint integration tests (targeting 95+ passing tests total).



---

### 4. File Implementation Map for Week 3

```
alembic/versions/
└── 0003_add_academic_tracker_schema.py   # Schema migration for modules, timetable, tasks
app/
├── api/
│   └── v1/
│       └── academic.py                    # Academic Tracker HTTP endpoints
├── models/
│   └── academic.py                    # SQLAlchemy ORM models (Module, Slot, Task)
├── schemas/
│   └── academic.py                    # Pydantic input/output validation schemas
├── services/
│   └── academic_service.py            # Isolated domain business logic
tests/
└── test_academic_tracker.py           # Endpoint and service layer unit tests

```

---

