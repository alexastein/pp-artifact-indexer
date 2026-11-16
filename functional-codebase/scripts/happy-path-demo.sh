#!/usr/bin/env bash
# Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
# Prompt Summary: "Scripted curl happy-path demo against the docker compose stack"
# AI Contribution: 100% AI generated / 0% human refactored
# Human Modifications: Reviewed, no changes; notes in .ai_logs/conceptual_journal.md
# Verification: Read the script and the saved output .ai_logs/happy-path-demo-output.txt (all 8 steps pass); did not re-run the curl demo myself
# Confidence: Medium
#
# Usage (from functional-codebase/):  docker compose up --build -d && ./scripts/happy-path-demo.sh
# Needs: bash, curl, unzip, docker compose (only to load the academic units once).

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
API="$BASE_URL/api/v1/projects"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

step() { printf '\n=== %s\n' "$*"; }

# Step 1: pulls the top-level "id" out of a JSON response. Every object our API returns starts with its own id,
# so we anchor to the start of the text (a greedy match would pick up ids of nested members or units instead).
first_id() { sed -n 's/^{"id":"\([^"]*\)".*/\1/p' | head -n 1; }

# Step 2: curl wrapper: -f makes curl fail on HTTP errors, so `set -e` stops the demo at the first problem.
call() { curl -fsS "$@"; echo; }

step "0. Wait for GET /health"
for i in $(seq 1 60); do
  if curl -fsS "$BASE_URL/health" >/dev/null 2>&1; then break; fi
  [ "$i" -eq 60 ] && { echo "API did not become healthy" >&2; exit 1; }
  sleep 1
done
call "$BASE_URL/health"

step "0b. Load academic units (labs, programs, courses) into the empty database"
# the seed is safe to run again; it skips projects that already exist
docker compose exec -T api node dist/cli.js seed

step "1. Create a project (POST /api/v1/projects)"
PROJECT_JSON=$(curl -fsS -X POST "$API" -H 'Content-Type: application/json' -d '{
  "title": "Happy Path Demo Project",
  "description": "Created by the happy-path-demo script about gaze tracking",
  "members": [
    {"name": "Mia Chen", "email": "mia.demo@example.edu", "role": "student"},
    {"name": "Dr. Ada Rivera", "email": "ada.demo@example.edu", "role": "faculty"}
  ],
  "unit_ids": ["lab-sail", "prog-mscis", "c-cs763-f26"]
}')
echo "$PROJECT_JSON"
PROJECT_ID=$(echo "$PROJECT_JSON" | first_id)
echo "-> project id: $PROJECT_ID"

step "2a. Add a manuscript artifact"
MANUSCRIPT_JSON=$(curl -fsS -X POST "$API/$PROJECT_ID/artifacts/manuscripts" -H 'Content-Type: application/json' -d '{
  "title": "Gaze Tracking for Secure Interfaces",
  "abstract": "We study gaze signals.",
  "authors": ["Mia Chen", "Ada Rivera"],
  "keywords": ["gaze", "security"],
  "year": 2026
}')
echo "$MANUSCRIPT_JSON"
MANUSCRIPT_ID=$(echo "$MANUSCRIPT_JSON" | first_id)

step "2b. Add a video artifact"
call -X POST "$API/$PROJECT_ID/artifacts/videos" -H 'Content-Type: application/json' -d '{
  "video_url": "https://videos.example.edu/gaze-demo.mp4",
  "thumbnail_url": "https://videos.example.edu/gaze-demo.png",
  "duration_seconds": 240,
  "description": "Final presentation"
}'

step "2c. Add a repository artifact (github.com/bu-met-sail/agent-pipeline-study is in the mock git host,"
echo "    so branch, tech stack and latest commit are filled in automatically)"
call -X POST "$API/$PROJECT_ID/artifacts/repositories" -H 'Content-Type: application/json' -d '{
  "repo_url": "https://github.com/bu-met-sail/agent-pipeline-study",
  "total_commit_count": 128
}'

step "3. Upload the manuscript file (multipart, field name \"file\")"
printf '%%PDF-1.4\nHappy path demo manuscript content\n' > "$WORK_DIR/gaze-paper.pdf"
EXPECTED_SHA=$(shasum -a 256 "$WORK_DIR/gaze-paper.pdf" | cut -d' ' -f1)
call -X POST "$API/$PROJECT_ID/artifacts/manuscripts/$MANUSCRIPT_ID/file" -F "file=@$WORK_DIR/gaze-paper.pdf;type=application/pdf"
echo "-> expected sha256: $EXPECTED_SHA"

step "4. Search: keyword + lab_id + has_artifact_type"
call -G "$API" --data-urlencode "keyword=gaze" --data-urlencode "lab_id=lab-sail" --data-urlencode "has_artifact_type=manuscripts,videos,repositories"

step "5. Read the project (members, units, artifact counts) and all its artifacts"
call "$API/$PROJECT_ID"
call "$API/$PROJECT_ID/artifacts"

step "6. Download the single manuscript file and check its SHA-256"
curl -fsS -D "$WORK_DIR/headers.txt" -o "$WORK_DIR/downloaded.pdf" "$API/$PROJECT_ID/artifacts/manuscripts/$MANUSCRIPT_ID/file"
grep -i '^content-disposition' "$WORK_DIR/headers.txt" || true
ACTUAL_SHA=$(shasum -a 256 "$WORK_DIR/downloaded.pdf" | cut -d' ' -f1)
if [ "$ACTUAL_SHA" = "$EXPECTED_SHA" ]; then echo "-> sha256 matches ($ACTUAL_SHA)"; else echo "-> SHA-256 MISMATCH" >&2; exit 1; fi

step "7. Download all manuscripts as a zip and list it"
curl -fsS -o "$WORK_DIR/manuscripts.zip" "$API/$PROJECT_ID/artifacts/manuscripts/download"
unzip -l "$WORK_DIR/manuscripts.zip"

step "8. Delete the project (also removes its artifacts and stored files)"
STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$API/$PROJECT_ID")
echo "DELETE -> HTTP $STATUS"
[ "$STATUS" = "204" ] || { echo "expected 204" >&2; exit 1; }
STATUS=$(curl -sS -o /dev/null -w '%{http_code}' "$API/$PROJECT_ID")
echo "GET after delete -> HTTP $STATUS (expected 404)"
[ "$STATUS" = "404" ] || exit 1

step "Done: happy path completed"
