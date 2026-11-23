# CLAUDE.md

1. Project: PP Domain 1 — Project Artifact & Repository Indexer. The ONLY requirements document is `docs/master-spec-domain1.md`. Do not open `spec.md` (it is an old superseded draft).
2. All new application code lives in the folder `functional-codebase/` as a self-contained Node.js 22 + TypeScript + Express 5 + PostgreSQL 16 project with Vitest + Supertest tests. Leave the old root `src/` and `tests/` folders untouched.
3. Every source, test, config, Dockerfile and SQL file you create starts with this header (adapt the comment syntax to the file type):
   ```
   // Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
   // Prompt Summary: "<one-line summary of the prompt that produced this file>"
   // AI Contribution: <NN>% AI generated / <NN>% human refactored   (use 100/0 for new files)
   // Human Modifications: none yet
   // Verification: <tests that cover this file, e.g. tests/projects.test.ts>
   // Language/Stack: <e.g. TypeScript / Node.js 22 / Express 5 / PostgreSQL 16>
   // Confidence: Medium
   ```
4. Write code comments in the voice of a student explaining each step ("Step 1: we look up the project so we can..."), keeping them short.
5. Every git commit message starts with a tag that says who did the work: "AI: <Feature Name>" for agent-generated work, "HUMAN: <what changed>" for hand-made work, or "HYBRID: <what changed>" for AI work the human edited (for example "AI: project CRUD endpoints"). Do not push. Only commit when the user asks.p
6. Metadata blocks and AI logs must have every field filled in. Never leave template placeholders such as "[__%]" or "<paste ...>".
7. After each task append an entry to `.ai_logs/agent_task_log.md` with: date, prompt summary, files changed, commands run, test results.
8. Run typecheck and tests inside `functional-codebase/` before saying a task is done.
