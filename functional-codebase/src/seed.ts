// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Design PostgreSQL schema, migrations, seed script and DB tests for the master spec"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Reviewed line by line, no code changes (kept naive on purpose); notes in .ai_logs/conceptual_journal.md
// Verification: tests/seed.test.ts; human: reviewed line by line, ran npm run typecheck + npm test (7 files / 75 tests pass, real Postgres 16)
// Confidence: Medium

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MOCK_DATA_DIR = path.resolve(here, "..", "mock-data");

interface Lab { id: string; name: string; department: string }
interface Program { id: string; code: string; name: string; department: string }
interface Course { id: string; code: string; title: string; term: string; programId: string }
interface User { id: string; displayName: string; email: string; role: string }
interface SeedProject {
  title: string;
  abstract: string;
  labId?: string;
  programId?: string;
  courseId?: string;
  members: { userId: string; memberRole: string }[];
  createdBy: string;
}

async function loadJson<T>(dir: string, file: string): Promise<T> {
  return JSON.parse(await readFile(path.join(dir, file), "utf8")) as T;
}

// Step 1: mock-data uses portal roles, our schema uses the spec roles, so we translate.
export function toProjectRole(user: User): string {
  switch (user.role) {
    case "CONTRIBUTOR":
      return "student";
    case "CURATOR":
      return "faculty";
    default:
      throw new Error(`No project role mapping for user role ${user.role} (${user.id})`);
  }
}

// Step 2: loads units and projects. It is safe to run twice: units are upserted and
// a project is skipped if one with the same title already exists.
export async function seed(
  pool: pg.Pool,
  dir: string = MOCK_DATA_DIR,
): Promise<{ units: number; projectsInserted: number }> {
  const labs = await loadJson<Lab[]>(dir, "labs.json");
  const programs = await loadJson<Program[]>(dir, "programs.json");
  const courses = await loadJson<Course[]>(dir, "courses.json");
  const users = await loadJson<User[]>(dir, "users.json");
  const projects = await loadJson<SeedProject[]>(dir, "seed-projects.json");
  const userById = new Map(users.map((u) => [u.id, u]));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Step 3: programs first, because courses point at them.
    const upsertUnit = `
      INSERT INTO academic_units (id, unit_type, code, name, department, term, program_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        unit_type = EXCLUDED.unit_type, code = EXCLUDED.code, name = EXCLUDED.name,
        department = EXCLUDED.department, term = EXCLUDED.term, program_id = EXCLUDED.program_id`;
    for (const p of programs) {
      await client.query(upsertUnit, [p.id, "program", p.code, p.name, p.department, null, null]);
    }
    for (const l of labs) {
      await client.query(upsertUnit, [l.id, "lab", null, l.name, l.department, null, null]);
    }
    for (const c of courses) {
      await client.query(upsertUnit, [c.id, "course", c.code, c.title, null, c.term, c.programId]);
    }

    // Step 4: projects, their members and their unit links.
    let projectsInserted = 0;
    for (const p of projects) {
      const existing = await client.query("SELECT 1 FROM projects WHERE title = $1", [p.title]);
      if (existing.rowCount) continue;

      const created = await client.query<{ id: string }>(
        "INSERT INTO projects (title, description) VALUES ($1, $2) RETURNING id",
        [p.title, p.abstract],
      );
      const projectId = created.rows[0].id;

      // The creator is a member too, plus everyone listed in members (no duplicates).
      const userIds = [...new Set([p.createdBy, ...p.members.map((m) => m.userId)])];
      for (const userId of userIds) {
        const user = userById.get(userId);
        if (!user) throw new Error(`Seed project "${p.title}" references unknown user ${userId}`);
        await client.query(
          "INSERT INTO project_members (project_id, member_name, email, role) VALUES ($1, $2, $3, $4)",
          [projectId, user.displayName, user.email, toProjectRole(user)],
        );
      }

      for (const unitId of [p.labId, p.programId, p.courseId].filter((x): x is string => Boolean(x))) {
        await client.query("INSERT INTO project_academic_units (project_id, unit_id) VALUES ($1, $2)", [
          projectId,
          unitId,
        ]);
      }
      projectsInserted++;
    }

    await client.query("COMMIT");
    return { units: labs.length + programs.length + courses.length, projectsInserted };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
