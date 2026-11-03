# CLAUDE.md — project conventions for the AI developer agent

Project: PP Domain 1 — Project Artifact & Repository Indexer. Stack: Node.js 22, TypeScript, Express 5, PostgreSQL 16, Vitest + Supertest.
Functional specification: `spec.md`.

## Logging rules (course requirement — always follow)
1. Every source file you create or modify starts with a header comment containing:
   `AI Contribution Weight: [NN%] AI Generated / [NN%] Human Refactored`
   Use 100% / 0% for files you create from scratch; keep the existing value on files you only touch lightly.
2. Every git commit you make has a message starting with `AI AGENT BUILD: <Feature Name>`.
3. After each task, append an entry to `code_AI_history.md` with: date, prompt summary, files changed, how it was verified (tests run).

## Working rules
- Run `npm run typecheck` and `npm test` before you say a task is done.
- Do not push to the remote. Do not edit `.github/workflows/` unless asked.
