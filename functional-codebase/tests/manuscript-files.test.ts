// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Implement manuscript file upload, download, delete and zip download"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Read every test line by line, no changes; notes in .ai_logs/conceptual_journal.md
// Verification: Read through the tests and ran them, all pass
// Language/Stack: TypeScript / Node.js 22 / Vitest + Supertest / PostgreSQL 16
// Confidence: Medium

import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
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
let storage: string;
let projectId: string;
let otherProjectId: string;

const MISSING = "00000000-0000-4000-8000-000000000000";
const sha256 = (data: Buffer | Uint8Array) => createHash("sha256").update(data).digest("hex");

// Two small sample "manuscripts". The first one has some non-text bytes in it to prove binary data survives.
const fileOne = Buffer.concat([Buffer.from("%PDF-1.4 sample one\n"), Buffer.from([0, 1, 2, 255, 254, 128])]);
const fileTwo = Buffer.from("%PDF-1.4 sample two, a bit longer than the first sample file\n".repeat(20));

// supertest only buffers text/JSON by default, so for files we collect the bytes ourselves
const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

const url = (suffix: string, pid = projectId) => `/api/v1/projects/${pid}/artifacts/manuscripts${suffix}`;
const download = (suffix: string, pid = projectId) => api.get(url(suffix, pid)).buffer(true).parse(binary);

async function newManuscript(title: string, pid = projectId): Promise<string> {
  const res = await api.post(url("", pid)).send({ title });
  expect(res.status).toBe(201);
  return res.body.id;
}
const upload = (id: string, content: Buffer | string, name = "paper.pdf", pid = projectId, field = "file") =>
  api.post(url(`/${id}/file`, pid)).attach(field, Buffer.from(content), name);

// All files below the storage folder (relative paths), to check what is really on disk.
async function filesOnDisk(dir = storage): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await filesOnDisk(full)));
    else out.push(path.relative(storage, full));
  }
  return out;
}

beforeAll(async () => {
  ({ pool, drop } = await createTestSchema());
  await runMigrations(pool);
  await seed(pool);
  await pool.query("DELETE FROM projects");
  api = request(createApp(() => pool));
  storage = await mkdtemp(path.join(os.tmpdir(), "pp-files-"));
  process.env.FILE_STORAGE_DIR = storage;

  const body = {
    title: "Files project",
    members: [{ name: "Mia", email: "mia@x.edu", role: "student" }],
    unit_ids: ["lab-sail"],
  };
  projectId = (await api.post("/api/v1/projects").send(body)).body.id;
  otherProjectId = (await api.post("/api/v1/projects").send({ ...body, title: "Other" })).body.id;
});
afterAll(async () => {
  await drop();
  await rm(storage, { recursive: true, force: true });
  delete process.env.FILE_STORAGE_DIR;
  delete process.env.MAX_UPLOAD_BYTES;
});

// ---------------------------------------------------------------------------
describe("upload, download, zip and delete (main flow)", () => {
  let idOne: string;
  let idTwo: string;

  it("uploads two files and records original name, size and SHA-256", async () => {
    idOne = await newManuscript("Paper one");
    idTwo = await newManuscript("Paper two");

    const one = await upload(idOne, fileOne, "first paper.pdf");
    expect(one.status).toBe(201);
    expect(one.body).toMatchObject({
      id: idOne,
      has_file: true,
      original_file_name: "first paper.pdf",
      file_size_bytes: fileOne.length,
      file_sha256: sha256(fileOne),
    });
    expect(one.body).not.toHaveProperty("stored_file_path");

    const two = await upload(idTwo, fileTwo, "second.pdf");
    expect(two.status).toBe(201);
    expect(two.body).toMatchObject({ file_size_bytes: fileTwo.length, file_sha256: sha256(fileTwo) });

    // the record is also visible through the normal artifact GET
    const read = await api.get(url(`/${idOne}`));
    expect(read.body).toMatchObject({ has_file: true, original_file_name: "first paper.pdf", file_sha256: sha256(fileOne) });

    // files are on disk under <storage>/<project>/<artifact>/, not under the user's file name
    const onDisk = await filesOnDisk();
    expect(onDisk).toHaveLength(2);
    for (const rel of onDisk) {
      expect(rel.startsWith(`${projectId}${path.sep}`)).toBe(true);
      expect(rel).not.toContain("paper");
    }
  });

  it("downloads each file with its original name, and the SHA-256 matches the upload", async () => {
    const one = await download(`/${idOne}/file`);
    expect(one.status).toBe(200);
    expect(one.headers["content-disposition"]).toContain("attachment");
    expect(one.headers["content-disposition"]).toContain("first paper.pdf");
    expect(one.headers["content-type"]).toContain("application/pdf");
    expect(sha256(one.body)).toBe(sha256(fileOne));
    expect(one.body.equals(fileOne)).toBe(true);

    const two = await download(`/${idTwo}/file`);
    expect(two.status).toBe(200);
    expect(two.headers["content-disposition"]).toContain("second.pdf");
    expect(sha256(two.body)).toBe(sha256(fileTwo));
  });

  it("downloads all files as one zip containing both, under their original names", async () => {
    const res = await download("/download");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/zip");
    expect(res.headers["content-disposition"]).toContain(`manuscripts-${projectId}.zip`);

    const entries = unzipSync(new Uint8Array(res.body));
    expect(Object.keys(entries).sort()).toEqual(["first paper.pdf", "second.pdf"]);
    expect(sha256(entries["first paper.pdf"])).toBe(sha256(fileOne));
    expect(sha256(entries["second.pdf"])).toBe(sha256(fileTwo));
  });

  it("matches /download before /{artifact_id}: it is a zip, not an artifact lookup", async () => {
    const res = await download("/download");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).not.toContain("json");
    // an artifact route with the same word is a plain 404 on the other (generic) route
    expect((await api.get(`/api/v1/projects/${projectId}/artifacts/videos/download`)).status).toBe(404);
  });

  it("deletes one file: record fields are cleared, file is gone, other file and the record stay", async () => {
    const res = await api.delete(url(`/${idOne}/file`));
    expect(res.status).toBe(204);

    const read = await api.get(url(`/${idOne}`));
    expect(read.status).toBe(200); // the manuscript record itself still exists
    expect(read.body).toMatchObject({
      title: "Paper one",
      has_file: false,
      original_file_name: null,
      file_size_bytes: null,
      file_sha256: null,
    });
    expect((await download(`/${idOne}/file`)).status).toBe(404);
    expect((await api.delete(url(`/${idOne}/file`))).status).toBe(404); // nothing left to delete

    // only the second file remains on disk, and the first one's folders were cleaned up
    const onDisk = await filesOnDisk();
    expect(onDisk).toHaveLength(1);
    expect(onDisk[0]).toContain(idTwo);

    // the zip now has just the second file
    const zip = unzipSync(new Uint8Array((await download("/download")).body));
    expect(Object.keys(zip)).toEqual(["second.pdf"]);
  });
});

// ---------------------------------------------------------------------------
describe("upload validation and errors", () => {
  it("returns 400 when no file is sent, the field name is wrong, or the file is empty", async () => {
    const id = await newManuscript("Validation");

    const none = await api.post(url(`/${id}/file`)).send({ hello: "world" });
    expect(none.status).toBe(400);
    expect(none.body.error.code).toBe("file_required");

    const wrongField = await upload(id, "data", "x.pdf", projectId, "document");
    expect(wrongField.status).toBe(400);
    expect(wrongField.body.error.code).toBe("invalid_upload");

    const empty = await upload(id, "", "empty.pdf");
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe("empty_file");

    // nothing was saved: the record has no file and no stray files or folders are left
    expect((await api.get(url(`/${id}`))).body.has_file).toBe(false);
    expect(await filesOnDisk()).not.toEqual(expect.arrayContaining([expect.stringContaining(id)]));
  });

  it("returns 413 for files over MAX_UPLOAD_BYTES and saves nothing", async () => {
    const id = await newManuscript("Too big");
    process.env.MAX_UPLOAD_BYTES = "100";
    try {
      const res = await upload(id, Buffer.alloc(500, 1), "big.pdf");
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe("file_too_large");
    } finally {
      delete process.env.MAX_UPLOAD_BYTES;
    }
    expect((await api.get(url(`/${id}`))).body.has_file).toBe(false);
    expect((await filesOnDisk()).some((f) => f.includes(id))).toBe(false);
  });

  it("returns 404 for unknown project, unknown artifact, other project's artifact and non-manuscript ids", async () => {
    const id = await newManuscript("Owner check");
    const video = (
      await api
        .post(`/api/v1/projects/${projectId}/artifacts/videos`)
        .send({ video_url: "https://v.example/x" })
    ).body.id;

    expect((await upload(id, "x", "a.pdf", MISSING)).status).toBe(404);
    expect((await upload(MISSING, "x")).status).toBe(404);
    expect((await upload("not-a-uuid", "x")).status).toBe(404);
    expect((await upload(id, "x", "a.pdf", otherProjectId)).status).toBe(404);
    expect((await upload(video, "x")).status).toBe(404); // a video id is not a manuscript

    expect((await download(`/${MISSING}/file`)).status).toBe(404);
    expect((await download(`/${id}/file`, MISSING)).status).toBe(404);
    expect((await download(`/${id}/file`, otherProjectId)).status).toBe(404);
    expect((await api.delete(url(`/${MISSING}/file`))).status).toBe(404);
    expect((await api.delete(url(`/${id}/file`, MISSING))).status).toBe(404);
    expect((await api.delete(url(`/${id}/file`, otherProjectId))).status).toBe(404);
    expect((await download("/download", MISSING)).status).toBe(404);
  });

  it("returns 404 file_not_found when downloading a manuscript without a file", async () => {
    const id = await newManuscript("No file yet");
    const res = await download(`/${id}/file`);
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body.toString()).error.code).toBe("file_not_found");
  });

  it("returns 404 file_missing when the stored file vanished from disk", async () => {
    const id = await newManuscript("Vanished");
    await upload(id, "some bytes", "v.pdf");
    const dir = path.join(storage, projectId, id);
    for (const f of await readdir(dir)) await rm(path.join(dir, f));
    const res = await download(`/${id}/file`);
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body.toString()).error.code).toBe("file_missing");
    await api.delete(url(`/${id}/file`)); // cleaning up the record still works
    expect((await api.get(url(`/${id}`))).body.has_file).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("file names, replacing files and the zip edge cases", () => {
  it("replacing a file updates the record and removes the old file from disk", async () => {
    const id = await newManuscript("Replace me");
    await upload(id, "old content", "old.pdf");
    const before = (await filesOnDisk()).filter((f) => f.includes(id));
    expect(before).toHaveLength(1);

    const res = await upload(id, "brand new content", "new.pdf");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ original_file_name: "new.pdf", file_sha256: sha256(Buffer.from("brand new content")) });
    const after = (await filesOnDisk()).filter((f) => f.includes(id));
    expect(after).toHaveLength(1);
    expect(after[0]).not.toBe(before[0]);
    expect((await download(`/${id}/file`)).body.toString()).toBe("brand new content");
  });

  it("strips path parts from the original name and keeps unicode names", async () => {
    const tricky = await newManuscript("Tricky name");
    const sneaky = await upload(tricky, "x", "../../etc/evil.pdf");
    expect(sneaky.body.original_file_name).toBe("evil.pdf");

    const accented = await newManuscript("Accents");
    const res = await upload(accented, "x", "résumé de thèse.pdf");
    expect(res.body.original_file_name).toBe("résumé de thèse.pdf");
    const dl = await download(`/${accented}/file`);
    expect(dl.headers["content-disposition"]).toContain(encodeURIComponent("résumé de thèse.pdf"));
  });

  it("gives duplicate original names unique names inside the zip", async () => {
    const pid = (
      await api.post("/api/v1/projects").send({
        title: "Zip names",
        members: [{ name: "Mia", email: "mia@x.edu", role: "student" }],
        unit_ids: ["lab-sail"],
      })
    ).body.id;
    const a = await newManuscript("A", pid);
    const b = await newManuscript("B", pid);
    await newManuscript("C without a file", pid);
    await upload(a, "content A", "same.pdf", pid);
    await upload(b, "content B", "same.pdf", pid);

    const res = await download("/download", pid);
    const zip = unzipSync(new Uint8Array(res.body));
    expect(Object.keys(zip).sort()).toEqual(["same (2).pdf", "same.pdf"]);
    expect(Buffer.from(zip["same.pdf"]).toString()).toBe("content A"); // oldest manuscript keeps the plain name
    expect(Buffer.from(zip["same (2).pdf"]).toString()).toBe("content B");
  });

  it("returns 404 no_manuscript_files for a project without any uploaded file", async () => {
    const res = await download("/download", otherProjectId);
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body.toString()).error.code).toBe("no_manuscript_files");
    await newManuscript("Metadata only", otherProjectId);
    expect((await download("/download", otherProjectId)).status).toBe(404);
  });

  it("deleting a manuscript artifact or a project removes its stored files and folders", async () => {
    const pid = (
      await api.post("/api/v1/projects").send({
        title: "Cleanup",
        members: [{ name: "Mia", email: "mia@x.edu", role: "student" }],
        unit_ids: ["lab-sail"],
      })
    ).body.id;
    const a = await newManuscript("A", pid);
    const b = await newManuscript("B", pid);
    await upload(a, "aaa", "a.pdf", pid);
    await upload(b, "bbb", "b.pdf", pid);
    expect((await filesOnDisk()).filter((f) => f.startsWith(pid))).toHaveLength(2);

    expect((await api.delete(url(`/${a}`, pid))).status).toBe(204);
    expect((await filesOnDisk()).filter((f) => f.startsWith(pid))).toHaveLength(1);

    expect((await api.delete(`/api/v1/projects/${pid}`)).status).toBe(204);
    expect((await filesOnDisk()).filter((f) => f.startsWith(pid))).toHaveLength(0);
    await expect(readdir(path.join(storage, pid))).rejects.toThrow(); // folder removed too
  });
});
