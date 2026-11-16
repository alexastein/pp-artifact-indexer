-- Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
-- Prompt Summary: "Design PostgreSQL schema, migrations, seed script and DB tests for the master spec"
-- AI Contribution: 100% AI generated / 0% human refactored
-- Human Modifications: Reviewed line by line, no code changes (kept naive on purpose); notes in .ai_logs/conceptual_journal.md
-- Verification: Read through it and ran tests/migrations.test.ts, tests/seed.test.ts, all pass
-- Confidence: Medium

-- Step 1: base table gives every artifact (any type) its own UUID and a project.
CREATE TABLE artifacts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  artifact_type  TEXT NOT NULL CHECK (artifact_type IN ('manuscripts', 'videos', 'repositories')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Step 2: this unique pair lets child tables prove their row has the right type.
  UNIQUE (id, artifact_type)
);
CREATE INDEX idx_artifacts_project_type ON artifacts (project_id, artifact_type);

-- Step 3: manuscripts. File columns are NULL until the file is uploaded
-- (metadata is created first, the file comes from POST .../{id}/file).
CREATE TABLE manuscripts (
  artifact_id        UUID PRIMARY KEY,
  artifact_type      TEXT NOT NULL DEFAULT 'manuscripts' CHECK (artifact_type = 'manuscripts'),
  title              TEXT NOT NULL,
  abstract           TEXT NOT NULL DEFAULT '',
  authors            TEXT[] NOT NULL DEFAULT '{}',
  keywords           TEXT[] NOT NULL DEFAULT '{}',
  year               INTEGER CHECK (year BETWEEN 1900 AND 2100),
  publisher          TEXT,                       -- only set if the manuscript is published
  stored_file_path   TEXT,
  original_file_name TEXT,
  file_size_bytes    BIGINT CHECK (file_size_bytes >= 0),
  file_sha256        TEXT CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (artifact_id, artifact_type) REFERENCES artifacts (id, artifact_type) ON DELETE CASCADE,
  -- Step 4: the four file columns are either all filled in or all empty.
  CONSTRAINT manuscripts_file_all_or_none CHECK (
    (stored_file_path IS NULL AND original_file_name IS NULL AND file_size_bytes IS NULL AND file_sha256 IS NULL)
    OR
    (stored_file_path IS NOT NULL AND original_file_name IS NOT NULL AND file_size_bytes IS NOT NULL AND file_sha256 IS NOT NULL)
  )
);
CREATE INDEX idx_manuscripts_keywords ON manuscripts USING GIN (keywords);
CREATE INDEX idx_manuscripts_fts ON manuscripts
  USING GIN (to_tsvector('english', title || ' ' || abstract));

-- Step 5: video presentation metadata.
CREATE TABLE videos (
  artifact_id       UUID PRIMARY KEY,
  artifact_type     TEXT NOT NULL DEFAULT 'videos' CHECK (artifact_type = 'videos'),
  video_url         TEXT NOT NULL,
  thumbnail_url     TEXT,
  duration_seconds  INTEGER CHECK (duration_seconds >= 0),
  description       TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (artifact_id, artifact_type) REFERENCES artifacts (id, artifact_type) ON DELETE CASCADE
);

-- Step 6: Git repository metadata.
CREATE TABLE repositories (
  artifact_id          UUID PRIMARY KEY,
  artifact_type        TEXT NOT NULL DEFAULT 'repositories' CHECK (artifact_type = 'repositories'),
  repo_url             TEXT NOT NULL,
  target_branch        TEXT NOT NULL DEFAULT 'main',
  primary_tech_stack   TEXT,
  total_commit_count   INTEGER CHECK (total_commit_count >= 0),
  latest_commit_at     TIMESTAMPTZ,
  FOREIGN KEY (artifact_id, artifact_type) REFERENCES artifacts (id, artifact_type) ON DELETE CASCADE
);
