// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Implement artifact endpoints (manuscripts, videos, repositories) with git-host mock enrichment"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: none yet
// Verification: tests/artifacts.test.ts
// Confidence: Medium

import { Router } from "express";
import type pg from "pg";
import {
  createArtifact,
  deleteArtifact,
  getArtifact,
  listAllArtifacts,
  listArtifacts,
  updateArtifact,
} from "../artifacts-repo.js";
import { AppError } from "../errors.js";
import { deleteStoredFiles } from "../storage.js";
import { ArtifactType, artifactSchemas, isArtifactType, parseOrThrow } from "../validation.js";
import { artifactIdOf, artifactNotFound, projectParam, requireProject } from "./params.js";

// Step 1: an artifact type outside manuscripts/videos/repositories is a 404.
function typeOf(raw: unknown): ArtifactType {
  if (!isArtifactType(raw)) {
    throw new AppError(404, "unknown_artifact_type", "artifact_type must be manuscripts, videos or repositories");
  }
  return raw;
}

// Step 2: mergeParams lets this router see :project_id from the path it is mounted on.
export function artifactsRouter(db: () => pg.Pool): Router {
  const router = Router({ mergeParams: true });

  // All artifacts of a project, grouped by type
  router.get("/", async (req, res) => {
    const projectId = await requireProject(db(), projectParam(req));
    res.json(await listAllArtifacts(db(), projectId));
  });

  // Add an artifact of one type
  router.post("/:artifact_type", async (req, res) => {
    const type = typeOf(req.params.artifact_type);
    const projectId = await requireProject(db(), projectParam(req));
    const input = parseOrThrow(artifactSchemas[type] as never, req.body ?? {}) as Record<string, unknown>;
    const artifact = await createArtifact(db(), projectId, type, input);
    res.status(201).location(`/api/v1/projects/${projectId}/artifacts/${type}/${artifact.id}`).json(artifact);
  });

  // List the artifacts of one type
  router.get("/:artifact_type", async (req, res) => {
    const type = typeOf(req.params.artifact_type);
    const projectId = await requireProject(db(), projectParam(req));
    const items = await listArtifacts(db(), projectId, type);
    res.json({ project_id: projectId, artifact_type: type, total: items.length, items });
  });

  // Read one
  router.get("/:artifact_type/:artifact_id", async (req, res) => {
    const type = typeOf(req.params.artifact_type);
    const projectId = await requireProject(db(), projectParam(req));
    const artifact = await getArtifact(db(), projectId, type, artifactIdOf(req.params.artifact_id));
    if (!artifact) throw artifactNotFound();
    res.json(artifact);
  });

  // Update one (full replacement of the metadata fields)
  router.put("/:artifact_type/:artifact_id", async (req, res) => {
    const type = typeOf(req.params.artifact_type);
    const projectId = await requireProject(db(), projectParam(req));
    const id = artifactIdOf(req.params.artifact_id);
    const input = parseOrThrow(artifactSchemas[type] as never, req.body ?? {}) as Record<string, unknown>;
    const artifact = await updateArtifact(db(), projectId, type, id, input);
    if (!artifact) throw artifactNotFound();
    res.json(artifact);
  });

  // Delete one; a manuscript's stored file is removed too
  router.delete("/:artifact_type/:artifact_id", async (req, res) => {
    const type = typeOf(req.params.artifact_type);
    const projectId = await requireProject(db(), projectParam(req));
    const files = await deleteArtifact(db(), projectId, type, artifactIdOf(req.params.artifact_id));
    if (files === null) throw artifactNotFound();
    await deleteStoredFiles(files);
    res.status(204).end();
  });

  return router;
}
