// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Scaffold Express service; wire project endpoints and error handling"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: none yet
// Verification: tests/health.test.ts, tests/projects.test.ts
// Confidence: Medium

import express from "express";
import type pg from "pg";
import { getPool } from "./db.js";
import { errorHandler, notFoundHandler } from "./errors.js";
import { artifactsRouter } from "./routes/artifacts.js";
import { manuscriptFilesRouter } from "./routes/manuscript-files.js";
import { projectsRouter } from "./routes/projects.js";

// Step 1: we build the app in a function so tests can hand in a pool for their own test schema.
// The default getPool is lazy, so /health works even when no database is configured.
export function createApp(db: () => pg.Pool = getPool) {
  const app = express();

  // Step 2: we parse JSON bodies for the project/artifact endpoints.
  app.use(express.json());

  // Step 3: health check used by Docker and by tests.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Step 4: the project endpoints from the master spec.
  app.use("/api/v1/projects", projectsRouter(db));

  // Step 5: manuscript file routes come FIRST, so ".../manuscripts/download" is matched here
  // and not by the generic "/:artifact_type/:artifact_id" route below.
  app.use("/api/v1/projects/:project_id/artifacts/manuscripts", manuscriptFilesRouter(db));

  // Step 5b: the other artifact endpoints live under a project.
  app.use("/api/v1/projects/:project_id/artifacts", artifactsRouter(db));

  // Step 6: JSON 404 for unknown routes, then the shared error handler (must come last).
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export const app = createApp();
