# PA1 – Verified DevSecOps Pipeline Execution

**Project:** PP Domain 1 – Project Artifact & Repository Indexer
**Author:** Alexa Stein
**Repository:** https://github.com/alexastein/pp-artifact-indexer

## AI Usage Log

| Field                      | Value                                                                                                                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conceptual AI contribution | [75%] AI / [25%] Human. Claude chat drafted this page, including the observations, from my run URL, screenshot and the problems I hit while setting up the pipeline; I collected the finding counts from the run Summary and reviewed and edited the text. |
| Chat link                  | <your claude.ai share link>                                                                                                                                                                                                                                |

## 1. Run details

These are the details of the first successful run of my pipeline, after I moved the project to the repository root so GitHub Actions could detect `.github/workflows/devsecops.yml`.

| Item           | Value                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| Workflow       | `.github/workflows/devsecops.yml` – "DevSecOps Pipeline"                                              |
| Run            | [#1 (run ID 41595494823)](https://github.com/alexastein/pp-artifact-indexer/actions/runs/41595494823) |
| Trigger        | push to `main`                                                                                        |
| Date           | 2026-11-03                                                                                            |
| Commit         | `f56a2d2` – "Merge branch 'main' of github.com:alexastein/pp-artifact-indexer"                        |
| Runner         | GitHub-hosted `ubuntu-latest`                                                                         |
| Overall result | ✅ Success – 5/5 jobs passed                                                                          |

## 2. Job results

All five jobs finished with a green check, as shown in the run screenshot (`pa1-run-summary.png`).

| Job                                             | What it does                                                                                                                            | Result            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Build & Unit Test                               | `npm ci`, type-check, Vitest unit tests with coverage, then `npm run build`                                                             | ✅ 4 tests passed |
| Dependency & Secret Scan (Trivy fs + npm audit) | Trivy filesystem scan for vulnerable dependencies, hard-coded secrets and misconfigurations, plus `npm audit` (finished in 42 s)        | ✅                |
| SAST (Semgrep)                                  | Static analysis with the OWASP Top 10, Node.js, TypeScript, Dockerfile and GitHub Actions rulesets                                      | ✅                |
| SAST (SonarQube Cloud)                          | Static analysis and code quality in SonarQube Cloud, with test coverage imported                                                        | ✅                |
| Docker Build, Smoke Test & Image Scan           | Builds the multi-stage image, starts the API and PostgreSQL with `docker compose up`, checks `/health`, then scans the image with Trivy | ✅                |

The only annotation on the run is a GitHub notice that the `ubuntu-latest` runner label is migrating to Ubuntu 26. It is informational and did not affect any job.

## 3. Security scan telemetry

For PA1 I set every scan to be **non-blocking** (`exit-code: "0"` for Trivy, `|| true` for Semgrep and npm audit, `continue-on-error` for SonarQube). That way the pipeline stays green while still reporting findings. I will triage these findings in PA2.

| Tool            | Scope                                   | Findings                                          | Notes                                                                                 |
| --------------- | --------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Trivy (fs)      | Dependencies, secrets, IaC/misconfig    | <N from "Trivy fs findings">                      | <e.g. "none", or library + severity from the Trivy table>                             |
| Trivy (image)   | OS and Node packages in the final image | <N from "Trivy image findings">                   | <e.g. "2 MEDIUM in alpine base packages">                                             |
| npm audit       | npm dependency advisories               | <info / low / moderate / high / critical>         |                                                                                       |
| Semgrep         | SAST on `src/`, Dockerfile, workflows   | <N from "Semgrep findings">                       | <rule names, if any>                                                                  |
| SonarQube Cloud | SAST and code quality                   | <bugs / vulnerabilities / hotspots / code smells> | [Dashboard](https://sonarcloud.io/project/overview?id=alexastein_pp-artifact-indexer) |

The SARIF results are also uploaded to **GitHub → Security → Code scanning** under the categories `trivy-fs`, `semgrep` and `trivy-image`.

## 4. Evidence files in this folder

| File                                                            | Contents                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------- |
| `pa1-run-logs.zip`                                              | Full raw logs of every job (GitHub "Download log archive") |
| `sca-reports/trivy-fs.sarif`                                    | Trivy filesystem results (SARIF)                           |
| `sca-reports/npm-audit.json`                                    | npm audit results                                          |
| `semgrep-reports/semgrep.sarif`, `semgrep-reports/semgrep.json` | Semgrep results                                            |
| `image-scan-reports/trivy-image.sarif`                          | Trivy container image results                              |
| `pa1-run-summary.png`                                           | Screenshot of the run page showing all 5 jobs passing      |

## 5. Observations

- **Getting the pipeline to run was the main challenge.** My first pushes did not trigger the pipeline because the workflow file sat inside a `dev/` subfolder, and a leftover `main.yml` with flattened indentation failed with "No event triggers defined in `on`". Once I moved the whole project to the repository root and removed the broken file, GitHub detected `.github/workflows/devsecops.yml` and run #1 passed on the first try. I learned that GitHub Actions only reads workflows from `.github/workflows/` at the root, and that YAML depends entirely on indentation.
- **A small codebase means a small attack surface for now.** At this stage the app only has `/health` and three read-only catalog routes, one runtime dependency (Express), and static mock data. I expect most of the findings above to come from the dependency tree and the Node/Alpine base image rather than from my own code. That will change in PA2, when the AI agent builds the full spec, including file uploads, search and project visibility rules.
- **The pipeline itself is part of the attack surface.** I pinned every third-party GitHub Action to a full commit SHA instead of a version tag. In March 2026, attackers force-pushed 76 of 77 `aquasecurity/trivy-action` tags to credential-stealing code (CVE-2026-33634). A pipeline using `@v0.34.0` would have run malware with access to its secrets, while a SHA pin cannot be silently replaced.
- **Non-blocking scans fit a baseline phase.** Running every scanner with `exit-code: "0"` keeps the pipeline green while still recording telemetry as SARIF reports and job-summary counts. For PA2 this gives me a clean "before" picture to triage. In a real team I would later switch high and critical findings to blocking so vulnerable builds cannot merge.
