---
name: security
description: >-
  Team standards for security work. Read before
  coding or reviewing.
---

# Security Skill

Security review in this project is mostly about local file safety, trust
boundaries, provider independence, and preventing data loss.

## Critical Boundaries

- `1_Human_Materials/` is immutable. Reject any write path that can reach it.
- Generated content must start in `_orchestration/workspace/task-*/draft/`.
- Only the orchestrator may commit drafts to final vault paths.
- Human-edit hash mismatches must abort the commit and route to `_needs_review/`.
- App caches and indexes belong under `~/.study-app/cache/<vault-hash>/`.

## Secrets And Providers

- Never commit `.env`, API keys, credentials, local databases, or provider tokens.
- Anthropic and OpenAI keys must stay in the local environment.
- Ollama is local but still not a source of numerical truth.
- Generator and reviewer model providers must differ.

## Data Integrity

- Manifest state writes must be atomic and serialized.
- Orchestration event logs are append-only and must not be truncated.
- Task graphs must reject circular dependencies.
- Parallel tasks must not share write targets unless dependency order makes the
  write safe.

## Review Focus

- Path traversal and symlink behavior around vault writes.
- Unsafe Markdown/HTML rendering in previews.
- Prompt or model output being accepted without deterministic validation.
- Silent fallbacks that hide verification failure, lock failure, or provider
  failure.
