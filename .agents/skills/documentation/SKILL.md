---
name: documentation
description: >-
  Team standards for documentation work. Read before
  coding or reviewing.
---

# Documentation Skill

Documentation should make the vault-engine/app-shell/vault boundaries obvious to
the next agent or human operator.

## Standards

- Use exact repo paths and runnable commands.
- Keep architectural claims aligned with `project_context.json` and
  `docs/project_context.md`.
- Document whether a workflow mutates the vault, writes a draft, updates app
  cache, or only reads data.
- For generated study content, write explanatory content in Catalan and code or
  code comments in English.
- For math content, document KaTeX-compatible syntax.
- Record assumptions instead of inventing missing deployment, auth, or provider
  details.

## Handoff Requirements

- Implementation docs list changed files, commands, and verification output.
- Review docs keep the ledger format intact.
- Setup and run docs mention Ollama, optional cloud keys, local MCP, and external
  cache paths when relevant.
