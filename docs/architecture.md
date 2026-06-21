# Architecture

Lumina Studio is a local-first AI study application for an Engineering Physics
student at UPC. It generates, verifies, and organizes coursework artifacts such
as flashcards, exam questions, and numerical solvers inside an Obsidian-style
vault while preserving strict boundaries between source material, generated
content, and user work.

## System Context

The system runs on a single workstation. A standalone Node.js service,
`vault-engine`, owns all core behavior. The Electron `app-shell` is a thin
client that renders files, previews, chat, and editor surfaces. The vault,
`University_Archive/`, is the file-backed data store and must remain readable by
external tools such as Obsidian and Cursor.

External AI providers are optional execution backends. Ollama supplies local
embeddings and local generation by default; Anthropic and OpenAI may be used as
cloud generation or review providers when configured.

## Components

- `vault-engine/fs/` handles CRUD, Chokidar watching, lock management, and
  human-edit conflict detection.
- `vault-engine/ai/` handles provider routing, context loading from nested
  `AGENTS.md` files, skill catalogs, and Manager/Helper/Reviewer loops.
- `vault-engine/search/` owns incremental semantic and keyword indexing with
  LanceDB and Ollama embeddings.
- `vault-engine/mcpServer.ts` exposes local MCP tools such as `search_vault`,
  `plan_project`, and task claiming.
- `app-shell/main/` bridges the renderer to the engine through IPC.
- `app-shell/renderer/` contains React and TypeScript UI: file tree, chat,
  Markdown/LaTeX preview, and CodeMirror 6 editing.
- `University_Archive/` stores read-only human material, generated AI material,
  user work, and the `_orchestration/` control plane.

## Data Flow

1. The renderer requests file, search, or generation work through Electron IPC.
2. IPC calls into `vault-engine`; the renderer does not mutate vault files
   directly.
3. Agents write generated drafts under
   `University_Archive/_orchestration/workspace/task-*/draft/`.
4. The orchestrator verifies drafts, checks locks and file hashes, then commits
   valid drafts to their final vault targets.
5. Failed verification or human-edit conflicts route to `_needs_review/`.
6. Watchers perform incremental re-indexing for changed files only.

## Trust Boundaries

- `1_Human_Materials/` is an immutable input boundary.
- Only the orchestrator may move drafts into final vault paths.
- App state such as embeddings, SRS progress, and OCR cache lives outside the
  vault under `~/.study-app/cache/<vault-hash>/`.
- Model providers are untrusted for numerical truth; numerical solvers require
  deterministic convergence checks.
- LLM judges must use a different provider than the generator being judged.
- The append-only orchestration event log is an audit trail and must not be
  truncated during active work.

## Deployment Topology

This is not a hosted web deployment. The engine runs locally, exposes MCP at
`http://localhost:3742/mcp`, and assumes clients run on the same host so process
liveness checks and local file locks are meaningful.
