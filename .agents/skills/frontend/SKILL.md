---
name: frontend
description: >-
  Team standards for frontend work. Read before
  coding or reviewing.
---

# Frontend Skill

Frontend work belongs in the Electron `app-shell`, especially
`app-shell/renderer/` for React UI and `app-shell/main/` only when IPC wiring is
part of the lane.

## Stack

- Use React and TypeScript for renderer code.
- Use CodeMirror 6 for editing Markdown and Python content.
- Render Markdown and math through React Markdown, `remark-math`,
  `rehype-katex`, and KaTeX-compatible syntax.
- Use Shiki for code-block highlighting when a highlighted preview is required.

## Boundaries

- Keep the renderer thin. It should call IPC or engine-facing adapters rather
  than duplicating vault mutation, search, AI routing, or orchestration logic.
- Never write directly to `University_Archive/` from renderer code.
- Do not store embeddings, SRS progress, OCR cache, or other durable app state in
  the vault.

## Implementation Standards

- Preserve keyboard navigation, focus order, and accessible names for file tree,
  chat, editor, and preview surfaces.
- Keep Catalan user-facing study content intact. Code and code comments stay in
  English.
- Treat Markdown/LaTeX rendering as user content: avoid unsafe HTML injection and
  keep KaTeX compatibility.
- Keep IPC payloads explicit and typed. Surface actionable errors from the engine
  instead of hiding failures in the UI.

## Review Focus

- UI state does not become the source of truth for vault files.
- Renderer behavior remains correct when engine calls fail, lock conflicts occur,
  or verification routes a draft to `_needs_review/`.
- Preview/editor changes do not corrupt Markdown, LaTeX, Python, or MATLAB
  snippets.
