## 2026-11-16 — Scaffold functional-codebase

- Prompt summary: read docs/master-spec-domain1.md, scaffold Express 5 + TypeScript service with /health, pg DB module, mock-data copy, Dockerfile, docker-compose, .env.example, one health test.
- Files changed: functional-codebase/{package.json, package-lock.json, tsconfig.json, tsconfig.build.json, vitest.config.ts, src/app.ts, src/server.ts, src/db.ts, tests/health.test.ts, Dockerfile, docker-compose.yml, .env.example, .dockerignore, .gitignore, mock-data/\*.json (6 files, copied unchanged)}
- Commands run: npm install (deps + devDeps), npm run typecheck, npm test, npm run build, npm run test:coverage, docker compose config -q
- Results: typecheck OK; 1/1 test passed; build OK; compose config valid. Coverage 23.5% (only app.ts exercised; server.ts/db.ts untested yet). Docker image build and `compose up` not run.

## 2026-11-16 — Database schema, migrations, seed

- Prompt summary: design/implement PostgreSQL schema (projects, members, academic units, 3 artifact types), startup/npm migrations, seed script from mock-data, README docs, real-DB tests.
- Files changed: functional-codebase/{migrations/001_projects_and_units.sql, migrations/002_artifacts.sql, src/migrate.ts, src/seed.ts, src/cli.ts, src/server.ts (run migrations on startup), package.json (migrate, seed scripts), Dockerfile (copy migrations), docker-compose.yml (publish db port 127.0.0.1:5432), tests/helpers.ts, tests/migrations.test.ts, tests/seed.test.ts, README.md}
- Commands run: open -a Docker; docker compose up -d db; npm run typecheck; npm test (with DATABASE_URL); npm run migrate; npm run seed (x2); npm run build; server start check + curl /health; psql query via docker compose exec.
- Results: typecheck OK; 3 test files / 10 tests passed against postgres:16-alpine; migrate applied 2 files; seed inserted 6 units + 1 project, rerun inserted 0; server applied migrations on boot and /health returned ok.
- Notes: seed-projects.json contains 1 project (task prompt said 2). Initial header lines in new files were malformed by a shell helper and were fixed before the passing run.

## 2026-11-16 — Project endpoints (CRUD + search)

- Prompt summary: implement POST/GET/PUT/DELETE /api/v1/projects with members + unit links, multi-parameter search (keyword, dates, lab/program/dept/course, has_artifact_type, paging, sort), 404s, Supertest integration tests.
- Files changed: functional-codebase/{src/app.ts (createApp factory, routes, error handlers), src/errors.ts, src/validation.ts, src/projects-repo.ts, src/routes/projects.ts, src/storage.ts, tests/projects.test.ts, README.md, package.json + package-lock.json (added zod)}
- Commands run: npm install zod; npm run typecheck; npm test (DATABASE_URL set, db container from docker compose); npm run test:coverage; npm run build.
- Results: typecheck OK; 4 test files / 32 tests passed (22 new: create, read, update, delete, 11 search tests incl. keyword/unit/artifact-type/date/combined/sort/paging/validation); build OK.
- Notes: has_artifact_type with a list requires ALL types (documented). dept_id treated as alias of program_id. PUT is a full replacement. Artifacts in tests are inserted by SQL since artifact endpoints are not built yet.

## 2026-11-16 — Artifact endpoints

- Prompt summary: implement artifact routes (grouped list, POST/GET list per type, GET/PUT/DELETE one) for manuscripts/videos/repositories; repository enrichment from mock git host; Supertest tests for every route and type.
- Files changed: functional-codebase/{src/git-mock.ts, src/artifacts-repo.ts, src/routes/artifacts.ts, src/validation.ts (artifact schemas, shared UUID_RE), src/routes/projects.ts (import UUID_RE), src/app.ts (mount artifacts router), tests/artifacts.test.ts, tests/git-mock.test.ts, README.md}
- Commands run: npm run typecheck; npm test (DATABASE_URL set); npm run test:coverage; npm run build.
- Results: typecheck OK; 6 test files / 60 tests passed (28 new); build OK; total coverage ~90%.
- Notes: file_size_bytes is returned as a number (cast from BIGINT). Future manuscripts `/download` route must be registered before `/:artifact_type/:artifact_id` or it will be shadowed by it.

## 2026-11-16 — Manuscript file handling

- Prompt summary: manuscript file upload (multipart, field "file", stored under FILE_STORAGE_DIR, name/size/SHA-256 saved), download with original name, delete file, zip of all project manuscripts with /download matched before /{artifact_id}; Supertest tests with two sample files + hash checks + zip + delete.
- Files changed: functional-codebase/{src/storage.ts (UPLOAD_DIR renamed FILE_STORAGE_DIR, hashing, safe path resolving, empty-folder cleanup), src/zip.ts, src/manuscript-files-repo.ts, src/routes/manuscript-files.ts, src/routes/params.ts (shared helpers), src/routes/artifacts.ts (uses shared helpers), src/errors.ts (headers-sent guard), src/app.ts (mount file router first), docker-compose.yml, README.md, tests/manuscript-files.test.ts, tests/artifacts.test.ts + tests/projects.test.ts (env var rename), package.json + lock (multer, @types/multer, fflate)}
- Commands run: npm install multer archiver (then removed archiver: audit flagged its readdir-glob dependency; replaced with fflate streaming zip); npm run typecheck; npm test (DATABASE_URL set); npm run test:coverage; npm run build; npm audit.
- Results: typecheck OK; 7 test files / 75 tests passed (15 new); build OK; npm audit: 0 vulnerabilities; coverage ~90%.
- Notes: .env.example NOT updated (read-deny rule on that file) — it still says UPLOAD_DIR and lacks MAX_UPLOAD_BYTES; needs a manual edit. A first typecheck run caught a wrong argument in one new test (delete with project id as 2nd arg), fixed before the final run.

## 2026-11-16 — Docker happy-path demo

- Prompt summary: run docker compose up --build, wait for /health, run a scripted curl demo (create project, one artifact per type, upload manuscript, search keyword+lab_id+has_artifact_type, zip download, delete project); save script and output; fix failures; bring stack down.
- Files changed: functional-codebase/scripts/happy-path-demo.sh (new), .ai_logs/happy-path-demo-output.txt (new)
- Commands run: docker compose up --build -d; ./scripts/happy-path-demo.sh (x2); docker compose exec api find /app/uploads; docker compose down
- Results: image built; /health ok; run 1 failed at step 2a (script bug: greedy sed picked a nested id as the project id -> 404; the app was correct). Fixed by anchoring the id regex; leftover project deleted via API. Run 2 passed all 8 steps (file SHA-256 matched, zip contained the file, delete 204 then 404, storage volume empty afterwards). Stack brought down (volumes kept).
- Notes: a fresh database has no academic units, so the demo runs `node dist/cli.js seed` inside the api container first (step 0b). The app does not seed on startup.

## 2026-11-16 — Point pipeline at functional-codebase

- Prompt summary: update devsecops.yml and sonar-project.properties to build/scan functional-codebase/ (postgres service + DATABASE_URL, coverage artifact, docker-build from the new folder, sonar paths/exclusions), keep Trivy/Semgrep, pinned SHAs and non-blocking behaviour; commit "AI: point pipeline at functional-codebase".
- Files changed: .github/workflows/devsecops.yml, sonar-project.properties, functional-codebase/vitest.config.ts (added lcov reporter)
- Commands run: ruby YAML parse of the workflow; sed rewrite tested on a copy of lcov.info; (in functional-codebase, DATABASE_URL set) npm ci, npm run typecheck, npm run test:coverage, npm run build, docker compose config -q, docker compose down.
- Results: workflow parses (5 jobs); typecheck OK; 75/75 tests passed; build OK; lcov.info generated; compose config valid. The GitHub Actions run itself was not executed (no push).
- Notes: vitest had no lcov reporter, so Sonar would have found no coverage; added it. lcov paths are relative to functional-codebase/, so the sonar job prefixes SF: lines with functional-codebase/. The Trivy fs job's `npm audit` still runs at the repo root (left as-is per instructions).

## 2026-11-23 — Remove macOS " 2" duplicate files

- Prompt summary: delete the " 2" duplicate files so the user can commit.
- Files changed: deleted 66 untracked " 2" duplicates (plus the `.github 2` and `src/routes 2` folders) across .ai_logs, docs, functional-codebase and pipeline-logs/pa2. No tracked file was removed (checked with git ls-files first).
- Commands run: find ... -exec rm -rf; npm run typecheck; npm test (DATABASE_URL set, db container); npm run build; docker compose down.
- Results: typecheck OK; 7 files / 75 tests pass in the working folder itself (previously failed because the duplicate migrations were applied); build OK. Nothing committed.
