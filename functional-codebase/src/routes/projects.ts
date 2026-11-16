// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Implement project CRUD and search endpoints (POST/GET/PUT/DELETE /api/v1/projects)"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Reviewed line by line, no code changes (kept naive on purpose); notes in .ai_logs/conceptual_journal.md
// Verification: tests/projects.test.ts; human: reviewed line by line, ran npm run typecheck + npm test (7 files / 75 tests pass, real Postgres 16)
// Confidence: Medium

import { Router } from "express";
import type pg from "pg";
import { AppError } from "../errors.js";
import { createProject, deleteProject, getProject, searchProjects, updateProject } from "../projects-repo.js";
import { deleteStoredFiles } from "../storage.js";
import { UUID_RE, parseOrThrow, parseSearchQuery, projectBodySchema } from "../validation.js";

// Step 1: a malformed id can never exist, so it is a 404 too (and never reaches Postgres, which would error).
function projectIdOf(raw: string | string[] | undefined): string {
  if (typeof raw !== "string" || !UUID_RE.test(raw)) {
    throw new AppError(404, "project_not_found", "Project not found");
  }
  return raw.toLowerCase();
}

const notFound = () => new AppError(404, "project_not_found", "Project not found");

// Step 2: the router gets a function that returns the pool, so tests can plug in a test-schema pool.
export function projectsRouter(db: () => pg.Pool): Router {
  const router = Router();

  // Step 3: search
  router.get("/", async (req, res) => {
    const params = parseSearchQuery(req.query as Record<string, unknown>);
    res.json(await searchProjects(db(), params));
  });

  // Step 4: create -> 201 with the full project
  router.post("/", async (req, res) => {
    const input = parseOrThrow(projectBodySchema, req.body ?? {});
    const project = await createProject(db(), input);
    res.status(201).location(`/api/v1/projects/${project!.id}`).json(project);
  });

  // Step 5: read one
  router.get("/:project_id", async (req, res) => {
    const project = await getProject(db(), projectIdOf(req.params.project_id));
    if (!project) throw notFound();
    res.json(project);
  });

  // Step 6: update (full replacement of title, description, members and units)
  router.put("/:project_id", async (req, res) => {
    const id = projectIdOf(req.params.project_id);
    const input = parseOrThrow(projectBodySchema, req.body ?? {});
    const project = await updateProject(db(), id, input);
    if (!project) throw notFound();
    res.json(project);
  });

  // Step 7: delete the project, then remove its stored manuscript files from disk
  router.delete("/:project_id", async (req, res) => {
    const files = await deleteProject(db(), projectIdOf(req.params.project_id));
    if (files === null) throw notFound();
    await deleteStoredFiles(files);
    res.status(204).end();
  });

  return router;
}
