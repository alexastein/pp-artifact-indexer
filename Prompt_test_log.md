# Prompt_test_log.md — Initial Agent Smoke Test

**Purpose:** prove that the autonomous developer agent (Claude Code) is installed, configured per `Agent_environment.md`, and can read the repo, write code, run tests and commit.
**Author:** _<Alexa Stein>_ · **Date:** _<YYYY-MM-DD>_ · **Agent:** Claude Code `<version>` · **Model:** `<model>` · **Mode:** `default` (Manual)

## AI Usage Log (mandatory)

| Field                      | Value                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Conceptual AI contribution | **[__%] AI Generated / [__%] Human Authored**                                                                                |
| Design aid                 | Prompts below were drafted with Claude chat (_<chat link>_); the outputs are pasted verbatim from my own Claude Code session |
| Full session export        | `ai-history/pa1-smoke-test.txt` (created with `/export`)                                                                     |

---

## Test 1 — Repository comprehension (read-only)

**Prompt (typed into Claude Code):**

```
Read spec.md and the src/ folder. In 5 bullet points, summarize what this service does and list which endpoints from spec.md section 5.1 are already implemented in src/. Do not modify any files.
```

**Agent output (paste verbatim):**

```
<paste here>
```

**Observation:** _<Did it correctly identify /health and /api/v1/catalog/labs, /programs, /courses as implemented? Any hallucinated endpoints?>_

---

## Test 2 — Code generation + test execution

**Prompt:**

```
Implement endpoint #2 from spec.md section 5.1: GET /ready. For now, without a database, it should return 200 with {"status":"ready","checks":{"mockData":"ok"}} when the mock users, labs, programs, courses and git-host repos are loaded. Add a Vitest + Supertest test for it in tests/. Follow CLAUDE.md. Run npm run typecheck and npm test, then commit.
```

**Permission prompts the agent raised (list them):** _<e.g. Edit src/routes/health.ts → approved; Bash(npm test) → approved; Bash(git commit ...) → approved>_

**Generated code (paste the diff — `git show --stat HEAD` and `git show HEAD`):**

```diff
<paste here>
```

**Test run output (from the agent's Bash tool, or re-run yourself):**

```
<paste npm test output here – expect 5 passed>
```

**Commit created by the agent:** `<hash> AI AGENT BUILD: readiness endpoint`

**My verification:** _<I ran `curl http://localhost:3000/ready` after `npm run dev` and got ...>_

---

## Test 3 — Pipeline awareness (read-only)

**Prompt:**

```
Explain in plain English what each job in .github/workflows/devsecops.yml does, and which security tools it runs. Do not modify any files.
```

**Agent output:**

```
<paste here>
```

---

## Summary

| Test | Capability shown                                                   | Result  |
| ---- | ------------------------------------------------------------------ | ------- |
| 1    | Reads & reasons over repo                                          | ✅ / ❌ |
| 2    | Writes code, writes tests, runs tools, commits with required label | ✅ / ❌ |
| 3    | Understands CI configuration                                       | ✅ / ❌ |

**Notes on agent behavior:** _<anything surprising: extra files created, header comment forgotten, asked for permission N times, etc.>_
