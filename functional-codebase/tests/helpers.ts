// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Design PostgreSQL schema, migrations, seed script and DB tests for the master spec"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Read every test line by line, no changes; notes in .ai_logs/conceptual_journal.md
// Verification: Read through the tests and ran them, all pass
// Language/Stack: TypeScript / Node.js 22 / Vitest + Supertest / PostgreSQL 16
// Confidence: Medium

import pg from "pg";
import { randomUUID } from "node:crypto";

// Step 1: every test file gets its own throwaway schema inside the real database,
// so tests never touch real data and can run side by side.
export async function createTestSchema(): Promise<{ pool: pg.Pool; drop: () => Promise<void> }> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Start the DB with `docker compose up -d db` and run: " +
        "DATABASE_URL=postgres://pp_user:pp_password@localhost:5432/pp_indexer npm test",
    );
  }
  const schema = `test_${randomUUID().replace(/-/g, "")}`;
  const admin = new pg.Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA ${schema}`);
  // Step 2: search_path makes all unqualified table names land in our schema.
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  return {
    pool,
    drop: async () => {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}
