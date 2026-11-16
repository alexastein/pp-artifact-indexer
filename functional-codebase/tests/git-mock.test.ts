// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Implement artifact endpoints (manuscripts, videos, repositories) with git-host mock enrichment"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Read every test line by line, no changes; notes in .ai_logs/conceptual_journal.md
// Verification: this file (vitest, no database needed); human: ran npm run typecheck + npm test (7 files / 75 tests pass, real Postgres 16)
// Confidence: Medium

import { describe, expect, it } from "vitest";
import { lookupMockRepo, parseRepoUrl } from "../src/git-mock.js";

describe("parseRepoUrl", () => {
  it("normalizes case, www, trailing slash and .git", () => {
    expect(parseRepoUrl("https://www.GitHub.com/Bu-Met-Sail/Agent-Pipeline-Study.git/")).toEqual({
      host: "GITHUB",
      owner: "bu-met-sail",
      name: "agent-pipeline-study",
    });
  });
  it("returns null for unsupported hosts, short paths and garbage", () => {
    expect(parseRepoUrl("https://example.com/a/b")).toBeNull();
    expect(parseRepoUrl("https://github.com/only-owner")).toBeNull();
    expect(parseRepoUrl("not a url")).toBeNull();
  });
});

describe("lookupMockRepo", () => {
  it("finds a GitHub repo from the mock data", async () => {
    expect(await lookupMockRepo("https://github.com/bu-met-sail/agent-pipeline-study")).toEqual({
      target_branch: "main",
      primary_tech_stack: "TypeScript",
      latest_commit_at: "2026-10-30T18:22:00Z",
    });
  });
  it("finds a GitLab repo, and does not mix up hosts", async () => {
    expect((await lookupMockRepo("https://gitlab.com/hci-lab/eye-tracking-toolkit"))?.target_branch).toBe("develop");
    expect(await lookupMockRepo("https://github.com/hci-lab/eye-tracking-toolkit")).toBeNull();
  });
  it("returns null for repos that are not in the mock", async () => {
    expect(await lookupMockRepo("https://github.com/nobody/nothing")).toBeNull();
  });
});
