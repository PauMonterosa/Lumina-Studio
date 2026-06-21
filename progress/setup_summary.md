# Setup Summary

Generated: 2026-06-21

## Changes made

- `docs/conventions.md`: replaced generic conventions with Lumina Studio rules for `vault-engine`, `app-shell`, `University_Archive/`, AI verification, commit scopes, and handoffs.
- `docs/architecture.md`: replaced the stub with the local-first architecture, component responsibilities, data flow, trust boundaries, and deployment topology.
- `docs/verification.md`: documented the real verification gate, conditional Node commands, AI verification requirements, Ollama, cloud keys, and MCP expectations.
- `CHECKPOINTS.md`: added project-specific criteria for draft-first vault writes, immutable human materials, external cache state, deterministic numerical checks, provider independence, and orchestration safety.
- `AGENTS.md`: added project-specific repository map rows, updated agent role descriptions, and prepended Lumina Studio hard rules.
- `.agents/skills/*/SKILL.md`: replaced all generic skill stubs with project-specific guidance for frontend, backend, TypeScript, security, accessibility, devops, documentation, and shell safety.
- `.cursor/agents/*.md`: updated existing role prompts to reference the actual project domains, skill expectations, scope boundaries, implementation standards, and review focus.
- `init.sh`: replaced placeholder checks with a five-step gate that validates the harness, conditionally installs Node dependencies, and runs lint/build/test scripts when present.
- `init.ps1`: mirrored the same five-step gate for Windows PowerShell.
- `.cursor/agents/project-setup-adapter.md`: removed after the adapter completed.

## Assumptions

- The TypeScript/Electron application scaffold is not present in this checkout yet, so `init.sh` and `init.ps1` skip npm steps when `package.json` or scripts are absent.
- Specialized reviewer prompt files for `reviewer-frontend`, `reviewer-backend`, and `reviewer-security` were referenced by `AGENTS.md` but were not present under `.cursor/agents/`; only existing role files were adapted.
- The engine entrypoints, exact package scripts, and test runner names should be verified once `vault-engine` and `app-shell` code is added.
- Cloud AI provider checks are documented but not enforced by `init` because provider use is feature-dependent and API key names were not specified.

## Next steps

- Add the initial `vault-engine` and `app-shell` package scaffold with `lint`, `build`, and `test` scripts.
- Decide whether to add dedicated `reviewer-frontend`, `reviewer-backend`, and `reviewer-security` prompt files to match the role map.
- Run `.\init.ps1` after adding package files so the Node checks execute.
- Add the first concrete features to `feature_list.json` with bounded acceptance criteria and non-overlapping write targets.
