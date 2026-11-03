/*
 * File: tests/ready.test.ts
 * Purpose: Tests for the readiness endpoint (spec.md §5.1 #2).
 * AI Contribution Weight: [100%] AI Generated / [0%] Human Refactored
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

describe("GET /ready", () => {
  it("returns ready when all mock data is loaded", async () => {
    const res = await request(createApp()).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready", checks: { mockData: "ok" } });
  });
});
