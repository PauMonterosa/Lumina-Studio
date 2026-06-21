# Conventions

This document is the **style and practice contract** for this project.
Agents must read it before writing any code.

---

## General

- Prefer small, focused changes tied to a single `feature_list.json` entry.
- Match neighboring code style before introducing new patterns.
- Keep domain decisions in `docs/` or ADRs, not buried in chat transcripts.
- Keep the product split explicit: `vault-engine` owns logic and vault mutation,
  `app-shell` owns Electron/React presentation, and `University_Archive/` is data.
- Treat `1_Human_Materials/` as immutable source material.
- Generate AI coursework content in Catalan; write code and code comments in English.
- Use KaTeX-compatible LaTeX for math content and avoid unsupported TeX macros.
- Default generated numerical code to Python unless the subject explicitly requires MATLAB.

---

## Software Engineering Defaults

- **Module boundaries:** Keep file-system mutation, search indexing, AI routing,
  and orchestration inside `vault-engine`. Electron IPC may call the engine but
  must not duplicate engine logic in the renderer.
- **Imports:** Prefer TypeScript path-local imports inside a domain. Cross-domain
  imports should flow through public service or IPC boundaries, not deep internal
  files.
- **API contracts:** Preserve engine service APIs, MCP tools, IPC payloads, and
  manifest formats unless the feature explicitly changes them. Breaking changes
  require a migration note in `docs/`.
- **State:** Never write embeddings, SRS progress, OCR cache, or other app state
  into `University_Archive/`; use `~/.study-app/cache/<vault-hash>/`.
- **Tests:** Add or update tests proportional to risk and blast radius. File
  locking, manifest transitions, context loading, verification routing, and IPC
  contracts require focused tests when changed.
- **AI review independence:** Generator and reviewer model providers must be
  different. Enforce this structurally rather than by convention.
- **Error handling:** Make errors explicit and actionable. Failed verification,
  human-edit conflicts, lock failures, and provider failures must route to a
  visible blocked or `_needs_review/` state.
- **Concurrency:** Prefer `Promise.allSettled` for parallel task batches so one
  failed task does not hide sibling results. Manifest writes must be atomic and
  serialized.

---

## Naming And Structure

- Use `vault-engine` for backend service code, with subdomains matching the
  project model: `fs/`, `ai/`, `search/`, and MCP server modules.
- Use `app-shell/main/` for Electron main-process IPC and `app-shell/renderer/`
  for React UI.
- Use descriptive React component names for user-facing panels such as file tree,
  chat, preview, and editor surfaces.
- Name orchestration tasks and lanes after their bounded write target or feature
  goal, not after the agent that runs them.
- Use commit scopes that map to real domains: `engine`, `fs`, `ai`, `search`,
  `mcp`, `shell`, `renderer`, `vault`, `orchestration`, `docs`, `harness`.

---

## Handoffs

- Implementation notes go in `progress/features/<id>/impl.md`.
- Review state goes in `progress/features/<id>/review.md`.
- Heavy detail belongs on disk, not in chat.
- Record changed files, commands run, and test output in the implementation note.
- For content-generation features, record deterministic verification output and
  any LLM judge provider used.
- For demotions or blocked verification, point to the `_needs_review/` target or
  blocked feature id.

---

## Commit style

Use imperative mood in commit messages (≤72 chars subject):
```
feat(engine): add atomic manifest writer
fix(fs): route human edit conflicts to review
docs(orchestration): document task graph invariants
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Scopes: `engine`, `fs`, `ai`, `search`, `mcp`, `shell`, `renderer`, `vault`,
`orchestration`, `docs`, `harness`
