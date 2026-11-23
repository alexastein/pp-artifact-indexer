// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Implement manuscript file upload, download, delete and zip download"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Reviewed line by line, no code changes (kept naive on purpose); notes in .ai_logs/conceptual_journal.md
// Verification: Read through it and ran tests/manuscript-files.test.ts, all pass
// Language/Stack: TypeScript / Node.js 22 / Express 5 / PostgreSQL 16
// Confidence: Medium

import type pg from "pg";

export interface ManuscriptFileRow {
  stored_file_path: string | null;
  original_file_name: string | null;
}

// Step 1: reads the file columns of one manuscript; null when the manuscript is not in that project.
export async function getManuscriptFile(db: pg.Pool, projectId: string, artifactId: string) {
  const r = await db.query<ManuscriptFileRow>(
    `SELECT m.stored_file_path, m.original_file_name
     FROM manuscripts m JOIN artifacts a ON a.id = m.artifact_id
     WHERE a.id = $1 AND a.project_id = $2`,
    [artifactId, projectId],
  );
  return r.rows[0] ?? null;
}

// Step 2: every manuscript of the project that has a file, oldest first (this order is used in the zip).
export async function listManuscriptFiles(db: pg.Pool, projectId: string) {
  const r = await db.query<{ stored_file_path: string; original_file_name: string }>(
    `SELECT m.stored_file_path, m.original_file_name
     FROM manuscripts m JOIN artifacts a ON a.id = m.artifact_id
     WHERE a.project_id = $1 AND m.stored_file_path IS NOT NULL
     ORDER BY a.created_at, a.id`,
    [projectId],
  );
  return r.rows;
}

// Step 3: saves the file info. We lock the row first so two uploads at once cannot both
// think they replaced the same old file. Returns null if the manuscript does not exist,
// otherwise the path of the file that was replaced (or null if there was none).
export async function setManuscriptFile(
  db: pg.Pool,
  projectId: string,
  artifactId: string,
  file: { storedPath: string; originalName: string; size: number; sha256: string },
): Promise<{ previous: string | null } | null> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const old = await client.query<ManuscriptFileRow>(
      `SELECT m.stored_file_path FROM manuscripts m JOIN artifacts a ON a.id = m.artifact_id
       WHERE a.id = $1 AND a.project_id = $2 FOR UPDATE OF m`,
      [artifactId, projectId],
    );
    if (old.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(
      `UPDATE manuscripts SET stored_file_path = $2, original_file_name = $3, file_size_bytes = $4, file_sha256 = $5
       WHERE artifact_id = $1`,
      [artifactId, file.storedPath, file.originalName, file.size, file.sha256],
    );
    await client.query("UPDATE artifacts SET updated_at = now() WHERE id = $1", [artifactId]);
    await client.query("COMMIT");
    return { previous: old.rows[0].stored_file_path };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Step 4: clears the four file columns. Same return shape: null = no such manuscript,
// previous = null means there was no file to remove.
export async function clearManuscriptFile(
  db: pg.Pool,
  projectId: string,
  artifactId: string,
): Promise<{ previous: string | null } | null> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const old = await client.query<ManuscriptFileRow>(
      `SELECT m.stored_file_path FROM manuscripts m JOIN artifacts a ON a.id = m.artifact_id
       WHERE a.id = $1 AND a.project_id = $2 FOR UPDATE OF m`,
      [artifactId, projectId],
    );
    if (old.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const previous = old.rows[0].stored_file_path;
    if (previous !== null) {
      await client.query(
        `UPDATE manuscripts SET stored_file_path = NULL, original_file_name = NULL, file_size_bytes = NULL, file_sha256 = NULL
         WHERE artifact_id = $1`,
        [artifactId],
      );
      await client.query("UPDATE artifacts SET updated_at = now() WHERE id = $1", [artifactId]);
    }
    await client.query("COMMIT");
    return { previous };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
