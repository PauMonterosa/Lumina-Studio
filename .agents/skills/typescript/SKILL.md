---
name: typescript
description: >-
  Team standards for typescript work. Read before
  coding or reviewing.
---

# Typescript Skill

TypeScript is used in both `vault-engine` and the Electron `app-shell`.

## Standards

- Keep service, IPC, MCP, and manifest payloads explicitly typed.
- Prefer narrow domain types over unstructured objects for task manifests, lock
  records, provider routes, and verification results.
- Validate external input at boundaries: MCP tools, IPC handlers, model outputs,
  file-system reads, and manifest JSON.
- Use atomic write helpers for persisted state instead of ad hoc `writeFile`
  calls when correctness depends on crash safety.
- Prefer `Promise.allSettled` for independent orchestration batches.
- Do not hide errors with broad `catch` blocks; preserve context and route
  blocked work visibly.

## Project-Specific Checks

- Context loader code must preserve nested `AGENTS.md` inheritance semantics.
- Provider routing must enforce generator/reviewer independence.
- Search watcher changes must keep indexing incremental.
- Renderer TypeScript must not import deep `vault-engine` internals; use IPC or a
  public client boundary.
