// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Scaffold functional-codebase Express 5 + TypeScript service with health route, DB module, Docker setup"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Read every test line by line, no changes; notes in .ai_logs/conceptual_journal.md
// Verification: tests/health.test.ts; human: ran npm run typecheck + npm test (7 files / 75 tests pass, real Postgres 16)
// Confidence: Medium

import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";

describe("GET /health", () => {
  it("returns status ok", async () => {
    // Step 1: we call the endpoint through supertest (no real port needed).
    const res = await request(app).get("/health");

    // Step 2: we check the status code and the JSON body.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
