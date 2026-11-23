// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Scaffold functional-codebase Express 5 + TypeScript service with health route, DB module, Docker setup"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Reviewed line by line, no code changes (kept naive on purpose); notes in .ai_logs/conceptual_journal.md
// Verification: Read through it; not run by me, but the demo output shows the server starting
// Language/Stack: TypeScript / Node.js 22 / Express 5 / PostgreSQL 16
// Confidence: Medium

import { app } from "./app.js";
import { getPool } from "./db.js";
import { runMigrations } from "./migrate.js";

// Step 1: we read the port from the environment, falling back to 3000.
const port = Number(process.env.PORT ?? 3000);

// Step 2: we apply pending migrations before accepting traffic (skip with RUN_MIGRATIONS=false).
if (process.env.RUN_MIGRATIONS !== "false" && process.env.DATABASE_URL) {
  const applied = await runMigrations(getPool());
  console.log(applied.length ? `Applied migrations: ${applied.join(", ")}` : "Database is up to date");
}

// Step 3: we start listening.
app.listen(port, () => {
  console.log(`Artifact indexer listening on port ${port}`);
});
