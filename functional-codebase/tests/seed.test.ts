// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Design PostgreSQL schema, migrations, seed script and DB tests for the master spec"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Read every test line by line, no changes; notes in .ai_logs/conceptual_journal.md
// Verification: Read through the tests and ran them, all pass
// Confidence: Medium

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { runMigrations } from "../src/migrate.js";
import { seed } from "../src/seed.js";
import { createTestSchema } from "./helpers.js";

let pool: pg.Pool;
let drop: () => Promise<void>;

beforeAll(async () => {
  ({ pool, drop } = await createTestSchema());
  await runMigrations(pool);
});
afterAll(async () => {
  await drop();
});

describe("seed", () => {
  it("loads academic units and the seed projects with members and unit links", async () => {
    const result = await seed(pool);
    expect(result.units).toBe(6); // 2 labs + 2 programs + 2 courses
    expect(result.projectsInserted).toBeGreaterThanOrEqual(1);

    const units = await pool.query("SELECT unit_type, count(*)::int AS n FROM academic_units GROUP BY unit_type");
    const byType = Object.fromEntries(units.rows.map((r) => [r.unit_type, r.n]));
    expect(byType).toEqual({ lab: 2, program: 2, course: 2 });

    const course = (await pool.query("SELECT program_id FROM academic_units WHERE id='c-cs763-f26'")).rows[0];
    expect(course.program_id).toBe("prog-mscis");

    // Step 1: the first seed project has the lab, program and course linked and 2 student members.
    const project = (await pool.query("SELECT id, revision_version FROM projects WHERE title LIKE 'AI-Agent%'")).rows[0];
    expect(project.revision_version).toBe(1);
    const links = await pool.query("SELECT unit_id FROM project_academic_units WHERE project_id=$1 ORDER BY unit_id", [project.id]);
    expect(links.rows.map((r) => r.unit_id)).toEqual(["c-cs763-f26", "lab-sail", "prog-mscis"]);
    const members = await pool.query("SELECT role FROM project_members WHERE project_id=$1", [project.id]);
    expect(members.rowCount).toBe(2);
    expect(members.rows.every((r) => r.role === "student")).toBe(true);
  });

  it("is idempotent when run twice", async () => {
    const before = (await pool.query("SELECT count(*)::int AS n FROM projects")).rows[0].n;
    const again = await seed(pool);
    expect(again.projectsInserted).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM projects")).rows[0].n).toBe(before);
    expect((await pool.query("SELECT count(*)::int AS n FROM academic_units")).rows[0].n).toBe(6);
  });
});
