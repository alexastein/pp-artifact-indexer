/*
 * File: tests/health.test.ts
 * Purpose: Smoke tests for the barebone skeleton.
 * AI Contribution Weight: [90%] AI Generated / [10%] Human Refactored
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

describe("barebone API", () => {
  const app = createApp();

  it("GET /health returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /api/v1/catalog/labs lists mock labs", async () => {
    const res = await request(app).get("/api/v1/catalog/labs");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  it("GET /api/v1/catalog/courses filters by programId", async () => {
    const res = await request(app).get("/api/v1/catalog/courses?programId=prog-mscis");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].code).toBe("MET CS 763");
  });

  it("unknown route returns RFC 9457 problem", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toContain("application/problem+json");
  });
});
