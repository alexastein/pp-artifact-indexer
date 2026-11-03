# PP Project Artifact & Repository Indexer (Domain 1)

CS 763 Secure Software Development — semester project. A cloud-native backend service of the campus **Project Portal** that catalogs project artifacts — public Git repository profiles, manuscripts, and video presentations — by academic lab, department program, and course. Built by an autonomous AI developer agent (**Claude Code**) under human DevSecOps supervision.

[![DevSecOps Pipeline](https://github.com/<you>/pp-artifact-indexer/actions/workflows/devsecops.yml/badge.svg)](https://github.com/<you>/pp-artifact-indexer/actions/workflows/devsecops.yml)

## PA1 deliverables in this release (`pa1`)

| File | What it is |
|---|---|
| [`spec.md`](spec.md) | Functional specification: endpoints, JSON schemas, ERD, mock data |
| [`Agent_environment.md`](Agent_environment.md) | Exact Claude Code configuration, model, settings, host |
| [`Prompt_test_log.md`](Prompt_test_log.md) | Initial prompts + generated code proving the agent works |
| [`.github/workflows/devsecops.yml`](.github/workflows/devsecops.yml) | CI/CD: build, tests, Trivy (SCA/secret/misconfig/image), Semgrep, SonarQube Cloud |
| [`Dockerfile`](Dockerfile), [`docker-compose.yml`](docker-compose.yml) | Multi-stage image + single-tenant API/PostgreSQL stack |
| [`pipeline-logs/`](pipeline-logs/) | Exported, verified pipeline run logs |
| [`code_AI_history.md`](code_AI_history.md), [`ai-history/`](ai-history/) | AI interaction logs |

## Run locally

```bash
npm install          # first time: creates package-lock.json (commit it)
npm test
npm run dev          # http://localhost:3000/health

cp .env.example .env
docker compose up --build   # API on 127.0.0.1:3000 + private PostgreSQL
curl http://127.0.0.1:3000/health
docker compose down -v
```

## AI logging conventions
- Source headers: `AI Contribution Weight: [NN%] AI Generated / [NN%] Human Refactored`
- Commits: `AI AGENT BUILD: <feature>` (agent) / `HUMAN MOD: <feature>` (me)
- Every markdown deliverable opens with an **AI Usage Log** table.
