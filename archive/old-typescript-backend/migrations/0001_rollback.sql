-- ====================================================================
-- MIGRATION: 0001_rollback.sql (DOWN)
-- Description: Cleanly drops views, tables, and types created in 0001
-- ====================================================================

-- 1. Drop compatibility views
DROP VIEW IF EXISTS "academic_tasks";
DROP VIEW IF EXISTS "modules";

-- 2. Drop tables with cascade
DROP TABLE IF EXISTS "analytics_events" CASCADE;
DROP TABLE IF EXISTS "peer_study_packs" CASCADE;
DROP TABLE IF EXISTS "ai_summaries" CASCADE;
DROP TABLE IF EXISTS "flashcards" CASCADE;
DROP TABLE IF EXISTS "flashcard_decks" CASCADE;
DROP TABLE IF EXISTS "assignment_briefs" CASCADE;
DROP TABLE IF EXISTS "study_materials" CASCADE;
DROP TABLE IF EXISTS "timetable_slots" CASCADE;
DROP TABLE IF EXISTS "academic_deadlines" CASCADE;
DROP TABLE IF EXISTS "courses" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

-- 3. Drop custom enumeration types
DROP TYPE IF EXISTS "RiskLevel";
DROP TYPE IF EXISTS "ResourceType";
DROP TYPE IF EXISTS "SlotType";
DROP TYPE IF EXISTS "TaskPriority";
DROP TYPE IF EXISTS "TaskType";
