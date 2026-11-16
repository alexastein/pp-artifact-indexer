-- Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
-- Prompt Summary: "Design PostgreSQL schema, migrations, seed script and DB tests for the master spec"
-- AI Contribution: 100% AI generated / 0% human refactored
-- Human Modifications: Reviewed line by line, no code changes (kept naive on purpose); notes in .ai_logs/conceptual_journal.md
-- Verification: Read through it and ran tests/migrations.test.ts, tests/seed.test.ts, all pass
-- Confidence: Medium

-- Step 1: academic units (labs, programs, courses) live in one table with a type column.
CREATE TABLE academic_units (
  id          TEXT PRIMARY KEY,                -- ids come from mock-data, e.g. lab-sail
  unit_type   TEXT NOT NULL CHECK (unit_type IN ('lab', 'program', 'course')),
  code        TEXT,
  name        TEXT NOT NULL,
  department  TEXT,
  term        TEXT,                            -- only used by courses
  program_id  TEXT REFERENCES academic_units(id) -- a course belongs to a program
);
CREATE INDEX idx_academic_units_type ON academic_units (unit_type);

-- Step 2: projects, the master record.
CREATE TABLE projects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description      TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision_version INTEGER NOT NULL DEFAULT 1 CHECK (revision_version >= 1)
);
-- Step 3: full-text index so keyword search on title/description is fast.
CREATE INDEX idx_projects_fts ON projects
  USING GIN (to_tsvector('english', title || ' ' || description));

-- Step 4: every UPDATE bumps revision_version and updated_at, so the API cannot forget.
CREATE FUNCTION projects_bump_revision() RETURNS trigger AS $$
BEGIN
  NEW.revision_version := OLD.revision_version + 1;
  NEW.updated_at := now();
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projects_bump_revision
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION projects_bump_revision();

-- Step 5: members of a project with a role. "At least one member" is enforced in the API
-- (a plain constraint cannot say "one or more rows exist in another table").
CREATE TABLE project_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  member_name  TEXT NOT NULL,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('student', 'faculty', 'advisor', 'teaching_assistant')),
  UNIQUE (project_id, email)
);
CREATE INDEX idx_project_members_project ON project_members (project_id);

-- Step 6: many-to-many link between projects and academic units.
CREATE TABLE project_academic_units (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  unit_id    TEXT NOT NULL REFERENCES academic_units(id),
  PRIMARY KEY (project_id, unit_id)
);
CREATE INDEX idx_project_units_unit ON project_academic_units (unit_id);
