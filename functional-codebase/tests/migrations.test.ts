// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Design PostgreSQL schema, migrations, seed script and DB tests for the master spec"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Read every test line by line, no changes; notes in .ai_logs/conceptual_journal.md
// Verification: Read through the tests and ran them, all pass
// Language/Stack: TypeScript / Node.js 22 / Vitest + Supertest / PostgreSQL 16
// Confidence: Medium

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { runMigrations } from "../src/migrate.js";
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

// Step 1: small helper to create a project and return its id.
async function newProject(): Promise<string> {
  const r = await pool.query("INSERT INTO projects (title) VALUES ('P') RETURNING id");
  return r.rows[0].id;
}
async function newArtifact(projectId: string, type: string): Promise<string> {
  const r = await pool.query("INSERT INTO artifacts (project_id, artifact_type) VALUES ($1, $2) RETURNING id", [
    projectId,
    type,
  ]);
  return r.rows[0].id;
}

describe("migrations", () => {
  it("creates all tables and is idempotent", async () => {
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()",
    );
    const names = tables.rows.map((r) => r.table_name);
    for (const t of [
      "academic_units", "projects", "project_members", "project_academic_units",
      "artifacts", "manuscripts", "videos", "repositories", "schema_migrations",
    ]) {
      expect(names).toContain(t);
    }
    // Step 2: running again must apply nothing.
    expect(await runMigrations(pool)).toEqual([]);
  });

  it("starts revision_version at 1 and bumps it on every update", async () => {
    const id = await newProject();
    const first = (await pool.query("SELECT * FROM projects WHERE id = $1", [id])).rows[0];
    expect(first.revision_version).toBe(1);
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);

    await pool.query("UPDATE projects SET title = 'Q' WHERE id = $1", [id]);
    await pool.query("UPDATE projects SET description = 'd' WHERE id = $1", [id]);
    const after = (await pool.query("SELECT * FROM projects WHERE id = $1", [id])).rows[0];
    expect(after.revision_version).toBe(3);
    expect(after.updated_at.getTime()).toBeGreaterThanOrEqual(first.updated_at.getTime());
    expect(after.created_at.getTime()).toBe(first.created_at.getTime());
  });

  it("only accepts the four member roles and unique emails per project", async () => {
    const id = await newProject();
    const insert = (role: string, email = "a@x.edu") =>
      pool.query("INSERT INTO project_members (project_id, member_name, email, role) VALUES ($1,'A',$2,$3)", [
        id, email, role,
      ]);
    await insert("student");
    await insert("faculty", "b@x.edu");
    await insert("advisor", "c@x.edu");
    await insert("teaching_assistant", "d@x.edu");
    await expect(insert("janitor", "e@x.edu")).rejects.toThrow();
    await expect(insert("student")).rejects.toThrow(); // duplicate email
  });

  it("links a project to units and rejects unknown units", async () => {
    const id = await newProject();
    await pool.query("INSERT INTO academic_units (id, unit_type, name) VALUES ('lab-x','lab','X')");
    await pool.query("INSERT INTO project_academic_units VALUES ($1,'lab-x')", [id]);
    await expect(pool.query("INSERT INTO project_academic_units VALUES ($1,'nope')", [id])).rejects.toThrow();
    await expect(
      pool.query("INSERT INTO academic_units (id, unit_type, name) VALUES ('z','building','Z')"),
    ).rejects.toThrow();
  });

  it("stores each artifact type and enforces the type match", async () => {
    const pid = await newProject();
    const sha = "a".repeat(64);

    const m = await newArtifact(pid, "manuscripts");
    await pool.query(
      `INSERT INTO manuscripts (artifact_id, title, authors, keywords, year, publisher,
         stored_file_path, original_file_name, file_size_bytes, file_sha256)
       VALUES ($1,'T','{A,B}','{k1,k2}',2026,'ACM','/up/f.pdf','f.pdf',10,$2)`,
      [m, sha],
    );
    const v = await newArtifact(pid, "videos");
    await pool.query("INSERT INTO videos (artifact_id, video_url, duration_seconds) VALUES ($1,'http://v',90)", [v]);
    const r = await newArtifact(pid, "repositories");
    await pool.query(
      "INSERT INTO repositories (artifact_id, repo_url, total_commit_count, latest_commit_at) VALUES ($1,'http://g',5,now())",
      [r],
    );

    const row = (await pool.query("SELECT authors, keywords, publisher FROM manuscripts WHERE artifact_id=$1", [m])).rows[0];
    expect(row.authors).toEqual(["A", "B"]);
    expect(row.keywords).toEqual(["k1", "k2"]);

    // Step 3: a video row cannot hang off a manuscripts artifact.
    await expect(
      pool.query("INSERT INTO videos (artifact_id, video_url) VALUES ($1,'http://x')", [m]),
    ).rejects.toThrow();
  });

  it("allows manuscripts without a file/publisher but rejects partial file info and bad hashes", async () => {
    const pid = await newProject();
    const a = await newArtifact(pid, "manuscripts");
    await pool.query("INSERT INTO manuscripts (artifact_id, title) VALUES ($1,'No file')", [a]);
    const row = (await pool.query("SELECT publisher, file_sha256 FROM manuscripts WHERE artifact_id=$1", [a])).rows[0];
    expect(row.publisher).toBeNull();
    expect(row.file_sha256).toBeNull();

    await expect(pool.query("UPDATE manuscripts SET stored_file_path='/x' WHERE artifact_id=$1", [a])).rejects.toThrow();
    await expect(
      pool.query(
        "UPDATE manuscripts SET stored_file_path='/x', original_file_name='x', file_size_bytes=1, file_sha256='XYZ' WHERE artifact_id=$1",
        [a],
      ),
    ).rejects.toThrow();
  });

  it("cascades deletes from project to members, links and artifacts", async () => {
    const pid = await newProject();
    const a = await newArtifact(pid, "videos");
    await pool.query("INSERT INTO videos (artifact_id, video_url) VALUES ($1,'http://v')", [a]);
    await pool.query("DELETE FROM projects WHERE id=$1", [pid]);
    expect((await pool.query("SELECT 1 FROM artifacts WHERE id=$1", [a])).rowCount).toBe(0);
    expect((await pool.query("SELECT 1 FROM videos WHERE artifact_id=$1", [a])).rowCount).toBe(0);
  });
});
