/*
 * File: src/routes/health.ts
 * Purpose: Liveness and readiness endpoints (spec.md §5.1 #1, #2).
 * AI Contribution Weight: [90%] AI Generated / [10%] Human Refactored
 */
import { Router } from "express";
import { mockData } from "../mock/loadMockData";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "pp-artifact-indexer",
    version: process.env.APP_VERSION ?? "0.1.0",
    uptimeSec: Math.round(process.uptime()),
  });
});

// Readiness: mock data only for now; a DB ping is added once PostgreSQL is wired in.
healthRouter.get("/ready", (_req, res) => {
  const mockDataLoaded = Object.values(mockData).every((list) => Array.isArray(list) && list.length > 0);
  res.status(mockDataLoaded ? 200 : 503).json({
    status: mockDataLoaded ? "ready" : "not_ready",
    checks: { mockData: mockDataLoaded ? "ok" : "fail" },
  });
});
