// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Implement manuscript file upload, download, delete and zip download"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Reviewed line by line, no code changes (kept naive on purpose); notes in .ai_logs/conceptual_journal.md
// Verification: tests/manuscript-files.test.ts, tests/projects.test.ts, tests/artifacts.test.ts; human: reviewed line by line, ran npm run typecheck + npm test (7 files / 75 tests pass, real Postgres 16)
// Confidence: Medium

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { rm, rmdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

// Step 1: all uploaded manuscripts live under FILE_STORAGE_DIR (a docker volume in compose).
// We read the env var on every call so tests can point it at a temp folder.
export function storageDir(): string {
  return path.resolve(process.env.FILE_STORAGE_DIR ?? "./uploads");
}

// Step 2: turns a stored path from the database into a full path, but only if it is inside the
// storage folder. A bad value in the database can therefore never make us touch other files.
export function resolveStoredPath(stored: string): string | null {
  const root = storageDir();
  const full = path.resolve(root, stored);
  const rel = path.relative(root, full);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return full;
}

// Step 3: after deleting a file we also remove its folders (<project>/<artifact>) if they are now empty.
export async function removeEmptyParents(file: string): Promise<void> {
  const root = storageDir();
  let dir = path.dirname(file);
  while (dir !== root && dir.startsWith(root + path.sep)) {
    try {
      await rmdir(dir); // fails if the folder is not empty, which is what we want
    } catch {
      return;
    }
    dir = path.dirname(dir);
  }
}

export async function deleteStoredFiles(storedPaths: string[]): Promise<void> {
  for (const stored of storedPaths) {
    const full = resolveStoredPath(stored);
    if (!full) {
      console.warn(`Skipping file outside storage dir: ${stored}`);
      continue;
    }
    try {
      await rm(full, { force: true }); // force: a file that is already gone is fine
      await removeEmptyParents(full);
    } catch (err) {
      console.error(`Could not delete stored file ${full}`, err);
    }
  }
}

// Step 4: SHA-256 of a file, computed as a stream so big files do not fill memory.
export async function sha256OfFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}
