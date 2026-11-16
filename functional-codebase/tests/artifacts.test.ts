// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Implement artifact endpoints (manuscripts, videos, repositories) with git-host mock enrichment"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: none yet
// Verification: this file (vitest + supertest, needs DATABASE_URL)
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
let projectId: string;
let otherProjectId: string;

const MISSING = "00000000-0000-4000-8000-000000000000";
const base = () => `/api/v1/projects/${projectId}/artifacts`;

// Step 1: a fresh schema, two projects (the second one proves artifacts do not leak between projects).
beforeAll(async () => {
  ({ pool, drop } = await createTestSchema());
  await runMigrations(pool);
  await seed(pool);
  await pool.query("DELETE FROM projects");
  api = request(createApp(() => pool));
  uploadRoot = await mkdtemp(path.join(os.tmpdir(), "pp-art-uploads-"));
  process.env.FILE_STORAGE_DIR = uploadRoot;

  const body = {
    title: "Host project",
    members: [{ name: "Mia", email: "mia@x.edu", role: "student" }],
    unit_ids: ["lab-sail"],
  };
  projectId = (await api.post("/api/v1/projects").send(body)).body.id;
  otherProjectId = (await api.post("/api/v1/projects").send({ ...body, title: "Other project" })).body.id;
});
afterAll(async () => {
  await drop();
  await rm(uploadRoot, { recursive: true, force: true });
  delete process.env.FILE_STORAGE_DIR;
});

const manuscript = {
  title: "LLM Security Findings",
  abstract: "We measure vulnerabilities.",
  authors: ["Mia Chen", "Leo Park"],
  keywords: ["devsecops", "llm"],
  year: 2026,
  publisher: "ACM",
};
const video = {
  video_url: "https://videos.example.edu/demo.mp4",
  thumbnail_url: "https://videos.example.edu/demo.png",
  duration_seconds: 185,
  description: "Final demo",
};
const repository = {
  repo_url: "https://example.org/team/project", // not in the mock, so nothing is filled in
  target_branch: "release",
  primary_tech_stack: "Go",
  total_commit_count: 321,
  latest_commit_at: "2026-10-01T10:00:00Z",
};

const post = (type: string, body: unknown, pid = projectId) =>
  api.post(`/api/v1/projects/${pid}/artifacts/${type}`).send(body as object);

// ---------------------------------------------------------------------------
describe("POST /projects/:id/artifacts/:type", () => {
  it("creates a manuscript (201, own UUID, no stored path exposed)", async () => {
    const res = await post("manuscripts", manuscript);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      project_id: projectId,
      artifact_type: "manuscripts",
      ...manuscript,
      has_file: false,
      original_file_name: null,
      file_size_bytes: null,
      file_sha256: null,
    });
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body).not.toHaveProperty("stored_file_path");
    expect(res.headers.location).toBe(`${base()}/manuscripts/${res.body.id}`);
  });

  it("creates a manuscript with only a title (optional publisher/year stay null)", async () => {
    const res = await post("manuscripts", { title: "Bare" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ abstract: "", authors: [], keywords: [], year: null, publisher: null });
  });

  it("creates a video", async () => {
    const res = await post("videos", video);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ artifact_type: "videos", ...video });
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("creates a repository, keeping client-provided values", async () => {
    const res = await post("repositories", repository);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ artifact_type: "repositories", ...repository, latest_commit_at: "2026-10-01T10:00:00.000Z" });
  });

  it("fills a repository from the mock git host when fields are missing", async () => {
    const res = await post("repositories", { repo_url: "https://github.com/bu-met-sail/agent-pipeline-study" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      target_branch: "main",
      primary_tech_stack: "TypeScript",
      latest_commit_at: "2026-10-30T18:22:00.000Z",
      total_commit_count: null, // the mock has no commit count, so we do not invent one
    });

    const gitlab = await post("repositories", { repo_url: "https://GitLab.com/hci-lab/Eye-Tracking-Toolkit.git" });
    expect(gitlab.body).toMatchObject({ target_branch: "develop", primary_tech_stack: "Python" });
  });

  it("does not override provided values with mock values, and fills only the missing ones", async () => {
    const res = await post("repositories", {
      repo_url: "https://github.com/bu-met-sail/agent-pipeline-study",
      target_branch: "feature-x",
    });
    expect(res.body).toMatchObject({ target_branch: "feature-x", primary_tech_stack: "TypeScript" });
  });

  it("defaults target_branch to main for repositories that are not in the mock", async () => {
    const res = await post("repositories", { repo_url: "https://github.com/nobody/nothing" });
    expect(res.body).toMatchObject({ target_branch: "main", primary_tech_stack: null, latest_commit_at: null });
  });

  it("rejects invalid bodies with 400 for every type", async () => {
    const bad: [string, unknown][] = [
      ["manuscripts", {}],
      ["manuscripts", { title: "" }],
      ["manuscripts", { title: "T", year: 1700 }],
      ["manuscripts", { title: "T", authors: "not-a-list" }],
      ["videos", {}],
      ["videos", { video_url: "javascript:alert(1)" }],
      ["videos", { video_url: "https://v.example/x", duration_seconds: -5 }],
      ["repositories", {}],
      ["repositories", { repo_url: "not a url" }],
      ["repositories", { repo_url: "https://github.com/a/b", total_commit_count: 1.5 }],
      ["repositories", { repo_url: "https://github.com/a/b", latest_commit_at: "yesterday" }],
    ];
    for (const [type, body] of bad) {
      const res = await post(type, body);
      expect(res.status, `${type} ${JSON.stringify(body)}`).toBe(400);
      expect(res.body.error.code).toBe("validation_error");
    }
  });

  it("returns 404 for an unknown project and an unknown artifact type", async () => {
    expect((await post("videos", video, MISSING)).status).toBe(404);
    expect((await post("videos", video, "not-a-uuid")).status).toBe(404);
    const res = await post("podcasts", video);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("unknown_artifact_type");
  });
});

// ---------------------------------------------------------------------------
describe("GET /projects/:id/artifacts and /artifacts/:type (lists)", () => {
  it("groups all artifacts of a project by type, and keeps projects separate", async () => {
    const res = await api.get(base());
    expect(res.status).toBe(200);
    expect(res.body.project_id).toBe(projectId);
    expect(res.body.manuscripts).toHaveLength(2);
    expect(res.body.videos).toHaveLength(1);
    expect(res.body.repositories).toHaveLength(5);

    const other = await api.get(`/api/v1/projects/${otherProjectId}/artifacts`);
    expect(other.body).toEqual({ project_id: otherProjectId, manuscripts: [], videos: [], repositories: [] });
  });

  it("lists one type with a total", async () => {
    const res = await api.get(`${base()}/manuscripts`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ project_id: projectId, artifact_type: "manuscripts", total: 2 });
    expect(res.body.items.map((i: any) => i.title)).toEqual(["LLM Security Findings", "Bare"]);

    expect((await api.get(`${base()}/videos`)).body.total).toBe(1);
    expect((await api.get(`${base()}/repositories`)).body.total).toBe(5);
    expect((await api.get(`/api/v1/projects/${otherProjectId}/artifacts/videos`)).body.items).toEqual([]);
  });

  it("returns 404 for an unknown project or artifact type", async () => {
    expect((await api.get(`/api/v1/projects/${MISSING}/artifacts`)).status).toBe(404);
    expect((await api.get(`/api/v1/projects/${MISSING}/artifacts/videos`)).status).toBe(404);
    expect((await api.get(`${base()}/podcasts`)).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe("GET /projects/:id/artifacts/:type/:artifact_id", () => {
  it("reads one artifact of each type", async () => {
    for (const [type, body] of [["manuscripts", manuscript], ["videos", video]] as const) {
      const id = (await api.get(`${base()}/${type}`)).body.items[0].id;
      const res = await api.get(`${base()}/${type}/${id}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id, artifact_type: type, ...body });
    }
    const repoId = (await api.get(`${base()}/repositories`)).body.items[0].id;
    const repo = await api.get(`${base()}/repositories/${repoId}`);
    expect(repo.status).toBe(200);
    expect(repo.body.repo_url).toBe(repository.repo_url);
  });

  it("returns 404 for unknown ids, wrong type, other project's artifact, unknown project", async () => {
    const videoId = (await api.get(`${base()}/videos`)).body.items[0].id;
    const cases = [
      `${base()}/videos/${MISSING}`,
      `${base()}/videos/not-a-uuid`,
      `${base()}/manuscripts/${videoId}`, // right id, wrong type
      `/api/v1/projects/${otherProjectId}/artifacts/videos/${videoId}`, // right id, wrong project
      `/api/v1/projects/${MISSING}/artifacts/videos/${videoId}`,
    ];
    for (const url of cases) {
      const res = await api.get(url);
      expect(res.status, url).toBe(404);
    }
    expect((await api.get(`${base()}/videos/${MISSING}`)).body.error.code).toBe("artifact_not_found");
  });
});

// ---------------------------------------------------------------------------
describe("PUT /projects/:id/artifacts/:type/:artifact_id", () => {
  it("updates a manuscript, refreshes updated_at and keeps file info", async () => {
    const created = (await post("manuscripts", { title: "To edit", publisher: "IEEE" })).body;
    // pretend a file was uploaded earlier (the upload endpoint comes later)
    await pool.query(
      `UPDATE manuscripts SET stored_file_path='x.pdf', original_file_name='paper.pdf', file_size_bytes=42, file_sha256=$2
       WHERE artifact_id=$1`,
      [created.id, "b".repeat(64)],
    );

    const res = await api.put(`${base()}/manuscripts/${created.id}`).send({ title: "Edited", keywords: ["k"] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: created.id,
      title: "Edited",
      keywords: ["k"],
      publisher: null, // PUT replaces: omitted optional fields are cleared
      has_file: true,
      original_file_name: "paper.pdf",
      file_size_bytes: 42,
      file_sha256: "b".repeat(64),
    });
    expect(res.body.created_at).toBe(created.created_at);
    expect(new Date(res.body.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(created.updated_at).getTime());
  });

  it("updates a video", async () => {
    const id = (await post("videos", { video_url: "https://v.example/a" })).body.id;
    const res = await api.put(`${base()}/videos/${id}`).send({ ...video, duration_seconds: 60 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, ...video, duration_seconds: 60 });
  });

  it("updates a repository and fills missing fields from the mock", async () => {
    const id = (await post("repositories", { repo_url: "https://example.org/a/b" })).body.id;
    const res = await api
      .put(`${base()}/repositories/${id}`)
      .send({ repo_url: "https://github.com/mchen-bu/campus-ar-navigator", total_commit_count: 99 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      repo_url: "https://github.com/mchen-bu/campus-ar-navigator",
      target_branch: "main",
      primary_tech_stack: "Kotlin",
      total_commit_count: 99,
      latest_commit_at: "2026-09-14T09:05:00.000Z",
    });
  });

  it("returns 400 for invalid bodies and leaves the artifact unchanged", async () => {
    const id = (await post("videos", { video_url: "https://v.example/keep" })).body.id;
    const res = await api.put(`${base()}/videos/${id}`).send({ video_url: "nope" });
    expect(res.status).toBe(400);
    expect((await api.get(`${base()}/videos/${id}`)).body.video_url).toBe("https://v.example/keep");
  });

  it("returns 404 for unknown ids, wrong type and wrong project", async () => {
    const videoId = (await api.get(`${base()}/videos`)).body.items[0].id;
    expect((await api.put(`${base()}/videos/${MISSING}`).send(video)).status).toBe(404);
    expect((await api.put(`${base()}/manuscripts/${videoId}`).send(manuscript)).status).toBe(404);
    expect((await api.put(`/api/v1/projects/${otherProjectId}/artifacts/videos/${videoId}`).send(video)).status).toBe(404);
    expect((await api.put(`/api/v1/projects/${MISSING}/artifacts/videos/${videoId}`).send(video)).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe("DELETE /projects/:id/artifacts/:type/:artifact_id", () => {
  it("deletes a video and a repository", async () => {
    for (const [type, body] of [["videos", video], ["repositories", repository]] as const) {
      const id = (await post(type, body)).body.id;
      expect((await api.delete(`${base()}/${type}/${id}`)).status).toBe(204);
      expect((await api.get(`${base()}/${type}/${id}`)).status).toBe(404);
      expect((await pool.query("SELECT 1 FROM artifacts WHERE id=$1", [id])).rowCount).toBe(0);
    }
  });

  it("deletes a manuscript and its stored file", async () => {
    const id = (await post("manuscripts", { title: "With file" })).body.id;
    const stored = path.join(uploadRoot, "with-file.pdf");
    await writeFile(stored, "bytes");
    await pool.query(
      `UPDATE manuscripts SET stored_file_path=$2, original_file_name='a.pdf', file_size_bytes=5, file_sha256=$3 WHERE artifact_id=$1`,
      [id, stored, "c".repeat(64)],
    );

    expect((await api.delete(`${base()}/manuscripts/${id}`)).status).toBe(204);
    await expect(readFile(stored)).rejects.toThrow();
    expect((await pool.query("SELECT 1 FROM manuscripts WHERE artifact_id=$1", [id])).rowCount).toBe(0);
  });

  it("deletes a manuscript that never had a file", async () => {
    const id = (await post("manuscripts", { title: "No file" })).body.id;
    expect((await api.delete(`${base()}/manuscripts/${id}`)).status).toBe(204);
  });

  it("returns 404 for unknown ids, wrong type, wrong project, and on repeat deletes — without deleting anything", async () => {
    const id = (await post("videos", video)).body.id;
    expect((await api.delete(`${base()}/videos/${MISSING}`)).status).toBe(404);
    expect((await api.delete(`${base()}/manuscripts/${id}`)).status).toBe(404);
    expect((await api.delete(`/api/v1/projects/${otherProjectId}/artifacts/videos/${id}`)).status).toBe(404);
    expect((await api.delete(`/api/v1/projects/${MISSING}/artifacts/videos/${id}`)).status).toBe(404);
    expect((await api.get(`${base()}/videos/${id}`)).status).toBe(200); // still there

    expect((await api.delete(`${base()}/videos/${id}`)).status).toBe(204);
    expect((await api.delete(`${base()}/videos/${id}`)).status).toBe(404);
  });
});
