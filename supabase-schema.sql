-- =============================================================================
-- VeloPulse Enterprise Workforce & Task Tracking — Supabase PostgreSQL Schema
-- Run this in your Supabase SQL Editor (or let the server auto-provision on first boot)
-- =============================================================================

CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'VeloPulse Enterprise Workspace',
  work_hours_per_day INTEGER NOT NULL DEFAULT 8,
  scoring_base_points INTEGER NOT NULL DEFAULT 100,
  scoring_on_time_bonus INTEGER NOT NULL DEFAULT 25,
  scoring_quality_bonus INTEGER NOT NULL DEFAULT 20,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  organization_id INTEGER NOT NULL DEFAULT 1,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  department TEXT NOT NULL DEFAULT 'Engineering',
  job_title TEXT NOT NULL DEFAULT 'Specialist',
  employee_number TEXT,
  avatar_url TEXT,
  account_status TEXT NOT NULL DEFAULT 'active',
  password_hash TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  last_activity_at TIMESTAMP DEFAULT NOW() NOT NULL,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Medium',
  category TEXT NOT NULL DEFAULT 'Operations',
  start_date TIMESTAMP DEFAULT NOW() NOT NULL,
  due_date TIMESTAMP NOT NULL,
  created_by INTEGER NOT NULL,
  estimated_effort INTEGER NOT NULL DEFAULT 8,
  checklist_json TEXT DEFAULT '[]' NOT NULL,
  completion_criteria TEXT DEFAULT 'All deliverables verified and approved by manager.' NOT NULL,
  task_status TEXT NOT NULL DEFAULT 'active',
  canceled_at TIMESTAMP,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS task_assignments (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  assigned_by INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  progress_percentage INTEGER NOT NULL DEFAULT 0,
  latest_note TEXT,
  started_at TIMESTAMP,
  submitted_at TIMESTAMP,
  completed_at TIMESTAMP,
  quality_bonus INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS task_progress_updates (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  previous_percentage INTEGER NOT NULL,
  new_percentage INTEGER NOT NULL,
  description TEXT NOT NULL,
  blockers TEXT,
  next_steps TEXT,
  attachment_url TEXT,
  attachment_name TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS task_submissions (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  submission_summary TEXT NOT NULL,
  evidence_notes TEXT,
  attachment_url TEXT,
  attachment_name TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  submitted_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS task_reviews (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL,
  submission_id INTEGER,
  reviewer_id INTEGER NOT NULL,
  decision TEXT NOT NULL,
  review_notes TEXT NOT NULL,
  quality_bonus_awarded INTEGER NOT NULL DEFAULT 0,
  reviewed_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS task_attachments (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL,
  assignment_id INTEGER,
  uploaded_by INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'application/pdf',
  file_size INTEGER NOT NULL DEFAULT 1024,
  file_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  recipient_id INTEGER NOT NULL,
  actor_id INTEGER,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  related_task_id INTEGER,
  related_assignment_id INTEGER,
  is_read BOOLEAN NOT NULL DEFAULT false,
  idempotency_key TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL DEFAULT 1,
  actor_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata TEXT DEFAULT '{}' NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_org_role_status ON users (organization_id, role, account_status);
CREATE INDEX IF NOT EXISTS idx_tasks_org_status_due ON tasks (organization_id, task_status, due_date);
CREATE INDEX IF NOT EXISTS idx_assignments_task_emp ON task_assignments (task_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_assignments_emp_status ON task_assignments (employee_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read ON notifications (recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_org_created ON activity_logs (organization_id, created_at DESC);
