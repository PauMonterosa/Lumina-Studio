---
name: shell-safety
description: >-
  Team standards for shell safety work. Read before
  coding or reviewing.
---

# Shell Safety Skill

Shell work must be portable across Windows PowerShell and POSIX shells because
this repo ships both `init.ps1` and `init.sh`.

## Standards

- Keep `init` gates deterministic and non-interactive.
- Quote paths; the workspace path may contain spaces.
- In Bash, use `set -euo pipefail`.
- In PowerShell, use `$ErrorActionPreference = 'Stop'` and check `$LASTEXITCODE`
  after native commands.
- Check whether `package.json` or `package-lock.json` exists before running npm
  commands in a setup-only state.
- Never use shell commands to delete vault data, truncate event logs, or reset
  Git state unless the human explicitly asks.
- Surface missing environment dependencies, such as Ollama or provider keys, as
  actionable messages rather than silent skips when the feature requires them.
