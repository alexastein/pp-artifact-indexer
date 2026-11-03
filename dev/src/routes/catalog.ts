/*
 * File: src/routes/catalog.ts
 * Purpose: Read-only affiliation taxonomy from mock data (spec.md §5.1 #3, #4, #5).
 * AI Contribution Weight: [90%] AI Generated / [10%] Human Refactored
 */
import { Router } from "express";
import { mockData } from "../mock/loadMockData";

export const catalogRouter = Router();

function page<T>(items: T[]) {
  return { data: items, page: 1, pageSize: items.length, total: items.length };
}

catalogRouter.get("/labs", (_req, res) => {
  res.json(page(mockData.labs));
});

catalogRouter.get("/programs", (_req, res) => {
  res.json(page(mockData.programs));
});

catalogRouter.get("/courses", (req, res) => {
  const { programId, term } = req.query;
  const courses = mockData.courses.filter(
    (c) =>
      (typeof programId !== "string" || c.programId === programId) &&
      (typeof term !== "string" || c.term === term),
  );
  res.json(page(courses));
});
