-- ====================================================================
-- MIGRATION: 0001_initial_schema.sql (UP)
-- Description: Creates and provisions users, courses (modules), and academic deadlines (tasks)
-- Target: PostgreSQL 14+ / Neon Serverless Postgres
-- ====================================================================

-- 1. Enable Cryptographic UUID Generator
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create Users Table
CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "hashed_password" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(255),
    "university" VARCHAR(120) NOT NULL DEFAULT 'University of the Witwatersrand',
    "field_of_study" VARCHAR(150) DEFAULT 'BSc Computer Science',
    "year_of_study" INTEGER DEFAULT 1,
    "terms_version" VARCHAR(50) DEFAULT '1.0',
    "privacy_version" VARCHAR(50) DEFAULT '1.0',
    "accepted_at" TIMESTAMPTZ(6) DEFAULT clock_timestamp(),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "role" VARCHAR(50) NOT NULL DEFAULT 'student',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "deleted_at" TIMESTAMPTZ(6) NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
CREATE INDEX IF NOT EXISTS "ix_users_active" ON "users"("is_active") WHERE "deleted_at" IS NULL;

-- 3. Create Courses / Modules Table
CREATE TABLE IF NOT EXISTS "modules" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "color_code" VARCHAR(7) NOT NULL DEFAULT '#3b5b8c',
    "department" VARCHAR(100),
    "faculty" VARCHAR(100),
    "dp_subminimum" DOUBLE PRECISION NOT NULL DEFAULT 40.0,
    "syllabus_description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "deleted_at" TIMESTAMPTZ(6) NULL,
    CONSTRAINT "uq_user_module_code" UNIQUE ("user_id", "code")
);

ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "department" VARCHAR(100);
ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "faculty" VARCHAR(100);
ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "dp_subminimum" DOUBLE PRECISION NOT NULL DEFAULT 40.0;
ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "syllabus_description" TEXT;
ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(6) NULL;

CREATE INDEX IF NOT EXISTS "ix_modules_user_id" ON "modules"("user_id");
CREATE INDEX IF NOT EXISTS "ix_modules_user_code" ON "modules"("user_id", "code");

-- 4. Create Academic Deadlines / Tasks Table
CREATE TABLE IF NOT EXISTS "academic_tasks" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "module_id" UUID NOT NULL REFERENCES "modules"("id") ON DELETE CASCADE,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "task_type" VARCHAR(20) NOT NULL DEFAULT 'ASSIGNMENT',
    "due_date" TIMESTAMPTZ(6) NOT NULL,
    "priority" VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
    "weight_percentage" NUMERIC(5, 2),
    "grade_achieved" NUMERIC(5, 2),
    "max_grade" NUMERIC(5, 2) NOT NULL DEFAULT 100.0,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMPTZ(6) NULL,
    "reminder_sent" BOOLEAN NOT NULL DEFAULT false,
    "estimated_hours" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE "academic_tasks" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "academic_tasks" ADD COLUMN IF NOT EXISTS "reminder_sent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "academic_tasks" ADD COLUMN IF NOT EXISTS "estimated_hours" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "ix_academic_tasks_user_status_due" ON "academic_tasks"("user_id", "is_completed", "due_date");
CREATE INDEX IF NOT EXISTS "ix_academic_tasks_module_due" ON "academic_tasks"("module_id", "due_date");
CREATE INDEX IF NOT EXISTS "ix_academic_tasks_due_date" ON "academic_tasks"("due_date");
CREATE INDEX IF NOT EXISTS "ix_academic_tasks_user_priority" ON "academic_tasks"("user_id", "priority");

-- 5. Interoperability Views (Ensures query compatibility across courses & academic_deadlines)
CREATE OR REPLACE VIEW "courses" AS
    SELECT 
        "id",
        "user_id",
        "code",
        "name",
        "department",
        "faculty",
        "color_code",
        "dp_subminimum",
        "syllabus_description",
        "created_at",
        "updated_at",
        "deleted_at"
    FROM "modules";

CREATE OR REPLACE VIEW "academic_deadlines" AS
    SELECT 
        "id",
        "user_id",
        "module_id" AS "course_id",
        "title",
        "description",
        "task_type",
        "due_date",
        "priority",
        "weight_percentage",
        "grade_achieved",
        "max_grade",
        "is_completed",
        "completed_at",
        "reminder_sent",
        "estimated_hours",
        "created_at",
        "updated_at"
    FROM "academic_tasks";
