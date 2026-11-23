// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Scaffold functional-codebase Express 5 + TypeScript service with health route, DB module, Docker setup"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Reviewed, no changes; notes in .ai_logs/conceptual_journal.md
// Verification: Read through it; npm test uses it and passes
// Language/Stack: TypeScript / Vitest
// Confidence: Medium

import { defineConfig } from "vitest/config";

// Step 1: we only run files in tests/ and measure coverage on src/.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Step 2: lcov.info is the format SonarQube reads (see sonar-project.properties); text prints the table.
    coverage: { provider: "v8", include: ["src/**/*.ts"], reporter: ["text", "html", "lcov"] },
  },
});
