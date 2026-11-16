// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Implement artifact endpoints (manuscripts, videos, repositories) with git-host mock enrichment"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Reviewed line by line, no code changes (kept naive on purpose); notes in .ai_logs/conceptual_journal.md
// Verification: Read through it and ran tests/git-mock.test.ts, tests/artifacts.test.ts, all pass
// Confidence: Medium

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface MockRepo {
  host: string; // GITHUB or GITLAB
  owner: string;
  name: string;
  defaultBranch: string;
  primaryLanguage: string;
  lastCommitAt: string;
}

export interface RepoMetadata {
  target_branch: string;
  primary_tech_stack: string;
  latest_commit_at: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const MOCK_FILE = path.resolve(here, "..", "mock-data", "git-host-repos.json");

// Step 1: we read the mock "git host" once and keep it in memory.
let cache: Promise<MockRepo[]> | undefined;
function loadMockRepos(): Promise<MockRepo[]> {
  cache ??= readFile(MOCK_FILE, "utf8").then((text) => JSON.parse(text) as MockRepo[]);
  return cache;
}

const HOSTS: Record<string, string> = { "github.com": "GITHUB", "gitlab.com": "GITLAB" };

// Step 2: turns a repo URL into {host, owner, name} so https://GitHub.com/Owner/Repo.git/ matches "Owner/Repo".
// Returns null for URLs we do not understand.
export function parseRepoUrl(raw: string): { host: string; owner: string; name: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = HOSTS[url.hostname.toLowerCase().replace(/^www\./, "")];
  const [owner, rawName] = url.pathname.split("/").filter(Boolean);
  if (!host || !owner || !rawName) return null;
  return { host, owner: owner.toLowerCase(), name: rawName.replace(/\.git$/i, "").toLowerCase() };
}

// Step 3: looks the repo up in the mock; null when there is no match.
export async function lookupMockRepo(repoUrl: string): Promise<RepoMetadata | null> {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) return null;
  const match = (await loadMockRepos()).find(
    (r) => r.host === parsed.host && r.owner.toLowerCase() === parsed.owner && r.name.toLowerCase() === parsed.name,
  );
  if (!match) return null;
  return {
    target_branch: match.defaultBranch,
    primary_tech_stack: match.primaryLanguage,
    latest_commit_at: match.lastCommitAt,
  };
}
