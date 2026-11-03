/*
 * File: src/routes/health.ts
 * Purpose: Liveness endpoint (spec.md §5.1 #1).
 * AI Contribution Weight: [90%] AI Generated / [10%] Human Refactored
 */
import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "pp-artifact-indexer",
    version: process.env.APP_VERSION ?? "0.1.0",
    uptimeSec: Math.round(process.uptime()),
  });
});
