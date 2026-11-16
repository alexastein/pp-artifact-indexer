// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Implement project CRUD and search endpoints (POST/GET/PUT/DELETE /api/v1/projects)"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Reviewed line by line, no code changes (kept naive on purpose); notes in .ai_logs/conceptual_journal.md
// Verification: tests/projects.test.ts; human: reviewed line by line, ran npm run typecheck + npm test (7 files / 75 tests pass, real Postgres 16)
// Confidence: Medium

import type pg from "pg";
import { AppError } from "./errors.js";
import type { ProjectInput, SearchParams } from "./validation.js";

export interface ArtifactCounts {
  manuscripts: number;
  videos: number;
  repositories: number;
}

const COUNT_COLUMNS = `
  (SELECT count(*)::int FROM artifacts a WHERE a.project_id = p.id AND a.artifact_type = 'manuscripts') AS manuscripts,
  (SELECT count(*)::int FROM artifacts a WHERE a.project_id = p.id AND a.artifact_type = 'videos') AS videos,
  (SELECT count(*)::int FROM artifacts a WHERE a.project_id = p.id AND a.artifact_type = 'repositories') AS repositories`;

// Step 1: the project row plus a nested artifact_counts object (shared by search and read).
interface ProjectRow extends ArtifactCounts {
  id: string;
  [column: string]: any;
}
function shapeSummary(row: ProjectRow) {
  const { manuscripts, videos, repositories, ...project } = row;
  return { ...project, artifact_counts: { manuscripts, videos, repositories } as ArtifactCounts };
}

// Step 2: reads one project with members, units and counts; null if it does not exist.
export async function getProject(db: pg.Pool | pg.PoolClient, id: string) {
  const base = await db.query(`SELECT p.*, ${COUNT_COLUMNS} FROM projects p WHERE p.id = $1`, [id]);
  if (base.rowCount === 0) return null;
  const [members, units] = await Promise.all([
    db.query(
      `SELECT id, member_name AS name, email, role FROM project_members
       WHERE project_id = $1 ORDER BY member_name, email`,
      [id],
    ),
    db.query(
      `SELECT u.id, u.unit_type, u.code, u.name, u.department, u.term, u.program_id
       FROM project_academic_units pu JOIN academic_units u ON u.id = pu.unit_id
       WHERE pu.project_id = $1 ORDER BY u.unit_type, u.id`,
      [id],
    ),
  ]);
  return { ...shapeSummary(base.rows[0]), members: members.rows, academic_units: units.rows };
}

// Step 3: makes sure every unit id exists, so we answer 400 instead of a raw foreign key error.
async function assertUnitsExist(client: pg.PoolClient, unitIds: string[]) {
  const found = await client.query<{ id: string }>("SELECT id FROM academic_units WHERE id = ANY($1)", [unitIds]);
  const known = new Set(found.rows.map((r) => r.id));
  const missing = unitIds.filter((u) => !known.has(u));
  if (missing.length) {
    throw new AppError(400, "unknown_academic_unit", "Some unit_ids do not exist", { unknown_unit_ids: missing });
  }
}

async function writeMembersAndUnits(client: pg.PoolClient, projectId: string, input: ProjectInput) {
  await assertUnitsExist(client, input.unit_ids);
  for (const m of input.members) {
    await client.query(
      "INSERT INTO project_members (project_id, member_name, email, role) VALUES ($1, $2, $3, $4)",
      [projectId, m.name, m.email, m.role],
    );
  }
  for (const unitId of input.unit_ids) {
    await client.query("INSERT INTO project_academic_units (project_id, unit_id) VALUES ($1, $2)", [
      projectId,
      unitId,
    ]);
  }
}

// Runs fn inside a transaction and rolls back if anything throws.
async function inTransaction<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Step 4: create. Project, members and links are saved together or not at all.
export async function createProject(pool: pg.Pool, input: ProjectInput) {
  const id = await inTransaction(pool, async (client) => {
    const created = await client.query<{ id: string }>(
      "INSERT INTO projects (title, description) VALUES ($1, $2) RETURNING id",
      [input.title, input.description],
    );
    await writeMembersAndUnits(client, created.rows[0].id, input);
    return created.rows[0].id;
  });
  return getProject(pool, id);
}

// Step 5: update replaces title/description/members/units. The UPDATE statement always runs,
// so the database trigger bumps revision_version and updated_at. Returns null if not found.
export async function updateProject(pool: pg.Pool, id: string, input: ProjectInput) {
  const found = await inTransaction(pool, async (client) => {
    const updated = await client.query(
      "UPDATE projects SET title = $2, description = $3 WHERE id = $1",
      [id, input.title, input.description],
    );
    if (updated.rowCount === 0) return false;
    await client.query("DELETE FROM project_members WHERE project_id = $1", [id]);
    await client.query("DELETE FROM project_academic_units WHERE project_id = $1", [id]);
    await writeMembersAndUnits(client, id, input);
    return true;
  });
  return found ? getProject(pool, id) : null;
}

// Step 6: delete. We collect the manuscript file paths first, because the rows
// (and their paths) are gone after the delete. Returns null if the project is unknown,
// otherwise the list of stored files the caller must remove from disk.
export async function deleteProject(pool: pg.Pool, id: string): Promise<string[] | null> {
  return inTransaction(pool, async (client) => {
    const files = await client.query<{ stored_file_path: string }>(
      `SELECT m.stored_file_path FROM manuscripts m JOIN artifacts a ON a.id = m.artifact_id
       WHERE a.project_id = $1 AND m.stored_file_path IS NOT NULL`,
      [id],
    );
    const deleted = await client.query("DELETE FROM projects WHERE id = $1", [id]); // cascades to the rest
    if (deleted.rowCount === 0) return null;
    return files.rows.map((r) => r.stored_file_path);
  });
}

// Step 7: LIKE patterns treat % and _ as wildcards, so we escape them to search for the literal text.
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Step 8: search. We build the WHERE clause piece by piece; every value goes in as a
// $n parameter (never pasted into the SQL), so user input cannot inject SQL.
export async function searchProjects(pool: pg.Pool, s: SearchParams) {
  const params: unknown[] = [];
  const conds: string[] = [];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (s.keyword) {
    const k = param(`%${escapeLike(s.keyword)}%`);
    conds.push(`(
      p.title ILIKE ${k} OR p.description ILIKE ${k}
      OR EXISTS (
        SELECT 1 FROM artifacts a JOIN manuscripts m ON m.artifact_id = a.id
        WHERE a.project_id = p.id AND (
          m.title ILIKE ${k} OR m.abstract ILIKE ${k}
          OR EXISTS (SELECT 1 FROM unnest(m.keywords) kw WHERE kw ILIKE ${k})
        )
      )
    )`);
  }
  if (s.createdFrom) conds.push(`p.created_at >= ${param(s.createdFrom.value)}::timestamptz`);
  if (s.createdTo) {
    // A plain date means "through the end of that day".
    conds.push(
      s.createdTo.dateOnly
        ? `p.created_at < ${param(s.createdTo.value)}::timestamptz + interval '1 day'`
        : `p.created_at <= ${param(s.createdTo.value)}::timestamptz`,
    );
  }
  // Each unit filter also checks unit_type, so lab_id=<a course id> matches nothing.
  const unitFilter = (id: string | undefined, type: "lab" | "program" | "course") => {
    if (!id) return;
    conds.push(`EXISTS (
      SELECT 1 FROM project_academic_units pu JOIN academic_units u ON u.id = pu.unit_id
      WHERE pu.project_id = p.id AND pu.unit_id = ${param(id)} AND u.unit_type = '${type}'
    )`);
  };
  unitFilter(s.labId, "lab");
  unitFilter(s.programId, "program");
  unitFilter(s.courseId, "course");

  // A project must have every requested artifact type.
  for (const type of s.hasArtifactTypes) {
    conds.push(`EXISTS (SELECT 1 FROM artifacts a WHERE a.project_id = p.id AND a.artifact_type = ${param(type)})`);
  }

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const total = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM projects p ${where}`, params);

  // sort field and direction come from a fixed whitelist, never from raw input.
  const orderBy = s.sortField === "title" ? "lower(p.title)" : "p.created_at";
  const dir = s.sortDir === "asc" ? "ASC" : "DESC";
  const limit = param(s.pageSize);
  const offset = param((s.page - 1) * s.pageSize);
  const rows = await pool.query(
    `SELECT p.*, ${COUNT_COLUMNS} FROM projects p ${where}
     ORDER BY ${orderBy} ${dir}, p.id ${dir} LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  return {
    items: rows.rows.map(shapeSummary),
    page: s.page,
    page_size: s.pageSize,
    total: total.rows[0].n,
  };
}
