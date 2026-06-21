---
name: backend
description: >-
  Team standards for backend work. Read before
  coding or reviewing.
---

# Backend Skill

Backend work belongs in `vault-engine`, the standalone Node.js service that owns
vault mutation, AI orchestration, search, and MCP tools.

## Domains

- `fs/`: file CRUD, Chokidar watching, lock manager, atomic writes, human-edit
  protection.
- `ai/`: provider routing, context loading, skill catalog, Manager/Helper/Reviewer
  loops, verification routing.
- `search/`: LanceDB vector index, keyword search, Ollama embeddings, incremental
  updates.
- `mcpServer.ts`: local MCP tools such as `search_vault`, `plan_project`, and
  task claiming.

## Invariants

- Agents generate drafts under `_orchestration/workspace/task-*/draft/`; only the
  orchestrator commits final vault paths.
- `1_Human_Materials/` is read-only.
- App state belongs in `~/.study-app/cache/<vault-hash>/`, not in the vault.
- Manifest writes must be atomic and serialized after every task transition.
- Event logs are append-only during active orchestration.
- Parallel task batches should use all-settled style handling.

## Verification

- Failed deterministic verification or two failed judge passes route to
  `_needs_review/`.
- Numerical solver correctness requires a convergence check.
- Generator and reviewer providers must be structurally different.
- Watcher changes must prove ordinary edits trigger incremental re-indexing only.

## Error Handling

- Report lock failures, provider failures, invalid manifests, and human-edit
  conflicts as explicit actionable errors.
- Do not silently fall back across trust boundaries unless the behavior is
  documented and observable.
