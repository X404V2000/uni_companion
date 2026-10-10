/**
 * TypeScript ORM Schema & Relational Types for Varsity Companion
 * Mirrors prisma/schema.prisma for strict compile-time type safety,
 * foreign key integrity, and runtime validations.
 */

// --------------------------------------------------------------------
// ENUMS & CONSTANTS
// --------------------------------------------------------------------
export enum TaskType {
  ASSIGNMENT = "ASSIGNMENT",
  EXAM = "EXAM",
  TEST = "TEST",
  QUIZ = "QUIZ",
  LAB_REPORT = "LAB_REPORT",
  PROJECT = "PROJECT",
}

export enum TaskPriority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum SlotType {
  LECTURE = "LECTURE",
  TUTORIAL = "TUTORIAL",
  PRACTICAL = "PRACTICAL",
  SEMINAR = "SEMINAR",
}

export enum ResourceType {
  SUMMARY = "SUMMARY",
  CHEATSHEET = "CHEATSHEET",
  TUTORIAL = "TUTORIAL",
  PAST_PAPER = "PAST_PAPER",
  TRANSCRIPT = "TRANSCRIPT",
}

export enum RiskLevel {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

// --------------------------------------------------------------------
// ENTITY MODELS
// --------------------------------------------------------------------

/**
 * User Entity - Student profile with tenant boundary
 */
export interface UserEntity {
  id: string; // UUID
  email: string;
  hashed_password?: string;
  university: string; // e.g. "University of the Witwatersrand"
  qualification: string; // e.g. "BSc Computer Science"
  academic_year: number; // 1, 2, 3, 4
  student_number?: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Course / Academic Module Entity
 */
export interface CourseEntity {
  id: string; // UUID
  user_id: string; // Foreign Key -> users.id (ON DELETE CASCADE)
  code: string; // e.g. "COS 212", "INF 214"
  name: string; // e.g. "Data Structures and Algorithms"
  department?: string | null;
  faculty?: string | null;
  color_code: string; // Hex color: "#3b5b8c"
  dp_subminimum: number; // Duly Performed requirement % (e.g. 40.0)
  syllabus_description?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Academic Deadline / Assessment Entity
 */
export interface AcademicDeadlineEntity {
  id: string; // UUID
  user_id: string; // Foreign Key -> users.id (ON DELETE CASCADE)
  course_id: string; // Foreign Key -> courses.id (ON DELETE CASCADE)
  title: string;
  description?: string | null;
  task_type: TaskType;
  due_date: string; // ISO 8601 Timestamp
  priority: TaskPriority;
  weight_percentage?: number | null; // Weight towards course mark (e.g. 15.0%)
  grade_achieved?: number | null; // Score achieved (e.g. 85.0%)
  max_grade: number; // Max possible score (default 100.0)
  is_completed: boolean;
  completed_at?: string | null;
  reminder_sent: boolean;
  estimated_hours?: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Timetable Slot Entity
 */
export interface TimetableSlotEntity {
  id: string; // UUID
  user_id: string; // Foreign Key -> users.id (ON DELETE CASCADE)
  course_id: string; // Foreign Key -> courses.id (ON DELETE CASCADE)
  day_of_week: number; // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
  start_time: string; // "08:00"
  end_time: string; // "08:45"
  venue?: string | null; // "Centenary Building 2"
  slot_type: SlotType;
  created_at: string;
}

/**
 * Study Material Entity (Low-Data Resource Cache)
 */
export interface StudyMaterialEntity {
  id: string;
  course_code: string;
  title: string;
  description: string;
  resource_type: ResourceType;
  url: string;
  file_size_kb: number;
  is_offline_cached: boolean;
  quality_resolution?: string | null; // "360p (Low Data)", "Text-only"
  is_approved: boolean;
  created_by_user_id?: string | null;
  created_at: string;
}

/**
 * Assignment Brief Entity
 */
export interface AssignmentBriefEntity {
  id: string;
  user_id: string;
  course_id: string;
  assignment_title: string;
  file_name: string;
  raw_extracted_text: string;
  total_marks?: number | null;
  weight_percentage?: number | null;
  due_date: string;
  risk_level: RiskLevel;
  parsed_data_json?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Flashcard Deck Entity
 */
export interface FlashcardDeckEntity {
  id: string;
  user_id: string;
  course_code: string;
  title: string;
  description?: string | null;
  color_code: string;
  created_at: string;
  updated_at: string;
}

/**
 * Flashcard Entity (SuperMemo SM-2)
 */
export interface FlashcardEntity {
  id: string;
  deck_id: string;
  user_id: string;
  front: string;
  back: string;
  hint?: string | null;
  tags: string[];
  interval: number; // Interval in days
  ease_factor: number; // SuperMemo SM-2 multiplier (min 1.3, default 2.5)
  repetition: number;
  next_review_date: string;
  last_reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

// --------------------------------------------------------------------
// SQL DDL GENERATOR (PostgreSQL Reference for Migrations)
// --------------------------------------------------------------------
export const POSTGRES_DDL_SCHEMA = `
-- PostgreSQL DDL Generated from prisma/schema.prisma

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    university VARCHAR(120) NOT NULL,
    qualification VARCHAR(150) NOT NULL,
    academic_year SMALLINT NOT NULL DEFAULT 1,
    student_number VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    department VARCHAR(100),
    faculty VARCHAR(100),
    color_code VARCHAR(7) NOT NULL DEFAULT '#3b5b8c',
    dp_subminimum DOUBLE PRECISION NOT NULL DEFAULT 40.0,
    syllabus_description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_user_course_code UNIQUE (user_id, code)
);

CREATE TABLE IF NOT EXISTS academic_deadlines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    task_type VARCHAR(20) NOT NULL DEFAULT 'ASSIGNMENT',
    due_date TIMESTAMPTZ NOT NULL,
    priority VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
    weight_percentage DOUBLE PRECISION,
    grade_achieved DOUBLE PRECISION,
    max_grade DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMPTZ,
    reminder_sent BOOLEAN NOT NULL DEFAULT false,
    estimated_hours DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS ix_courses_user_id ON courses(user_id);
CREATE INDEX IF NOT EXISTS ix_deadlines_user_status_due ON academic_deadlines(user_id, is_completed, due_date);
CREATE INDEX IF NOT EXISTS ix_deadlines_course_due ON academic_deadlines(course_id, due_date);
CREATE INDEX IF NOT EXISTS ix_deadlines_due_date ON academic_deadlines(due_date);
`;
