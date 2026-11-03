# Agent_environment.md — Autonomous AI Developer Agent Configuration

**Project:** PP Domain 1 — Project Artifact & Repository Indexer · **Author:** _<Your Name>_ · **Recorded on:** _<YYYY-MM-DD>_

## AI Usage Log (mandatory)

| Field | Value |
|---|---|
| Conceptual AI contribution | **[__%] AI Generated / [__%] Human Authored** (template drafted by Claude chat; values below are filled in by me from my own machine) |
| Tool | Claude (claude.ai chat, Claude Opus 5.5) drafted the structure of this document |
| Design-aid prompt | Same chat as spec.md: _<chat share link>_ |

> Every `<...>` value below must come from **your own terminal output** — run the command shown next to it and paste the result. Do not guess.

---

## 1. Agent identity

| Item | Value | How I verified it |
|---|---|---|
| Agent | **Claude Code** (Anthropic's agentic coding CLI) | — |
| Agent version | `<e.g. 2.x.y>` | `claude --version` |
| Install method | `<native installer / npm>` | the command I used (see §6) |
| Interface | Terminal CLI (interactive REPL) `<or VS Code extension>` | — |
| Account / auth | `<Claude Pro / Max subscription login, or Anthropic Console API key>` | `/status` inside Claude Code |
| Billing cap / budget | `<e.g. Pro plan usage limits, or Console spend limit $__>` | Console or plan page |

## 2. LLM model

| Item | Value | How I verified it |
|---|---|---|
| Model (pinned) | `claude-sonnet-5-5` `<change if you picked another>` | `/model` picker shows current selection; session header |
| Set via | Project `.claude/settings.json` → `"model"` | file in this repo |
| Context window | `<standard / 1M>` | `/model` |
| Fallback model | none | — |

**Why pin a full model name instead of the `sonnet` alias?** Aliases move to the newest version automatically. Pinning keeps the PA2 naive baseline and the PA3 secure run on the *same* model, so differences come from prompting, not from a silent model upgrade.

## 3. Hyperparameters & generation settings

| Setting | Value | Where it is set | Notes |
|---|---|---|---|
| Effort level | `medium` | `.claude/settings.json` → `effortLevel` | Controls how much adaptive reasoning the model does. Can be overridden with `/effort` |
| Extended thinking | Model-decided (cannot be fully disabled on 5.5-generation models) | — | `Alt/Option+T` toggles on models that support it |
| Temperature / top-p | **Not user-configurable in Claude Code** | — | Record this explicitly — it matters for reproducibility. Claude Code uses Anthropic's fixed agent defaults |
| Max output / turns | Default (interactive) | — | For scripted runs: `claude -p "<prompt>" --max-turns <n>` |
| Memory files | `CLAUDE.md` at repo root | repo | Contains **only** logging conventions — **no security guidance**, so the PA2 baseline stays naive |

## 4. Operational mode & tool use

| Item | Value |
|---|---|
| Default permission mode | `default` (Manual: Claude asks before every edit and command) — set in `.claude/settings.json` → `permissions.defaultMode` |
| Modes I may switch to | `acceptEdits` for bulk generation in PA2 (cycle with `Shift+Tab`); `plan` to review a plan before edits |
| Modes I will **not** use | `bypassPermissions` / `--dangerously-skip-permissions` (host is my personal machine, not an isolated VM) |
| Built-in tools available to the agent | Read, Write, Edit, Glob, Grep, Bash, WebFetch, WebSearch, TodoWrite, Task (sub-agents) `<confirm with /permissions>` |
| Deny rules | `Read(./.env)`, `Read(./.env.*)`, `Bash(git push:*)` — agent cannot read local secrets or push; **I** push manually after review |
| MCP servers | none `<or list them: /mcp>` |
| Git workflow | Agent may commit locally; commit messages must start with `AI AGENT BUILD: <feature>` (enforced via CLAUDE.md); my manual edits use `HUMAN MOD: <feature>` |
| Conversation export | `/export` at the end of every session → saved under `ai-history/` |

## 5. Host environment

| Item | Value | Command |
|---|---|---|
| OS | `<e.g. macOS 15.4 / Windows 11 + WSL2 Ubuntu 24.04>` | `sw_vers` / `winver` / `lsb_release -a` |
| CPU / RAM | `<e.g. Apple M3, 16 GB>` | system info |
| Shell | `<zsh 5.9 / bash 5.2>` | `echo $SHELL; $SHELL --version` |
| Node.js | `<v22.x.x>` | `node -v` |
| npm | `<10.x>` | `npm -v` |
| Git | `<2.4x>` | `git --version` |
| Docker | `<Docker Desktop 4.x / Engine 2x.x>` | `docker --version` |
| Docker Compose | `<v2.x>` | `docker compose version` |
| Editor | `<VS Code 1.xx>` | — |
| Repository | `https://github.com/<you>/pp-artifact-indexer` | — |

## 6. Reproduction steps

```bash
# 1. Install Claude Code (native installer – macOS / Linux / WSL)
curl -fsSL https://claude.ai/install.sh | bash
#    Windows PowerShell alternative:  irm https://claude.ai/install.ps1 | iex
#    npm alternative (Node 18+):      npm install -g @anthropic-ai/claude-code
claude --version

# 2. Clone and enter the repo
git clone https://github.com/<you>/pp-artifact-indexer.git
cd pp-artifact-indexer

# 3. Start the agent (project settings in .claude/settings.json are picked up automatically)
claude
#    first run: log in with your Claude account (or set ANTHROPIC_API_KEY)
#    inside the session:  /status   /model   /permissions
```

## 7. Project-level configuration files (committed)

`.claude/settings.json`
```json
{
  "model": "claude-sonnet-5-5",
  "effortLevel": "medium",
  "permissions": {
    "defaultMode": "default",
    "deny": ["Read(./.env)", "Read(./.env.*)", "Bash(git push:*)"]
  }
}
```

`CLAUDE.md` — see file at repo root.
