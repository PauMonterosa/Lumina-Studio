---
name: devops
description: >-
  Team standards for devops work. Read before
  coding or reviewing.
---

# Devops Skill

Devops work covers local verification gates, scripts, engine run workflow, CI,
and environment checks for the local-first desktop app.

## Environment

- The backend engine is a local Node.js service.
- The Electron app-shell connects to the local engine.
- MCP is expected at `http://localhost:3742/mcp` when the engine is running.
- Ollama should be available for local embeddings and local generation.
- Anthropic and OpenAI API keys are optional cloud fallback configuration.

## Verification Gates

- Keep `python harness.py validate` as the first step in `init.sh` and
  `init.ps1`.
- Run Node dependency installation, lint, build, and tests when `package.json`
  and matching scripts exist.
- Do not weaken checks to make a failing feature pass.
- Use explicit numbered steps so failures are easy to locate.

## Safety

- Quote shell variables and paths; Windows paths may contain spaces.
- Do not delete caches, vault files, or orchestration logs as a workaround.
- Do not truncate event logs.
- Do not require a full-vault rescan for ordinary verification.
