// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Implement artifact endpoints (manuscripts, videos, repositories) with git-host mock enrichment"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Reviewed line by line, no code changes (kept naive on purpose); notes in .ai_logs/conceptual_journal.md
// Verification: tests/artifacts.test.ts; human: reviewed line by line, ran npm run typecheck + npm test (7 files / 75 tests pass, real Postgres 16)
// Confidence: Medium

import type pg from "pg";
import { lookupMockRepo } from "./git-mock.js";
import type { ArtifactType } from "./validation.js";

type Fields = Record<string, unknown>;

// Step 1: for each artifact type: its child table, the editable columns (a fixed whitelist,
// so column names in our SQL never come from user input) and the columns we show in responses.
// Manuscript file columns (path, name, size, hash) are managed by the file endpoints, not by metadata PUT/POST.
const TYPES = {
  manuscripts: {
    table: "manuscripts",
    editable: ["title", "abstract", "authors", "keywords", "year", "publisher"],
    visible: `c.title, c.abstract, c.authors, c.keywords, c.year, c.publisher,
      (c.stored_file_path IS NOT NULL) AS has_file, c.original_file_name, c.file_size_bytes::float8 AS file_size_bytes, c.file_sha256`,
  },
  videos: {
    table: "videos",
    editable: ["video_url", "thumbnail_url", "duration_seconds", "description"],
    visible: "c.video_url, c.thumbnail_url, c.duration_seconds, c.description",
  },
  repositories: {
    table: "repositories",
    editable: ["repo_url", "target_branch", "primary_tech_stack", "total_commit_count", "latest_commit_at"],
    visible: "c.repo_url, c.target_branch, c.primary_tech_stack, c.total_commit_count, c.latest_commit_at",
  },
} as const;

function selectSql(type: ArtifactType): string {
  const t = TYPES[type];
  return `SELECT a.id, a.project_id, a.artifact_type, a.created_at, a.updated_at, ${t.visible}
          FROM artifacts a JOIN ${t.table} c ON c.artifact_id = a.id`;
}

// Step 2: does the project exist? (routes answer 404 before touching artifacts)
export async function projectExists(db: pg.Pool, projectId: string): Promise<boolean> {
  const r = await db.query("SELECT 1 FROM projects WHERE id = $1", [projectId]);
  return (r.rowCount ?? 0) > 0;
}

// Step 3: repositories get missing branch / tech stack / latest commit from the mock git host.
// Values the client sent always win; target_branch finally falls back to "main" (the column is NOT NULL).
async function enrich(type: ArtifactType, input: Fields): Promise<Fields> {
  if (type !== "repositories") return input;
  const mock = await lookupMockRepo(String(input.repo_url));
  return {
    ...input,
    target_branch: input.target_branch ?? mock?.target_branch ?? "main",
    primary_tech_stack: input.primary_tech_stack ?? mock?.primary_tech_stack ?? null,
    latest_commit_at: input.latest_commit_at ?? mock?.latest_commit_at ?? null,
  };
}

export async function getArtifact(db: pg.Pool, projectId: string, type: ArtifactType, id: string) {
  const r = await db.query(`${selectSql(type)} WHERE a.id = $1 AND a.project_id = $2 AND a.artifact_type = $3`, [
    id,
    projectId,
    type,
  ]);
  return r.rows[0] ?? null;
}

export async function listArtifacts(db: pg.Pool, projectId: string, type: ArtifactType) {
  const r = await db.query(`${selectSql(type)} WHERE a.project_id = $1 ORDER BY a.created_at, a.id`, [projectId]);
  return r.rows;
}

// Step 4: all three types at once, grouped by type.
export async function listAllArtifacts(db: pg.Pool, projectId: string) {
  const [manuscripts, videos, repositories] = await Promise.all([
    listArtifacts(db, projectId, "manuscripts"),
    listArtifacts(db, projectId, "videos"),
    listArtifacts(db, projectId, "repositories"),
  ]);
  return { project_id: projectId, manuscripts, videos, repositories };
}

// Step 5: create = one row in artifacts (gives the UUID) + one row in the type table, in a transaction.
export async function createArtifact(db: pg.Pool, projectId: string, type: ArtifactType, input: Fields) {
  const data = await enrich(type, input);
  const t = TYPES[type];
  const cols = t.editable;
  const client = await db.connect();
  let id: string;
  try {
    await client.query("BEGIN");
    const a = await client.query<{ id: string }>(
      "INSERT INTO artifacts (project_id, artifact_type) VALUES ($1, $2) RETURNING id",
      [projectId, type],
    );
    id = a.rows[0].id;
    const placeholders = cols.map((_, i) => `$${i + 2}`).join(", ");
    await client.query(
      `INSERT INTO ${t.table} (artifact_id, ${cols.join(", ")}) VALUES ($1, ${placeholders})`,
      [id, ...cols.map((c) => data[c])],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getArtifact(db, projectId, type, id);
}

// Step 6: update replaces all editable metadata (stored file info is left alone). Returns null if not found.
export async function updateArtifact(db: pg.Pool, projectId: string, type: ArtifactType, id: string, input: Fields) {
  const data = await enrich(type, input);
  const t = TYPES[type];
  const cols = t.editable;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // the artifacts UPDATE both checks the artifact belongs to this project/type and refreshes updated_at
    const touched = await client.query(
      "UPDATE artifacts SET updated_at = now() WHERE id = $1 AND project_id = $2 AND artifact_type = $3",
      [id, projectId, type],
    );
    if (touched.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
    await client.query(`UPDATE ${t.table} SET ${sets} WHERE artifact_id = $1`, [id, ...cols.map((c) => data[c])]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getArtifact(db, projectId, type, id);
}

// Step 7: delete. For manuscripts we return the stored file path so the route can remove the file after the commit.
// Result: null = not found, otherwise the list of stored files to remove (empty for videos/repos).
export async function deleteArtifact(db: pg.Pool, projectId: string, type: ArtifactType, id: string): Promise<string[] | null> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    let files: string[] = [];
    if (type === "manuscripts") {
      const f = await client.query<{ stored_file_path: string | null }>(
        `SELECT m.stored_file_path FROM manuscripts m JOIN artifacts a ON a.id = m.artifact_id
         WHERE a.id = $1 AND a.project_id = $2`,
        [id, projectId],
      );
      files = f.rows.map((r) => r.stored_file_path).filter((p): p is string => p !== null);
    }
    const del = await client.query("DELETE FROM artifacts WHERE id = $1 AND project_id = $2 AND artifact_type = $3", [
      id,
      projectId,
      type,
    ]);
    if (del.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query("COMMIT");
    return files;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
