// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Scaffold functional-codebase Express 5 + TypeScript service with health route, DB module, Docker setup"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: none yet
// Verification: manual: npm run dev / docker compose up
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
