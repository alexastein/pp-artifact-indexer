// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Implement project CRUD and search endpoints (POST/GET/PUT/DELETE /api/v1/projects)"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Reviewed line by line, no code changes (kept naive on purpose); notes in .ai_logs/conceptual_journal.md
// Verification: tests/projects.test.ts; human: reviewed line by line, ran npm run typecheck + npm test (7 files / 75 tests pass, real Postgres 16)
// Confidence: Medium

import type { ErrorRequestHandler, RequestHandler } from "express";

// Step 1: one error class so every route can throw "status + code + message" and get a clean JSON reply.
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

// Step 2: unknown routes return JSON instead of Express's default HTML page.
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, "route_not_found", "Route not found"));
};

// Step 3: the last middleware: turns any error into {error: {code, message, details}}.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // if a download/zip already started sending, we cannot send JSON anymore: just cut the connection
  if (res.headersSent) {
    console.error(err);
    res.destroy();
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  // body-parser throws this when the JSON body is malformed
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "invalid_json", message: "Request body is not valid JSON" } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "internal_error", message: "Internal server error" } });
};
