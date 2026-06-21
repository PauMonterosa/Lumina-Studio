---
name: accessibility
description: >-
  Team standards for accessibility work. Read before
  coding or reviewing.
---

# Accessibility Skill

Accessibility work applies to the Electron renderer: file tree, chat, editor,
Markdown/LaTeX preview, modals, and study actions.

## Standards

- Preserve keyboard access for file navigation, chat input, editor focus, preview
  panes, and modal dialogs.
- Keep visible focus indicators and logical tab order.
- Use semantic controls for actions that trigger generation, verification,
  search, and file operations.
- Give generated-content status, verification failures, lock conflicts, and
  `_needs_review/` routing clear text feedback, not color alone.
- Ensure Markdown, math, and code previews remain readable at different zoom
  levels and contrast modes.

## Review Focus

- CodeMirror focus handling does not trap users unexpectedly.
- Chat and generation progress announcements are understandable to assistive
  technology where applicable.
- Error messages explain what failed and what the user can do next.
