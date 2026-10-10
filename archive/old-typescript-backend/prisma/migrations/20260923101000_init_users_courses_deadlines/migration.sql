-- ====================================================================
-- Initial Migration: Users, Courses (Modules), and Academic Deadlines (Tasks)
-- Target: PostgreSQL 14+ / Neon Serverless Postgres
-- Schema Alignment: prisma/schema.prisma & Live DB Compatibility
-- ====================================================================

-- 1. Enable Cryptographic UUID Generator
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create Users Table if not present
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

-- Ensure newly added columns exist if table was pre-existing
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

-- Ensure newly added columns exist if table was pre-existing
ALTER TABLE "academic_tasks" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "academic_tasks" ADD COLUMN IF NOT EXISTS "reminder_sent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "academic_tasks" ADD COLUMN IF NOT EXISTS "estimated_hours" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "ix_academic_tasks_user_status_due" ON "academic_tasks"("user_id", "is_completed", "due_date");
CREATE INDEX IF NOT EXISTS "ix_academic_tasks_module_due" ON "academic_tasks"("module_id", "due_date");
CREATE INDEX IF NOT EXISTS "ix_academic_tasks_due_date" ON "academic_tasks"("due_date");
CREATE INDEX IF NOT EXISTS "ix_academic_tasks_user_priority" ON "academic_tasks"("user_id", "priority");

-- 5. Timetable Slots
CREATE TABLE IF NOT EXISTS "timetable_slots" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "module_id" UUID NOT NULL REFERENCES "modules"("id") ON DELETE CASCADE,
    "day_of_week" SMALLINT NOT NULL CHECK ("day_of_week" BETWEEN 1 AND 7),
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "venue" VARCHAR(120),
    "slot_type" VARCHAR(20) NOT NULL DEFAULT 'LECTURE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS "ix_timetable_user_schedule" ON "timetable_slots"("user_id", "day_of_week", "start_time");
CREATE INDEX IF NOT EXISTS "ix_timetable_module" ON "timetable_slots"("module_id");

-- 6. Study Materials
CREATE TABLE IF NOT EXISTS "study_materials" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "module_code" VARCHAR(20) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "resource_type" VARCHAR(50) NOT NULL DEFAULT 'SUMMARY',
    "url" VARCHAR(1024) NOT NULL,
    "file_size_kb" INTEGER NOT NULL DEFAULT 50,
    "is_offline_cached" BOOLEAN NOT NULL DEFAULT true,
    "quality_resolution" VARCHAR(50),
    "is_approved" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID NULL REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS "ix_materials_module_type" ON "study_materials"("module_code", "resource_type");

-- 7. Assignment Briefs
CREATE TABLE IF NOT EXISTS "assignment_briefs" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "module_id" UUID NOT NULL REFERENCES "modules"("id") ON DELETE CASCADE,
    "assignment_title" VARCHAR(255) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "raw_extracted_text" TEXT NOT NULL,
    "total_marks" DOUBLE PRECISION,
    "weight_percentage" DOUBLE PRECISION,
    "due_date" TIMESTAMPTZ(6) NOT NULL,
    "risk_level" VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    "parsed_data_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS "ix_briefs_user_due" ON "assignment_briefs"("user_id", "due_date");
CREATE INDEX IF NOT EXISTS "ix_briefs_module" ON "assignment_briefs"("module_id");

-- 8. Flashcard Decks & Cards (SuperMemo SM-2)
CREATE TABLE IF NOT EXISTS "flashcard_decks" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "module_code" VARCHAR(20) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "color_code" VARCHAR(7) NOT NULL DEFAULT '#3b5b8c',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS "ix_decks_user_module" ON "flashcard_decks"("user_id", "module_code");

CREATE TABLE IF NOT EXISTS "flashcards" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "deck_id" UUID NOT NULL REFERENCES "flashcard_decks"("id") ON DELETE CASCADE,
    "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "hint" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT '{}',
    "interval" INTEGER NOT NULL DEFAULT 0,
    "ease_factor" DOUBLE PRECISION NOT NULL DEFAULT 2.5 CHECK ("ease_factor" >= 1.3),
    "repetition" INTEGER NOT NULL DEFAULT 0,
    "next_review_date" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "last_reviewed_at" TIMESTAMPTZ(6) NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS "ix_flashcards_deck_due" ON "flashcards"("deck_id", "next_review_date");
CREATE INDEX IF NOT EXISTS "ix_flashcards_user_due" ON "flashcards"("user_id", "next_review_date");

-- 9. Peer Study Packs & QR Sharing
CREATE TABLE IF NOT EXISTS "peer_study_packs" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "author_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "share_code" VARCHAR(32) NOT NULL UNIQUE,
    "title" VARCHAR(255) NOT NULL,
    "module_code" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "pack_payload" JSONB NOT NULL,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS "ix_study_packs_code" ON "peer_study_packs"("share_code");

-- 10. Interoperability Views: courses & academic_deadlines
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
