// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Design PostgreSQL schema, migrations, seed script and DB tests for the master spec"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Reviewed line by line, no code changes (kept naive on purpose); notes in .ai_logs/conceptual_journal.md
// Verification: Read through it; the migrate/seed logic is covered by tests/migrations.test.ts and tests/seed.test.ts
// Confidence: Medium

import { closePool, getPool } from "./db.js";
import { runMigrations } from "./migrate.js";
import { seed } from "./seed.js";

// Step 1: tiny command line entry: `node dist/cli.js migrate` or `... seed`.
const command = process.argv[2];

try {
  if (command === "migrate") {
    const applied = await runMigrations(getPool());
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date");
  } else if (command === "seed") {
    await runMigrations(getPool()); // seeding needs the tables, so make sure they exist
    console.log("Seed result:", await seed(getPool()));
  } else {
    console.error("Usage: cli <migrate|seed>");
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await closePool();
}
