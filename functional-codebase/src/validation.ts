// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Implement project CRUD and search endpoints (POST/GET/PUT/DELETE /api/v1/projects)"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Reviewed line by line, no code changes (kept naive on purpose); notes in .ai_logs/conceptual_journal.md
// Verification: tests/projects.test.ts; human: reviewed line by line, ran npm run typecheck + npm test (7 files / 75 tests pass, real Postgres 16)
// Confidence: Medium

import { z } from "zod";
import { AppError } from "./errors.js";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MEMBER_ROLES = ["student", "faculty", "advisor", "teaching_assistant"] as const;
export const ARTIFACT_TYPES = ["manuscripts", "videos", "repositories"] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

// Step 1: body for POST and PUT. We lower-case emails so the unique (project, email) rule is not case-sensitive.
const memberSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "must be a valid email"),
  role: z.enum(MEMBER_ROLES),
});

export const projectBodySchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(10000).default(""),
    members: z.array(memberSchema).min(1).max(100),
    unit_ids: z
      .array(z.string().min(1).max(100))
      .min(1)
      .max(50)
      .transform((ids) => [...new Set(ids)]), // drop duplicates quietly
  })
  .refine((b) => new Set(b.members.map((m) => m.email)).size === b.members.length, {
    message: "members must have unique emails",
    path: ["members"],
  });
export type ProjectInput = z.infer<typeof projectBodySchema>;

// Step 2: turns a zod failure into our 400 error with a list of field problems.
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    throw new AppError(400, "validation_error", "Request validation failed", details);
  }
  return result.data;
}

// Step 3: search query parameters, validated by hand so the error messages are clear.
export interface SearchParams {
  keyword?: string;
  createdFrom?: { value: string };
  createdTo?: { value: string; dateOnly: boolean };
  labId?: string;
  programId?: string;
  courseId?: string;
  hasArtifactTypes: ArtifactType[];
  page: number;
  pageSize: number;
  sortField: "created_at" | "title";
  sortDir: "asc" | "desc";
}

export const MAX_PAGE_SIZE = 100;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

// A date is "YYYY-MM-DD" (a real calendar day) or a full ISO timestamp with a time zone.
function parseDate(name: string, raw: string): { value: string; dateOnly: boolean } {
  if (DATE_ONLY.test(raw)) {
    const d = new Date(`${raw}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().startsWith(raw)) {
      return { value: `${raw}T00:00:00Z`, dateOnly: true };
    }
  } else if (DATE_TIME.test(raw) && !Number.isNaN(new Date(raw).getTime())) {
    return { value: raw, dateOnly: false };
  }
  throw new AppError(400, "validation_error", `${name} must be YYYY-MM-DD or an ISO timestamp with a time zone`, [
    { field: name, message: "invalid date" },
  ]);
}

function parseIntParam(name: string, raw: string | undefined, def: number, min: number, max: number): number {
  if (raw === undefined) return def;
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || n < min || n > max) {
    throw new AppError(400, "validation_error", `${name} must be an integer between ${min} and ${max}`, [
      { field: name, message: "out of range" },
    ]);
  }
  return n;
}

export function parseSearchQuery(query: Record<string, unknown>): SearchParams {
  // Step 3a: every value must be a single string (so ?lab_id=a&lab_id=b is rejected, not guessed at).
  const q: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== "string") {
      throw new AppError(400, "validation_error", `Query parameter ${key} must be given once, as a plain value`, [
        { field: key, message: "invalid value" },
      ]);
    }
    q[key] = value.trim();
  }
  const emptyToUndef = (v: string | undefined) => (v === undefined || v === "" ? undefined : v);

  const params: SearchParams = {
    hasArtifactTypes: [],
    page: parseIntParam("page", q.page, 1, 1, 1_000_000),
    pageSize: parseIntParam("page_size", q.page_size, 20, 1, MAX_PAGE_SIZE),
    sortField: "created_at",
    sortDir: "desc",
  };

  params.keyword = emptyToUndef(q.keyword);
  if (params.keyword && params.keyword.length > 200) {
    throw new AppError(400, "validation_error", "keyword is too long (max 200 characters)", [
      { field: "keyword", message: "too long" },
    ]);
  }

  const from = emptyToUndef(q.created_from);
  const to = emptyToUndef(q.created_to);
  if (from) params.createdFrom = parseDate("created_from", from);
  if (to) params.createdTo = parseDate("created_to", to);
  if (params.createdFrom && params.createdTo) {
    const lo = new Date(params.createdFrom.value).getTime();
    const hi = new Date(params.createdTo.value).getTime();
    if (lo > hi) {
      throw new AppError(400, "validation_error", "created_from must not be after created_to", [
        { field: "created_from", message: "after created_to" },
      ]);
    }
  }

  // Step 3b: dept_id is an alias for program_id (a department program). Both given and different is ambiguous.
  params.labId = emptyToUndef(q.lab_id);
  params.courseId = emptyToUndef(q.course_id);
  const program = emptyToUndef(q.program_id);
  const dept = emptyToUndef(q.dept_id);
  if (program && dept && program !== dept) {
    throw new AppError(400, "validation_error", "program_id and dept_id are aliases and must match if both are given", [
      { field: "dept_id", message: "conflicts with program_id" },
    ]);
  }
  params.programId = program ?? dept;

  // Step 3c: has_artifact_type may be "videos" or "manuscripts,repositories".
  const types = emptyToUndef(q.has_artifact_type);
  if (types) {
    const list = [...new Set(types.split(",").map((t) => t.trim()))];
    const bad = list.filter((t) => !(ARTIFACT_TYPES as readonly string[]).includes(t));
    if (bad.length) {
      throw new AppError(400, "validation_error", `has_artifact_type must be one of ${ARTIFACT_TYPES.join(", ")}`, [
        { field: "has_artifact_type", message: `invalid value(s): ${bad.join(", ")}` },
      ]);
    }
    params.hasArtifactTypes = list as ArtifactType[];
  }

  // Step 3d: sort looks like "title", "title:asc" or "created_at:desc".
  const sort = emptyToUndef(q.sort);
  if (sort) {
    const [field, dir = "asc"] = sort.split(":");
    if ((field !== "created_at" && field !== "title") || (dir !== "asc" && dir !== "desc")) {
      throw new AppError(400, "validation_error", "sort must be created_at or title, optionally followed by :asc or :desc", [
        { field: "sort", message: "invalid sort" },
      ]);
    }
    params.sortField = field;
    params.sortDir = dir;
  }
  return params;
}

// ---------------------------------------------------------------------------
// Artifact bodies (one schema per artifact type)
// ---------------------------------------------------------------------------

// Step 4: URLs must be http(s) so we never store things like javascript: links.
const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => {
    try {
      return ["http:", "https:"].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  }, "must be a valid http(s) URL");

// Optional fields accept a missing value or null, and both are stored as null.
const optional = <T extends z.ZodType>(schema: T) => schema.nullish().transform((v) => v ?? null);
const stringList = z.array(z.string().trim().min(1).max(200)).max(100).default([]);

export const manuscriptSchema = z.object({
  title: z.string().trim().min(1).max(500),
  abstract: z.string().max(20000).default(""),
  authors: stringList,
  keywords: stringList,
  year: optional(z.number().int().min(1900).max(2100)),
  publisher: optional(z.string().trim().min(1).max(300)), // only for published manuscripts
});

export const videoSchema = z.object({
  video_url: httpUrl,
  thumbnail_url: optional(httpUrl),
  duration_seconds: optional(z.number().int().min(0)),
  description: z.string().max(10000).default(""),
});

export const repositorySchema = z.object({
  repo_url: httpUrl,
  target_branch: optional(z.string().trim().min(1).max(200)),
  primary_tech_stack: optional(z.string().trim().min(1).max(200)),
  total_commit_count: optional(z.number().int().min(0)),
  latest_commit_at: optional(z.iso.datetime({ offset: true })),
});

export const artifactSchemas = {
  manuscripts: manuscriptSchema,
  videos: videoSchema,
  repositories: repositorySchema,
} as const;

export function isArtifactType(value: unknown): value is ArtifactType {
  return typeof value === "string" && (ARTIFACT_TYPES as readonly string[]).includes(value);
}
