// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Implement manuscript file upload, download, delete and zip download"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Reviewed line by line, no code changes (kept naive on purpose); notes in .ai_logs/conceptual_journal.md
// Verification: tests/manuscript-files.test.ts; human: reviewed line by line, ran npm run typecheck + npm test (7 files / 75 tests pass, real Postgres 16)
// Confidence: Medium

import { randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import type pg from "pg";
import { getArtifact } from "../artifacts-repo.js";
import { AppError } from "../errors.js";
import {
  clearManuscriptFile,
  getManuscriptFile,
  listManuscriptFiles,
  setManuscriptFile,
} from "../manuscript-files-repo.js";
import { deleteStoredFiles, removeEmptyParents, resolveStoredPath, sha256OfFile, storageDir } from "../storage.js";
import { safeFileName, streamZip, uniqueNames } from "../zip.js";
import { artifactIdOf, artifactNotFound, projectParam, requireProject } from "./params.js";

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const maxUploadBytes = () => Number(process.env.MAX_UPLOAD_BYTES) || DEFAULT_MAX_BYTES;

// Step 1: runs multer for one request and turns its errors into our JSON errors.
function receiveFile(upload: ReturnType<ReturnType<typeof multer>["single"]>, req: Request, res: Response) {
  return new Promise<void>((resolve, reject) => {
    upload(req, res, (err: unknown) => {
      if (!err) return resolve();
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return reject(new AppError(413, "file_too_large", `File is larger than ${maxUploadBytes()} bytes`));
        }
        return reject(new AppError(400, "invalid_upload", `${err.message}. Send one file in the form field "file"`));
      }
      // busboy (multer's parser) throws plain errors for broken multipart bodies
      if (err instanceof Error && /multipart|boundary|malformed|unexpected end/i.test(err.message)) {
        return reject(new AppError(400, "invalid_upload", "Malformed multipart/form-data body"));
      }
      reject(err);
    });
  });
}

const noFile = () => new AppError(404, "file_not_found", "This manuscript has no uploaded file");

// Step 2: this router is mounted on .../artifacts/manuscripts BEFORE the generic artifacts router,
// so "/download" is matched here and never treated as an {artifact_id}.
export function manuscriptFilesRouter(db: () => pg.Pool): Router {
  const router = Router({ mergeParams: true });

  // Step 3: zip of every manuscript file in the project
  router.get("/download", async (req, res) => {
    const projectId = await requireProject(db(), projectParam(req));
    const rows = await listManuscriptFiles(db(), projectId);

    // only include files that really exist on disk
    const found: { original: string; file: string }[] = [];
    for (const row of rows) {
      const file = resolveStoredPath(row.stored_file_path);
      if (file && (await stat(file).then((s) => s.isFile(), () => false))) {
        found.push({ original: safeFileName(row.original_file_name), file });
      } else {
        console.warn(`Manuscript file missing on disk, left out of zip: ${row.stored_file_path}`);
      }
    }
    if (found.length === 0) {
      throw new AppError(404, "no_manuscript_files", "This project has no uploaded manuscript files");
    }

    const names = uniqueNames(found.map((f) => f.original));
    res.attachment(`manuscripts-${projectId}.zip`);
    await streamZip(res, found.map((f, i) => ({ name: names[i], file: f.file })));
  });

  // Step 4: upload (or replace) the file of one manuscript
  router.post("/:artifact_id/file", async (req, res) => {
    const projectId = await requireProject(db(), projectParam(req));
    const artifactId = artifactIdOf(req.params.artifact_id);
    // check the manuscript exists BEFORE accepting any bytes
    if (!(await getManuscriptFile(db(), projectId, artifactId))) throw artifactNotFound();

    // files go to <storage>/<project>/<artifact>/<random id>; the user's file name is never used on disk
    const dir = path.join(storageDir(), projectId, artifactId);
    await mkdir(dir, { recursive: true });
    const upload = multer({
      storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, dir),
        filename: (_req, _file, cb) => cb(null, randomUUID()),
      }),
      limits: { fileSize: maxUploadBytes(), files: 1 },
      defParamCharset: "utf8", // so names like "résumé.pdf" are not garbled
    }).single("file");

    let previous: string | null = null;
    let storedPath: string | undefined;
    try {
      await receiveFile(upload, req, res);
      const received = req.file;
      if (!received) throw new AppError(400, "file_required", 'Send the file as multipart/form-data in the field "file"');
      storedPath = path.relative(storageDir(), received.path);
      if (received.size === 0) throw new AppError(400, "empty_file", "The uploaded file is empty");

      // Step 4a: hash the saved file, then record name, size and hash on the manuscript
      const sha256 = await sha256OfFile(received.path);
      const result = await setManuscriptFile(db(), projectId, artifactId, {
        storedPath,
        originalName: safeFileName(received.originalname),
        size: received.size,
        sha256,
      });
      if (!result) throw artifactNotFound(); // deleted while we were uploading
      previous = result.previous;
    } catch (err) {
      // nothing was saved, so remove what we wrote (and the empty folders)
      if (storedPath) await deleteStoredFiles([storedPath]);
      else await removeEmptyParents(path.join(dir, "x"));
      throw err;
    }

    // Step 4b: uploading again replaces the old file, so the old one is removed from disk
    if (previous) await deleteStoredFiles([previous]);
    const artifact = await getArtifact(db(), projectId, "manuscripts", artifactId);
    res.status(201).json(artifact);
  });

  // Step 5: download one file under its original name
  router.get("/:artifact_id/file", async (req, res) => {
    const projectId = await requireProject(db(), projectParam(req));
    const row = await getManuscriptFile(db(), projectId, artifactIdOf(req.params.artifact_id));
    if (!row) throw artifactNotFound();
    if (!row.stored_file_path || !row.original_file_name) throw noFile();

    const file = resolveStoredPath(row.stored_file_path);
    const exists = file ? await stat(file).then((s) => s.isFile(), () => false) : false;
    if (!file || !exists) throw new AppError(404, "file_missing", "The stored file is missing on the server");

    // the stored file has no extension, so we pick the content type from the original name
    const ext = path.extname(row.original_file_name);
    if (ext) res.type(ext);
    res.setHeader("X-Content-Type-Options", "nosniff");
    await new Promise<void>((resolve, reject) => {
      res.download(file, safeFileName(row.original_file_name!), { dotfiles: "allow" }, (err) =>
        err ? reject(err) : resolve(),
      );
    });
  });

  // Step 6: remove the file and clear the file fields (the manuscript record itself stays)
  router.delete("/:artifact_id/file", async (req, res) => {
    const projectId = await requireProject(db(), projectParam(req));
    const result = await clearManuscriptFile(db(), projectId, artifactIdOf(req.params.artifact_id));
    if (!result) throw artifactNotFound();
    if (result.previous === null) throw noFile();
    await deleteStoredFiles([result.previous]);
    res.status(204).end();
  });

  return router;
}
