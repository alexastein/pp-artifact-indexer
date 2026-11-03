/*
 * File: src/mock/loadMockData.ts
 * Purpose: Load static mock data (users, labs, programs, courses, mock Git host repos) at boot (spec.md §7).
 * AI Contribution Weight: [90%] AI Generated / [10%] Human Refactored
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Role = "ADMIN" | "CURATOR" | "CONTRIBUTOR" | "VIEWER";

export interface MockUser {
  id: string;
  displayName: string;
  email: string;
  role: Role;
  department: string;
}
export interface MockLab {
  id: string;
  name: string;
  department: string;
  directorId: string;
}
export interface MockProgram {
  id: string;
  code: string;
  name: string;
  department: string;
  coordinatorId: string;
}
export interface MockCourse {
  id: string;
  code: string;
  title: string;
  term: string;
  programId: string;
  instructorIds: string[];
}
export interface MockGitRepo {
  host: "GITHUB" | "GITLAB" | "BITBUCKET";
  owner: string;
  name: string;
  defaultBranch: string;
  primaryLanguage: string;
  licenseSpdx: string;
  stars: number;
  lastCommitAt: string;
}

const dir = process.env.MOCK_DATA_DIR ?? join(__dirname, "..", "..", "mock-data");

function load<T>(file: string): T {
  return JSON.parse(readFileSync(join(dir, file), "utf8")) as T;
}

export const mockData = {
  users: load<MockUser[]>("users.json"),
  labs: load<MockLab[]>("labs.json"),
  programs: load<MockProgram[]>("programs.json"),
  courses: load<MockCourse[]>("courses.json"),
  gitHostRepos: load<MockGitRepo[]>("git-host-repos.json"),
};
