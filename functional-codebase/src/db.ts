// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Scaffold functional-codebase Express 5 + TypeScript service with health route, DB module, Docker setup"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: none yet
// Verification: tests/health.test.ts (imports db module indirectly via typecheck)
// Confidence: Medium

// Why node-postgres ("pg") and not an ORM like Prisma/TypeORM:
// - The spec needs multi-field search (keyword, lab, program, course, artifact types),
//   which is easiest to write and tune as plain parameterized SQL.
// - pg is small, mature, has built-in connection pooling and no code generation step,
//   so the Docker build and the tests stay simple.
// - Parameterized queries ($1, $2, ...) protect us from SQL injection.
import pg from "pg";

let pool: pg.Pool | undefined;

// Step 1: we create the pool lazily so importing this file never needs a database
// (that keeps unit tests like /health fast and independent).
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new pg.Pool({ connectionString });
  }
  return pool;
}

// Step 2: small helper so routes can run a query in one line.
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

// Step 3: close the pool on shutdown and at the end of tests.
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
