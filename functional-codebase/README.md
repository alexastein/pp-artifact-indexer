# PP Domain 1 — Project Artifact & Repository Indexer

Express 5 + TypeScript + PostgreSQL 16. Requirements: `../docs/master-spec-domain1.md`.

## Database schema

SQL migrations live in `migrations/` (applied in filename order, tracked in `schema_migrations`).

| Table | Purpose |
| :-- | :-- |
| `projects` | Master project record: UUID `id`, `title`, `description`, `created_at`, `updated_at`, `revision_version`. A trigger sets `revision_version` to 1 on insert and adds 1 (and refreshes `updated_at`) on every update. |
| `project_members` | Members of a project: `member_name`, `email`, `role` (`student`, `faculty`, `advisor`, `teaching_assistant`). Unique per (project, email). "At least one member" is enforced by the API, not the DB. |
| `academic_units` | Labs, department programs and courses (`unit_type` = `lab` / `program` / `course`). Courses point to their program via `program_id`. Loaded from `mock-data`. |
| `project_academic_units` | Many-to-many link: a project belongs to one or more units. |
| `artifacts` | One row per artifact (UUID `id`, `project_id`, `artifact_type` = `manuscripts` / `videos` / `repositories`). |
| `manuscripts` | `title`, `abstract`, `authors[]`, `keywords[]`, `year`, optional `publisher`, and file info (`stored_file_path`, `original_file_name`, `file_size_bytes`, `file_sha256`). File columns are all NULL until a file is uploaded, then all must be set. |
| `videos` | `video_url`, `thumbnail_url`, `duration_seconds`, `description`. |
| `repositories` | `repo_url`, `target_branch`, `primary_tech_stack`, `total_commit_count`, `latest_commit_at`. |

Each of `manuscripts`, `videos`, `repositories` shares its primary key with `artifacts.id`; a composite foreign key
`(artifact_id, artifact_type)` stops a video row from pointing at a manuscript artifact. Deleting a project cascades to
its members, unit links and artifacts.

## Running migrations and seeding

```bash
docker compose up -d db                      # Postgres 16, published on 127.0.0.1:5432
export DATABASE_URL=postgres://pp_user:pp_password@localhost:5432/pp_indexer

npm run migrate    # apply pending migrations
npm run seed       # migrate, then load mock-data units + seed-projects.json (safe to re-run)
```

The server (`npm run dev` / `npm start` / the `api` container) also applies pending migrations on startup.
Set `RUN_MIGRATIONS=false` to skip that. In the built image use `node dist/cli.js migrate|seed`.

Seed notes: mock-data users are mapped to project roles (`CONTRIBUTOR` -> `student`, `CURATOR` -> `faculty`).
A project's `createdBy` user is added as a member too.

## Tests

The DB tests run against a real PostgreSQL. Each test file creates its own temporary schema and drops it afterwards,
so your dev data is not touched.

```bash
docker compose up -d db
export DATABASE_URL=postgres://pp_user:pp_password@localhost:5432/pp_indexer
npm test                # or: npm run test:coverage
npm run typecheck
```

Without `DATABASE_URL` the migration and seed tests fail with a message explaining this.

## Project endpoints (`/api/v1/projects`)

Errors are JSON: `{"error": {"code", "message", "details"}}`. Unknown (or malformed) project ids return 404.

| Verb + path | What it does |
| :-- | :-- |
| `POST /api/v1/projects` | Create. Body: `title`, optional `description`, `members` (1+ of `{name, email, role}`), `unit_ids` (1+ academic unit ids). Returns 201 with the full project. |
| `GET /api/v1/projects/{id}` | Project with `members`, `academic_units` and `artifact_counts`. |
| `PUT /api/v1/projects/{id}` | Full replacement of title, description, members and units (same body as POST). Bumps `revision_version` and `updated_at`. |
| `DELETE /api/v1/projects/{id}` | Deletes the project, its artifacts and stored manuscript files (only files under `FILE_STORAGE_DIR`). Returns 204. |
| `GET /api/v1/projects` | Search, see below. Returns `{items, page, page_size, total}`. |

Search query parameters (all optional, combined with AND):

- `keyword` — case-insensitive substring of the project title/description or of any manuscript title, abstract or keyword.
- `created_from`, `created_to` — `YYYY-MM-DD` or an ISO timestamp with a time zone. A date-only `created_to` includes that whole day (UTC).
- `lab_id`, `program_id` (alias `dept_id`), `course_id` — the project must be linked to that unit of that type.
- `has_artifact_type` — `manuscripts`, `videos`, `repositories`, or a comma-separated list; the project must have **all** listed types.
- `page` (default 1), `page_size` (default 20, max 100), `sort` = `created_at` or `title`, optionally `:asc` / `:desc` (default `created_at:desc`; `title` alone means ascending).

## Artifact endpoints (`/api/v1/projects/{project_id}/artifacts`)

`{artifact_type}` is `manuscripts`, `videos` or `repositories` (anything else is 404). Unknown projects, artifacts,
an artifact of a different type, or an artifact that belongs to another project are all 404.

| Verb + path | What it does |
| :-- | :-- |
| `GET .../artifacts` | All artifacts of the project: `{project_id, manuscripts: [], videos: [], repositories: []}`. |
| `POST .../artifacts/{type}` | Add metadata of that type. 201 with the artifact (own UUID). |
| `GET .../artifacts/{type}` | `{project_id, artifact_type, total, items}`, oldest first. |
| `GET .../artifacts/{type}/{artifact_id}` | One artifact. |
| `PUT .../artifacts/{type}/{artifact_id}` | Replaces the metadata fields (omitted optional fields are cleared). Refreshes `updated_at`. |
| `DELETE .../artifacts/{type}/{artifact_id}` | 204. A manuscript's stored file is removed from disk too. |

Fields per type (required ones marked `*`):

- **manuscripts**: `title*`, `abstract`, `authors[]`, `keywords[]`, `year` (1900-2100), `publisher` (only if published).
  Responses also show `has_file`, `original_file_name`, `file_size_bytes`, `file_sha256`; these are set by the file
  upload endpoint, never by POST/PUT, and a PUT leaves them untouched. The server-side path is never exposed.
- **videos**: `video_url*`, `thumbnail_url`, `duration_seconds`, `description`.
- **repositories**: `repo_url*`, `target_branch`, `primary_tech_stack`, `total_commit_count`, `latest_commit_at`.
  If `repo_url` matches `mock-data/git-host-repos.json` (github.com / gitlab.com, case-insensitive, `.git` and trailing
  slash ignored), the missing `target_branch`, `primary_tech_stack` and `latest_commit_at` are filled from the mock.
  Values you send always win. With no match, `target_branch` defaults to `main`. This also applies on PUT.

URLs must be `http` or `https`.

## Manuscript files (`/api/v1/projects/{project_id}/artifacts/manuscripts/...`)

Files are stored on disk under `FILE_STORAGE_DIR` (default `./uploads`; the `manuscript_files` volume in
`docker-compose.yml`) as `<project_id>/<artifact_id>/<random id>`. The user's file name is only kept in the database.
`MAX_UPLOAD_BYTES` (default 50 MB) limits the upload size.

| Verb + path | What it does |
| :-- | :-- |
| `POST .../manuscripts/{artifact_id}/file` | Upload as `multipart/form-data`, field name `file`. Saves original file name, size and SHA-256 on the manuscript and returns it (201). Uploading again replaces the old file. 400 if the file is missing or empty, 413 if too large. |
| `GET .../manuscripts/{artifact_id}/file` | Download with the original file name (`Content-Disposition: attachment`). 404 if the manuscript has no file. |
| `DELETE .../manuscripts/{artifact_id}/file` | Removes the file from disk and clears the file fields; the manuscript record stays. 204. |
| `GET .../manuscripts/download` | One zip with every manuscript file of the project, using each file's original name (duplicates become `name (2).pdf`). 404 if the project has no files. |

`/manuscripts/download` is registered before the generic `/{artifact_type}/{artifact_id}` routes (see `src/app.ts`),
so it is never read as an artifact id. Deleting a manuscript or a project also deletes its files.
Original file names are reduced to their last path part (`../../x.pdf` becomes `x.pdf`).
