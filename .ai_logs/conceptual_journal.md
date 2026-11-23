# Conceptual Journal — PP Domain 1, Project Artifact & Repository Indexer

- **Author:** Alexa Stein
- **Date of review:** 2026-11-16 (PA2 review), revised 2026-11-22 (iteration 2 resubmission)
- **Branch:** pa2
- **Agent:** Claude Code (claude-sonnet-5-5), 8 prompts, logged in `claude-code-session-01.md` and `agent_task_log.md`
- **Conversational assistant:** Claude (claude.ai chat, Claude Opus 5.5), used to draft the two PA2 reports and to refine my prompts. The chats are submitted with the AI logs.
- **Human contribution (conceptual):** about 35% for the reports (65% AI generated / 35% human authored). For the code, the contribution is the prompt design, the review and the verification described below. The code itself is AI generated.

## 1. How I reviewed the work

1. **Code.** I read every file in `functional-codebase/src`, the tests, the migrations and the config. I ran `npm run typecheck`, `npm test` (7 files / 75 tests pass) and `npm run build` myself rather than relying on the agent's reported results.
2. **Reports.** I checked the file and line references in both reports against the code, compared each triage verdict with the raw scanner output in `pipeline-logs/pa2/`, and read up on the topics I did not already know (ReDoS backtracking, CWE mappings, STRIDE, OWASP API Top 10) before accepting the draft's severities.
3. **Runtime evidence.** For iteration 2 the PoC script `functional-codebase/scripts/naive-checks-i2.sh` was run against the Docker stack. All nine confirmed vulnerabilities reproduced (output in `functional-codebase/scripts/naive-checks-i2-output.txt`).

## 2. What I kept, changed and rejected

- **Kept: most of the code.** I deliberately left the generated code naive. The master spec has no security requirements, so the missing authentication, authorization, audit and rate limiting are the PA2 baseline that PA3 will fix. This is why the file headers say "no code changes (kept naive on purpose)".
- **Changed: business logic and test coverage, through prompts.** I did not hand-edit the generated source. I steered changes by revising the prompts. The test suite grew from 1 test (scaffold) to 10, 32, 60 and finally 75 across the five build prompts, as the task log shows, because I asked for tests of every route, every artifact type and the failure cases.
- **Rejected: weak or vague prompts, before they reached Claude Code.** I use the claude.ai chat to turn my rough ideas into specific, scoped prompts, so that Claude Code spends its tokens on a direct build path. Most of my rejections and edits happen at this stage. Earlier wording that was ambiguous or too broad was rejected and rewritten, and each Claude Code prompt covered one feature with its tests.
- **Reports.** I accepted the structure of the two reports. I did not accept numbers or claims I could not trace to a log or to the code (see items 19 and 20 below).

## 3. Mistakes and gaps I identified in the AI output (20 examples)

### Claude Code (the developer agent)

| # | What went wrong | Evidence | How it was resolved |
|---|---|---|---|
| 1 | A shell helper wrote malformed header lines in the new files. | Task log, schema task | Fixed before the passing run. |
| 2 | The prompt asked for 2 seed projects but `seed-projects.json` holds only 1. | Task log, schema task | Documented. The mock data was copied unchanged as the spec requires. |
| 3 | A new test passed the project id as the second argument of a delete call, so it was not testing what was intended. | Task log, file-handling task | Caught by the typecheck and fixed. |
| 4 | The demo script's greedy `sed` picked a nested id as the project id, giving a 404. The app was correct. | Task log, demo task | The regex was anchored. Run 2 passed all 8 steps. |
| 5 | `GET /download` is shadowed by `/:artifact_type/:artifact_id` unless it is registered first. | Task log, artifact task | Route order fixed and tested. |
| 6 | `.env.example` still lists `UPLOAD_DIR` and lacks `MAX_UPLOAD_BYTES` after the rename to `FILE_STORAGE_DIR`. | Task log, file-handling task | Open item: a manual edit is still needed. |
| 7 | Vitest had no `lcov` reporter, so SonarQube would have found no coverage. | Task log, pipeline task | Reporter added. |
| 8 | The lcov paths are relative to `functional-codebase/`, so Sonar could not match them to the source files. | Task log, pipeline task | A prefixing step was added to the workflow. |
| 9 | The first zip implementation used `archiver`, which pulled in a vulnerable transitive dependency. | `npm audit`, task log | Replaced with `fflate`; audit now shows 0 vulnerabilities. |
| 10 | The runtime image has no `HEALTHCHECK`. The PA1 Dockerfile had one. | Trivy DS-0026 (TV-1) | Recorded as a finding, to fix in PA3. |
| 11 | `docker-compose.yml` dropped `read_only` and `no-new-privileges` and publishes `3000:3000` on all interfaces. | Compose file, V8 | Recorded, to fix in PA3. |
| 12 | The agent added an e-mail regex nobody asked for, and it backtracks quadratically (ReDoS). | SonarQube S5852; my timing: 40,000 characters took 1.2 s, 80,000 took 4.7 s | Recorded as V9 (High). Fix planned for PA3. |
| 13 | The Zod schema puts `.max(254)` before `.regex(...)`, but Zod still runs the regex on over-long input unless the check aborts. The length limit gives false comfort. | `src/validation.ts` L19 | Recorded in V9. Fix: `abort: true`. |
| 14 | `revision_version` is only a counter incremented by a trigger. `PUT` never checks an expected version, so concurrent edits are lost silently. | `src/projects-repo.ts`, PoC step V5 (both writers got 200) | Recorded as V5. |
| 15 | The migrations create full-text (GIN) indexes, but search uses `ILIKE '%…%'`, which cannot use them. | `idx_projects_fts`, `idx_manuscripts_fts`, `src/projects-repo.ts` L159–164 | Recorded in V4. |
| 16 | The agent modelled members only as data and never as callers, so there is no authentication or object-level authorization. | PoC steps V1 and V2 (anonymous create 201, member list replaced 200) | Recorded as V1 and V2 (Critical). |
| 17 | Member e-mail addresses are returned to anonymous callers. | PoC step V6 | Recorded as V6. |
| 18 | Any file type is accepted, and the response `Content-Type` is derived from the user-supplied file name. An `.html` upload is served back as `text/html`. | PoC step V3 | Recorded as V3. `nosniff` and `attachment` reduce the impact. |

### The claude.ai drafts of the two reports

| # | What went wrong | How I found it | How it was resolved |
|---|---|---|---|
| 19 | Both reports cite `security-poc/naive-checks.sh` and an output file that did not exist anywhere in the repository. | Searching the repo for the cited paths | The script was written and run in iteration 2 (`naive-checks-i2.sh`). The references now point to it. |
| 20 | The V9 write-up claimed the API freezes for "9–14 s". It had not been measured. | Re-measuring the regex and the live API | My measurement: the attack request took 4.9 s and `/health` stalled for 4.4 s at 80,000 characters. The text now states the measured values and the quadratic growth. |

## 4. How I checked the threat modeling against the scanner output

I compared the STRIDE matrix and the V1–V9 list with what each tool actually reported:

| Tool | Raw result | What it covered in my threat model |
|---|---|---|
| Semgrep (266 rules, 88 files) | 1 finding | A false positive (SG-1). It covered none of V1–V9. |
| SonarQube Cloud | 2 issues, gate **Passed**, 87.7% coverage | SQ-2 (regex) became V9. SQ-1 is a code-quality note only. |
| Trivy fs | 0 vulnerable dependencies, 0 secrets, 1 misconfiguration | TV-1 (no HEALTHCHECK) feeds V8 only. |
| Trivy image | 1 HIGH CVE in the base image | Present but not reachable from the API. |
| npm audit | 0 vulnerabilities | Nothing. |

Every threat that is not in the scanner output (V1, V2, V3, V4, V5, V6, V7) I tried to confirm another way: by reading the code path and, in iteration 2, by reproducing it with the PoC script. The comparison showed that the scanners found almost none of the issues that matter most, while the STRIDE matrix found them all.

## 5. What I learned about the limits of the scanners and of the AI

Four cases where the tools gave a misleading signal:

1. **SonarQube's quality gate passed with no authentication at all.** The Overview page shows "Passed — All conditions passed" with 2 open issues and 87.7% coverage (`pipeline-logs/pa2/sonar-overview.png`), for a service where any anonymous caller can create, change or delete any project. A missing control has no code for a rule to match.
2. **Semgrep's only finding was a false positive.** The flagged `console.error` template string in `src/storage.ts` L55 prints a path the server generated itself, not attacker input.
3. **Trivy's secret scan reported 0 secrets, yet the database password `pp_password` is hard-coded** in `docker-compose.yml` and `.env.example`. I found it manually (V8). The scanner reported nothing for it.
4. **Trivy's one HIGH finding is not exploitable.** The vulnerable `ip-address` package sits inside npm's own bundled modules in the base image, and the running API never loads it. A HIGH label alone is not a priority; reachability decides it.

The same lesson applies to the AI. Claude Code mostly prevented the injection-style bugs that scanners are good at (parameterized SQL, UUID checks, path confinement, upload limits), yet it left every access-control gap open and added a ReDoS on its own initiative. The claude.ai drafts were useful, but two of their claims could not be traced to evidence until I checked them. My rule for PA3 is to trust a claim only once I can point to a log line, a code line or a command output that shows it.

## 6. Next steps (PA3)

- Fix V1, V2 first (authentication and ownership checks), then V9 (linear-time e-mail validation plus `abort: true` and a smaller JSON limit), then V5, V4, V3, V6, V7, V8 in the order of `security-analysis.md` §7.
- Re-run `naive-checks-i2.sh` after each fix. Every step that returns 2xx on the naive build must return 401, 403, 404, 409, 413 or 429.
- Fill in every metadata field and add the language stack to every header before submitting.
