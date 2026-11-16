// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Implement project CRUD and search endpoints (POST/GET/PUT/DELETE /api/v1/projects)"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Read every test line by line, no changes; notes in .ai_logs/conceptual_journal.md
// Verification: Read through the tests and ran them, all pass
// Confidence: Medium

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { runMigrations } from "../src/migrate.js";
import { seed } from "../src/seed.js";
import { createTestSchema } from "./helpers.js";

let pool: pg.Pool;
let drop: () => Promise<void>;
let api: ReturnType<typeof request>;
let uploadRoot: string;

const KNOWN_MISSING_ID = "00000000-0000-4000-8000-000000000000";

// Step 1: one throwaway schema + upload folder for the whole file.
beforeAll(async () => {
  ({ pool, drop } = await createTestSchema());
  await runMigrations(pool);
  await seed(pool); // loads the academic units (and the seed project, removed next)
  await pool.query("DELETE FROM projects");
  api = request(createApp(() => pool));
  uploadRoot = await mkdtemp(path.join(os.tmpdir(), "pp-uploads-"));
  process.env.FILE_STORAGE_DIR = uploadRoot;
});
afterAll(async () => {
  await drop();
  await rm(uploadRoot, { recursive: true, force: true });
  delete process.env.FILE_STORAGE_DIR;
});

// Step 2: helpers to build test data. Artifact endpoints are not built yet, so we insert artifacts with SQL.
const member = (name: string, role = "student") => ({ name, email: `${name.toLowerCase()}@x.edu`, role });

async function createProject(body: Record<string, unknown>) {
  const res = await api.post("/api/v1/projects").send(body);
  expect(res.status).toBe(201);
  return res.body;
}

async function addManuscript(
  projectId: string,
  m: { title: string; abstract?: string; keywords?: string[]; file?: string },
) {
  const a = await pool.query("INSERT INTO artifacts (project_id, artifact_type) VALUES ($1,'manuscripts') RETURNING id", [
    projectId,
  ]);
  const withFile = m.file !== undefined;
  await pool.query(
    `INSERT INTO manuscripts (artifact_id, title, abstract, keywords, stored_file_path, original_file_name, file_size_bytes, file_sha256)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [a.rows[0].id, m.title, m.abstract ?? "", m.keywords ?? [], m.file ?? null, withFile ? "f.pdf" : null, withFile ? 1 : null, withFile ? "a".repeat(64) : null],
  );
}
async function addVideo(projectId: string) {
  const a = await pool.query("INSERT INTO artifacts (project_id, artifact_type) VALUES ($1,'videos') RETURNING id", [projectId]);
  await pool.query("INSERT INTO videos (artifact_id, video_url) VALUES ($1,'http://v')", [a.rows[0].id]);
}
async function addRepo(projectId: string) {
  const a = await pool.query("INSERT INTO artifacts (project_id, artifact_type) VALUES ($1,'repositories') RETURNING id", [projectId]);
  await pool.query("INSERT INTO repositories (artifact_id, repo_url) VALUES ($1,'http://g')", [a.rows[0].id]);
}

const valid = {
  title: "My Project",
  description: "About things",
  members: [member("Mia"), member("Ken", "faculty")],
  unit_ids: ["lab-sail", "prog-mscis", "c-cs763-f26"],
};

describe("POST /api/v1/projects", () => {
  it("creates a project with members and units and returns 201 with the full project", async () => {
    const res = await api.post("/api/v1/projects").send(valid);
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/projects/${res.body.id}`);
    expect(res.body).toMatchObject({
      title: "My Project",
      description: "About things",
      revision_version: 1,
      artifact_counts: { manuscripts: 0, videos: 0, repositories: 0 },
    });
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.created_at).toBeTruthy();
    expect(res.body.members.map((m: any) => m.name).sort()).toEqual(["Ken", "Mia"]);
    expect(res.body.academic_units.map((u: any) => u.id).sort()).toEqual(["c-cs763-f26", "lab-sail", "prog-mscis"]);
    expect(res.body.academic_units.find((u: any) => u.id === "lab-sail").unit_type).toBe("lab");
  });

  it("rejects bad input with 400 and field details", async () => {
    const cases: Record<string, unknown>[] = [
      { ...valid, title: "  " },
      { ...valid, members: [] },
      { ...valid, unit_ids: [] },
      { ...valid, members: [{ name: "A", email: "not-an-email", role: "student" }] },
      { ...valid, members: [{ name: "A", email: "a@x.edu", role: "janitor" }] },
      { ...valid, members: [member("Dup"), member("Dup")] },
    ];
    for (const body of cases) {
      const res = await api.post("/api/v1/projects").send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("validation_error");
      expect(res.body.error.details.length).toBeGreaterThan(0);
    }
  });

  it("rejects unknown academic units with 400 and saves nothing", async () => {
    const before = (await pool.query("SELECT count(*)::int n FROM projects")).rows[0].n;
    const res = await api.post("/api/v1/projects").send({ ...valid, title: "Ghost", unit_ids: ["lab-sail", "lab-nope"] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("unknown_academic_unit");
    expect(res.body.error.details.unknown_unit_ids).toEqual(["lab-nope"]);
    expect((await pool.query("SELECT count(*)::int n FROM projects")).rows[0].n).toBe(before);
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await api.post("/api/v1/projects").set("Content-Type", "application/json").send("{oops");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_json");
  });
});

describe("GET /api/v1/projects/:id", () => {
  it("returns the project with members, units and artifact counts", async () => {
    const p = await createProject({ ...valid, title: "Read me" });
    await addManuscript(p.id, { title: "M1" });
    await addManuscript(p.id, { title: "M2" });
    await addVideo(p.id);

    const res = await api.get(`/api/v1/projects/${p.id}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Read me");
    expect(res.body.members).toHaveLength(2);
    expect(res.body.academic_units).toHaveLength(3);
    expect(res.body.artifact_counts).toEqual({ manuscripts: 2, videos: 1, repositories: 0 });
  });

  it("returns 404 for unknown and malformed ids", async () => {
    for (const id of [KNOWN_MISSING_ID, "not-a-uuid"]) {
      const res = await api.get(`/api/v1/projects/${id}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("project_not_found");
    }
  });
});

describe("PUT /api/v1/projects/:id", () => {
  it("updates fields, members and units and bumps revision_version and updated_at", async () => {
    const p = await createProject({ ...valid, title: "Before" });
    const res = await api.put(`/api/v1/projects/${p.id}`).send({
      title: "After",
      description: "new text",
      members: [member("Sara", "advisor")],
      unit_ids: ["lab-hci"],
    });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("After");
    expect(res.body.description).toBe("new text");
    expect(res.body.revision_version).toBe(2);
    expect(res.body.members).toEqual([expect.objectContaining({ name: "Sara", role: "advisor" })]);
    expect(res.body.academic_units.map((u: any) => u.id)).toEqual(["lab-hci"]);
    expect(new Date(res.body.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(p.updated_at).getTime());
    expect(res.body.created_at).toBe(p.created_at);

    const again = await api.put(`/api/v1/projects/${p.id}`).send({ title: "After", members: [member("Sara")], unit_ids: ["lab-hci"] });
    expect(again.body.revision_version).toBe(3);
    expect(again.body.description).toBe(""); // PUT replaces: omitted description resets to empty
  });

  it("returns 404 for unknown ids, 400 for bad bodies, and leaves data unchanged on failure", async () => {
    expect((await api.put(`/api/v1/projects/${KNOWN_MISSING_ID}`).send(valid)).status).toBe(404);

    const p = await createProject({ ...valid, title: "Stable" });
    expect((await api.put(`/api/v1/projects/${p.id}`).send({ ...valid, members: [] })).status).toBe(400);
    // unknown unit fails midway through the transaction -> everything rolls back
    const bad = await api.put(`/api/v1/projects/${p.id}`).send({ ...valid, title: "Changed", unit_ids: ["nope"] });
    expect(bad.status).toBe(400);
    const after = (await api.get(`/api/v1/projects/${p.id}`)).body;
    expect(after.title).toBe("Stable");
    expect(after.revision_version).toBe(1);
    expect(after.members).toHaveLength(2);
    expect(after.academic_units).toHaveLength(3);
  });
});

describe("DELETE /api/v1/projects/:id", () => {
  it("deletes the project, its artifacts and its stored files", async () => {
    const p = await createProject({ ...valid, title: "Delete me" });
    const stored = path.join(uploadRoot, "to-delete.pdf");
    await writeFile(stored, "pdf bytes");
    await addManuscript(p.id, { title: "M", file: stored });
    await addVideo(p.id);

    const res = await api.delete(`/api/v1/projects/${p.id}`);
    expect(res.status).toBe(204);
    expect((await api.get(`/api/v1/projects/${p.id}`)).status).toBe(404);
    expect((await pool.query("SELECT 1 FROM artifacts WHERE project_id=$1", [p.id])).rowCount).toBe(0);
    await expect(readFile(stored)).rejects.toThrow(); // file is gone
  });

  it("never deletes files outside the upload folder", async () => {
    const outsideDir = await mkdtemp(path.join(os.tmpdir(), "pp-outside-"));
    const outside = path.join(outsideDir, "keep.txt");
    await writeFile(outside, "keep");
    const p = await createProject({ ...valid, title: "Sneaky" });
    await addManuscript(p.id, { title: "M", file: outside });

    expect((await api.delete(`/api/v1/projects/${p.id}`)).status).toBe(204);
    expect(await readFile(outside, "utf8")).toBe("keep");
    await rm(outsideDir, { recursive: true, force: true });
  });

  it("returns 404 for unknown ids and on a second delete", async () => {
    expect((await api.delete(`/api/v1/projects/${KNOWN_MISSING_ID}`)).status).toBe(404);
    const p = await createProject({ ...valid, title: "Twice" });
    expect((await api.delete(`/api/v1/projects/${p.id}`)).status).toBe(204);
    expect((await api.delete(`/api/v1/projects/${p.id}`)).status).toBe(404);
  });
});

describe("GET /api/v1/projects (search)", () => {
  // Step 3: a fixed data set in its own corner of the database (titles all start with "S-").
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await pool.query("DELETE FROM projects");
    const one = await createProject({
      title: "S-Secure Agents", description: "Studying agent pipelines",
      members: [member("A1")], unit_ids: ["lab-sail", "prog-mscis", "c-cs763-f26"],
    });
    const two = await createProject({
      title: "S-Campus Navigator", description: "AR navigation for campus",
      members: [member("B1")], unit_ids: ["lab-hci", "prog-msse", "c-cs673-f26"],
    });
    const three = await createProject({
      title: "S-Eye Tracking", description: "Measuring gaze",
      members: [member("C1")], unit_ids: ["lab-hci", "prog-mscis"],
    });
    ids.one = one.id; ids.two = two.id; ids.three = three.id;

    await addManuscript(one.id, { title: "LLM Security Findings", abstract: "We measure vulnerabilities", keywords: ["devsecops", "llm"] });
    await addVideo(one.id);
    await addRepo(two.id);
    await addManuscript(three.id, { title: "Gaze Metrics", abstract: "Saccade analysis", keywords: ["eyetracking"] });
    await addRepo(three.id);

    // created_at is protected by the trigger, so we pause it to backdate two projects.
    await pool.query("ALTER TABLE projects DISABLE TRIGGER trg_projects_bump_revision");
    await pool.query("UPDATE projects SET created_at = '2025-01-10T12:00:00Z' WHERE id = $1", [one.id]);
    await pool.query("UPDATE projects SET created_at = '2025-06-15T12:00:00Z' WHERE id = $1", [two.id]);
    await pool.query("ALTER TABLE projects ENABLE TRIGGER trg_projects_bump_revision");
  });

  const search = async (qs: string) => {
    const res = await api.get(`/api/v1/projects?${qs}`);
    expect(res.status).toBe(200);
    return res.body as { items: { id: string; title: string }[]; total: number; page: number; page_size: number };
  };
  const titles = (b: { items: { title: string }[] }) => b.items.map((i) => i.title).sort();

  it("with no filters returns everything, newest first, with paging info", async () => {
    const body = await search("");
    expect(body.total).toBe(3);
    expect(body.page).toBe(1);
    expect(body.page_size).toBe(20);
    expect(body.items.map((i) => i.title)).toEqual(["S-Eye Tracking", "S-Campus Navigator", "S-Secure Agents"]);
    expect(body.items[0]).toHaveProperty("artifact_counts");
  });

  it("keyword matches title, description, manuscript title, abstract and keywords (case-insensitive)", async () => {
    expect(titles(await search("keyword=secure"))).toEqual(["S-Secure Agents"]); // title
    expect(titles(await search("keyword=NAVIGATION"))).toEqual(["S-Campus Navigator"]); // description
    expect(titles(await search("keyword=llm%20security"))).toEqual(["S-Secure Agents"]); // manuscript title
    expect(titles(await search("keyword=saccade"))).toEqual(["S-Eye Tracking"]); // manuscript abstract
    expect(titles(await search("keyword=devsecops"))).toEqual(["S-Secure Agents"]); // manuscript keyword
    expect((await search("keyword=nothing-matches-this")).total).toBe(0);
  });

  it("treats % and _ in keyword as literal text", async () => {
    expect((await search("keyword=%25")).total).toBe(0);
    expect((await search("keyword=_")).total).toBe(0);
  });

  it("filters by lab_id, program_id, dept_id alias and course_id", async () => {
    expect(titles(await search("lab_id=lab-hci"))).toEqual(["S-Campus Navigator", "S-Eye Tracking"]);
    expect(titles(await search("program_id=prog-mscis"))).toEqual(["S-Eye Tracking", "S-Secure Agents"]);
    expect(titles(await search("dept_id=prog-msse"))).toEqual(["S-Campus Navigator"]);
    expect(titles(await search("course_id=c-cs763-f26"))).toEqual(["S-Secure Agents"]);
    expect((await search("lab_id=c-cs763-f26")).total).toBe(0); // a course id is not a lab
  });

  it("combines lab and program filters (AND)", async () => {
    expect(titles(await search("lab_id=lab-hci&program_id=prog-mscis"))).toEqual(["S-Eye Tracking"]);
  });

  it("filters by has_artifact_type, single and comma-separated (must have all listed)", async () => {
    expect(titles(await search("has_artifact_type=videos"))).toEqual(["S-Secure Agents"]);
    expect(titles(await search("has_artifact_type=repositories"))).toEqual(["S-Campus Navigator", "S-Eye Tracking"]);
    expect(titles(await search("has_artifact_type=manuscripts,repositories"))).toEqual(["S-Eye Tracking"]);
    expect((await search("has_artifact_type=videos,repositories")).total).toBe(0);
  });

  it("filters by created_from / created_to (date-only to is inclusive)", async () => {
    expect(titles(await search("created_to=2025-06-15"))).toEqual(["S-Campus Navigator", "S-Secure Agents"]);
    expect(titles(await search("created_to=2025-06-14"))).toEqual(["S-Secure Agents"]);
    expect(titles(await search("created_from=2025-02-01&created_to=2025-12-31"))).toEqual(["S-Campus Navigator"]);
    expect(titles(await search("created_from=2025-06-15T13:00:00Z"))).toEqual(["S-Eye Tracking"]);
  });

  it("combines keyword + unit + artifact type + date", async () => {
    const body = await search("keyword=gaze&lab_id=lab-hci&has_artifact_type=manuscripts&created_from=2026-01-01");
    expect(titles(body)).toEqual(["S-Eye Tracking"]);
    const none = await search("keyword=gaze&lab_id=lab-sail");
    expect(none.total).toBe(0);
  });

  it("sorts by title and created_at in both directions", async () => {
    expect((await search("sort=title")).items.map((i) => i.title)).toEqual(["S-Campus Navigator", "S-Eye Tracking", "S-Secure Agents"]);
    expect((await search("sort=title:desc")).items.map((i) => i.title)).toEqual(["S-Secure Agents", "S-Eye Tracking", "S-Campus Navigator"]);
    expect((await search("sort=created_at:asc")).items.map((i) => i.title)).toEqual(["S-Secure Agents", "S-Campus Navigator", "S-Eye Tracking"]);
  });

  it("paginates and reports the total", async () => {
    const p1 = await search("sort=title&page=1&page_size=2");
    expect(p1.items.map((i) => i.title)).toEqual(["S-Campus Navigator", "S-Eye Tracking"]);
    expect(p1.total).toBe(3);
    const p2 = await search("sort=title&page=2&page_size=2");
    expect(p2.items.map((i) => i.title)).toEqual(["S-Secure Agents"]);
    expect((await search("page=9")).items).toEqual([]);
  });

  it("returns 400 for invalid parameters", async () => {
    const bad = [
      "has_artifact_type=books", "sort=author", "sort=title:up", "page=0", "page_size=1000", "page=abc",
      "created_from=yesterday", "created_to=2025-02-31", "created_from=2025-02-01&created_to=2025-01-01",
      "lab_id=a&lab_id=b", "program_id=x&dept_id=y",
    ];
    for (const qs of bad) {
      const res = await api.get(`/api/v1/projects?${qs}`);
      expect(res.status, qs).toBe(400);
      expect(res.body.error.code).toBe("validation_error");
    }
  });
});
