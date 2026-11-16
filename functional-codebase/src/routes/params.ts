// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Implement manuscript file upload, download, delete and zip download"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Reviewed line by line, no code changes (kept naive on purpose); notes in .ai_logs/conceptual_journal.md
// Verification: Read through it and ran tests/artifacts.test.ts, tests/manuscript-files.test.ts, all pass
// Confidence: Medium

import type pg from "pg";
import { projectExists } from "../artifacts-repo.js";
import { AppError } from "../errors.js";
import { UUID_RE } from "../validation.js";

export const projectNotFound = () => new AppError(404, "project_not_found", "Project not found");
export const artifactNotFound = () => new AppError(404, "artifact_not_found", "Artifact not found");

// Step 1: shared path-parameter helpers. A value that cannot exist is a 404.
export async function requireProject(db: pg.Pool, raw: unknown): Promise<string> {
  if (typeof raw !== "string" || !UUID_RE.test(raw)) throw projectNotFound();
  const id = raw.toLowerCase();
  if (!(await projectExists(db, id))) throw projectNotFound();
  return id;
}

export function artifactIdOf(raw: unknown): string {
  if (typeof raw !== "string" || !UUID_RE.test(raw)) throw artifactNotFound();
  return raw.toLowerCase();
}

// Routers mounted with mergeParams see :project_id, but Express types do not know that.
export function projectParam(req: { params: unknown }): unknown {
  return (req.params as Record<string, unknown>).project_id;
}
