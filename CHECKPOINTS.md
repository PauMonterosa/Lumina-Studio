# Checkpoints — Objective "Done" Criteria

Use this list as a **pre-flight checklist** before setting any feature to `done`
in `feature_list.json`.  Every box must be checked or explicitly documented as
N/A for this feature.

---

## Automation

- [ ] `./init.sh` or `.\init.ps1` exits with code **0**.
      This gate validates the schema, runs lint, builds, and executes tests.
      A non-zero exit is a hard blocker — do not proceed.
- [ ] If the change touches AI-generated coursework, deterministic verification
      has run before any LLM judge or manual review.
- [ ] Numerical solver changes include a convergence check; an LLM review is not
      treated as numerical proof.

---

## Scope

- [ ] Changes implement **only** the selected feature or workstream lane.
      Unrelated refactors must be split into a separate pending feature.
- [ ] No temporary debug output committed (stray `console.log`, `println!`,
      `print()`, scratch files, or commented-out dead code).
- [ ] No secrets, credentials, `.env` files, or local database files staged.
- [ ] No generated or programmatic writes target `1_Human_Materials/`.
- [ ] Agents wrote generated vault content to an isolated `_orchestration`
      workspace first; only the orchestrator commits final vault paths.
- [ ] App state such as embeddings, OCR cache, SRS progress, and LanceDB files is
      outside `University_Archive/`.
- [ ] Parallel tasks do not share write targets unless one strictly depends on
      the other.

---

## Quality

- [ ] Tests cover the acceptance criteria for every logic path that changed.
      New tests exist where the feature adds non-trivial behavior.
- [ ] Error paths are explicit and actionable — no silent swallowing of
      exceptions that the user or operator should know about.
- [ ] Security-sensitive surfaces are not weakened: auth flows, secret
      handling, API boundaries, migrations, and cryptographic operations
      are reviewed against `.agents/skills/security/SKILL.md`.
- [ ] `vault-engine` remains the only layer with vault mutation, search indexing,
      AI orchestration, and MCP tool logic.
- [ ] Electron renderer changes stay thin and call engine or IPC boundaries
      rather than duplicating backend behavior.
- [ ] Manifest and orchestration state updates are atomic, serialized, and do not
      truncate append-only logs.
- [ ] Parallel orchestration uses all-settled style failure handling so sibling
      results remain observable.
- [ ] Failed verification and human-edit conflicts route to `_needs_review/` or
      a blocked state instead of silently passing.
- [ ] Generator and reviewer providers are structurally independent.

---

## Handoff

- [ ] `progress/features/<id>/impl.md` exists and accurately describes
      files changed, commands run, and test output.
- [ ] `progress/features/<id>/review.md` exists and records approval
      (or lists all findings as `resolved` / `demoted`).
- [ ] Every active `in_progress` lane is globally unique.
      Verified by `scripts/validate_feature_list.py` (called by `init`).
- [ ] Implementation notes identify any changed vault boundary, model provider,
      cache path, lock path, or verification route.
- [ ] Content-generation handoffs specify whether output language is Catalan and
      whether code/comments are English.

---

## Review-fix loop (when applicable)

- [ ] No `must-fix` finding in `review.md` has status `open`.
- [ ] If demotion occurred, the leader performed §7.4 bookkeeping before
      closing the parent feature.

---

## Communication

- [ ] `progress/history.md` has a one-line entry for this feature.
- [ ] `progress/current.md` is reset to idle (if you were coordinator/solo).
