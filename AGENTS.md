    # AGENTS.md — Navigation map for AI agents

    This file is the **entry point** for every agent working in this repository.
    It is a **map**, not an exhaustive rulebook.  Read only what you need, when
    you need it (progressive disclosure).

    Nearest `AGENTS.md` wins when editing nested folders.

    ---

    ## 1 · Before you start (mandatory)

    1. Run `./init.sh` (or `.\init.ps1` on Windows) and confirm exit code 0.
       If it fails, **stop** and fix the environment before touching application code.
    2. Read `progress/current.md` and scan `progress/features/*/impl.md` for
       active implementer traces.
    3. Open `feature_list.json`.  Claim work by setting a feature to `in_progress`
       and assigning a **unique `lane`** string.  Do **not** edit another lane's feature.

    ---

    ## 2 · Repository map

    | Path | Contents | When to read |
    |------|----------|--------------|
    | `init.sh`, `init.ps1` | Mandatory verification gate: validates schema, runs lint/tests | §1 and §5 |
    | `harness.py` | Harness CLI: `init`, `validate`, `add-feature`, `emit-prompts`, `status` | When operating the harness |
    | `scripts/validate_feature_list.py` | Schema + lane-uniqueness + invariant enforcement | When `init` fails on task state |
    | `feature_list.json` | Task ledger (`pending`/`in_progress`/`done`/`blocked`) | Always, at session start |
    | `progress/current.md` | Live session plan (root leader or solo agent) | Always, at session start |
    | `progress/features/<id>/impl.md` | Implementer report (files, commands, test output) | After implementation |
    | `progress/features/<id>/decomposition.md` | Leader split of an oversized feature | §2d–§2e |
    | `progress/subplan_<lane>.md` | Sub-leader plan for one orchestration lane | §2e |
    | `progress/features/<id>/review.md` | Reviewer findings ledger + attempt history | After review pass |
    | `progress/history.md` | Append-only log of completed features | Historical context |
    | `docs/architecture.md` | What "good work" looks like here | Before implementing |
    | `docs/conventions.md` | Style, naming, structure | Before writing code |
    | `docs/verification.md` | How to verify your changes | Before marking done |
    | `CHECKPOINTS.md` | Objective "done" criteria | For self-review |
    | `.agents/skills/` | Domain skill bundles (`SKILL.md` + helper scripts) | Before coding/reviewing |
    | `.cursor/agents/` | Agent prompt files — see §2b | When orchestrating work |
    | `progress/git_commit_plan.md` | Proposed commits (written by `git-commit` agent) | Before pushing |
| `vault-engine/` | Standalone Node.js backend for vault mutation, AI orchestration, search, MCP | Engine, backend, search, AI, or file-safety work |
| `vault-engine/fs/` | File CRUD, Chokidar watcher, lock manager, human-edit protection | Any vault file mutation or watcher change |
| `vault-engine/ai/` | Provider routing, context loading, skill catalog, multi-agent loops | AI orchestration or model routing work |
| `vault-engine/search/` | LanceDB indexing and local Ollama embedding search | Search/indexing work |
| `app-shell/main/` | Electron main process and IPC bridge to the engine | Desktop shell and IPC work |
| `app-shell/renderer/` | React, CodeMirror, Markdown/LaTeX preview, chat, file tree UI | Frontend work |
| `University_Archive/` | Local vault data store; contains source, generated, work, and orchestration areas | Read for context; mutate only through approved orchestrator flow |
| `University_Archive/1_Human_Materials/` | Immutable human-authored source material | Read-only; never write here |
| `University_Archive/_orchestration/` | Task manifests, workspaces, locks, events, and review routing | Orchestration state and generated draft flow |

    ---

    ## 2b · Agent roles

    | Role | Description |
    |------|-------------|
| `leader` | Plans, decomposes, delegates, integrates vault-engine/app-shell/vault work. Does not write product code. |
| `subleader` | Coordinates a bounded subtree (≤5 children) for large features. Does not write product code. |
| `reviewer` | General review pass: correctness, scope, tests, file-safety invariants, model independence, maintainability, security, and failure modes. |
| `reviewer-frontend` | Focused app-shell renderer review: React behavior, CodeMirror usage, Markdown/LaTeX rendering, accessibility, state management, and UX risks. |
| `reviewer-backend` | Focused vault-engine review: data integrity, lock semantics, MCP/API contracts, provider routing, failure modes, and credential hygiene. |
| `reviewer-security` | Deep review of secrets, vault write boundaries, provider trust boundaries, injection surfaces, and network/data boundary violations. |
| `git-commit` | Post-approval commit planning. Proposes a logical multi-commit split. Does not push unless explicitly asked. |
| `implementer-frontend` | Owns app-shell renderer UI, React, CodeMirror, client state, styling, and accessibility. |
| `implementer-backend` | Owns vault-engine services, file safety, AI routing, search, MCP tools, persistence, and background jobs. |
| `implementer-fullstack` | Owns thin vertical slices spanning app-shell UI and vault-engine behavior in one coordinated lane. |
| `implementer-devops` | Owns local verification gates, scripts, CI, build tooling, and engine run workflow. |
| `implementer-documentation` | Owns docs, READMEs, ADRs, setup guides, verification notes, and user-facing guides. |
| `implementer` | Generalist for small or mixed tasks when no specialist fits. Prefer a specialist when the domain is clear. |

    ---

    ## 2c · Skill bundles

    Each agent reads its skill files **before** writing code or performing review.

    | Role | Skills |
    |------|--------|
    | `leader` | — |
| `subleader` | — |
| `reviewer-frontend` | `.agents/skills/frontend/SKILL.md`, `.agents/skills/accessibility/SKILL.md` |
| `reviewer-backend` | `.agents/skills/backend/SKILL.md`, `.agents/skills/security/SKILL.md` |
| `reviewer-security` | `.agents/skills/security/SKILL.md` |
| `implementer-frontend` | `.agents/skills/frontend/SKILL.md`, `.agents/skills/typescript/SKILL.md`, `.agents/skills/accessibility/SKILL.md` |
| `implementer-backend` | `.agents/skills/backend/SKILL.md`, `.agents/skills/security/SKILL.md` |
| `implementer-fullstack` | `.agents/skills/frontend/SKILL.md`, `.agents/skills/backend/SKILL.md`, `.agents/skills/typescript/SKILL.md` |
| `implementer-devops` | `.agents/skills/devops/SKILL.md`, `.agents/skills/shell-safety/SKILL.md` |
| `implementer-documentation` | `.agents/skills/documentation/SKILL.md` |

    ---

    ## 2d · Decomposing large features

    When a single feature is too large or spans multiple domains, the **leader**:

    1. Writes `progress/features/<id>/decomposition.md` with:
       - Overview and motivation
       - Dependency order (which slices block others)
       - Per-slice acceptance criteria and allowed/forbidden paths
       - Integration checkpoints
    2. Encodes slices in `feature_list.json` as a **`workstreams`** array.
       Each entry **must** include `lane` and `title`.
    3. Dispatches one agent per workstream with a tight prompt including lane,
       specialist, scope, acceptance, forbidden paths, and required skills.
    4. Marks the feature `done` **only** after all slices are integrated and
       `init` is green for the combined change set.

    ---

    ## 2e · Hierarchical orchestration (sub-leaders)

    When the leader's coordination surface would exceed ~5 parallel children:

    1. Spawn `subleader` agents with distinct lanes.
    2. Each sub-leader owns `progress/subplan_<lane>.md`.
    3. Record the orchestration tree in `decomposition.md`.
    4. Prefer at most **4 tiers** from root leader to implementers.
    5. Leaves only code — only implementers ship product changes.

    ---

    ## 3 · Hard rules (non-negotiable)

- **Vault write boundary:** Agents never write generated content directly to
  final vault paths; drafts must go under `_orchestration/workspace/*/draft/`
  and only the orchestrator commits them.
- **Read-only source material:** Never modify `University_Archive/1_Human_Materials/`.
- **External app state:** Embeddings, LanceDB indexes, SRS progress, OCR cache,
  and other app state must live under `~/.study-app/cache/<vault-hash>/`, not
  inside `University_Archive/`.
- **No silent overwrite:** If a human edited a target after an agent acquired a
  lock, abort the commit and route the draft to `_needs_review/`.
- **Reviewer independence:** A model provider must not review its own generated
  output.
- **Numerical truth:** Numerical solver correctness must be verified by a
  deterministic convergence check, not by an LLM judge.
- **Append-only logs:** Do not truncate or rewrite active orchestration event logs.
- **Incremental indexing:** Routine file edits must not trigger a full-vault
  vector rescan.
    - **Independence:** Multiple `in_progress` features only when they are
      independent (no conflicting files, migrations, or shared global state).
    - **One lane per agent:** Each worker has a globally unique `lane`.
      `init` rejects duplicates.
    - **One slice per agent instance:** An implementer owns one lane at a time.
    - **No done without green checks:** Run `./init.sh` and verify the full gate.
    - **Document as you go:** impl.md for feature work; current.md for coordinator.
    - **Review-fix loop is bounded:** ≤5 attempts/finding, ≤10 passes/feature.
    - **Leave the repo clean** before ending the session (see §5).

    ---

    ## 4 · Claiming a task

    1. Open `feature_list.json`.
    2. Filter `status == "pending"`.
    3. Choose the lowest `id` that does not collide with active work.
    4. Set status to `in_progress`, add `"lane": "<unique-id>"`, save.
    5. Write your plan to `progress/features/<id>/impl.md`.

    ---

    ## 5 · Session closure

    Before finishing:
    1. Run `./init.sh` — everything green.
    2. Set completed features to `done`; remove `lane`.
    3. Append a short summary to `progress/history.md`.
    4. If coordinator: reset `progress/current.md` to the idle template.
    5. Remove stray debug output, scratch files, and context-free TODOs.

    ### 5.1 Before pushing
    Invoke `git-commit` to produce `progress/git_commit_plan.md`.
    **You** run `git add / commit / push`; the agent plans only.

    ---

    ## 6 · If you get stuck

    - Re-read the relevant section under `docs/`.
    - If a tool fails unexpectedly, record the blocker in `progress/current.md`
      and stop.  Do not invent opaque workarounds.

    ---

    ## 7 · Review-fix loop and demotion

    State lives on disk in `progress/features/<id>/review.md` and
    `feature_list.json`.  No in-chat counter is authoritative.

    ### 7.1 Caps
    - **Per-finding cap: 5.** A `must-fix` finding may be re-reviewed at most 5
      times while `open`.  On the 5th pass still open → demote.
    - **Feature cap: 10.** The whole loop may run at most 10 passes
      (`review_passes`).  On pass 10, demote all still-open findings.

    Both caps run in parallel; whichever fires first triggers demotion.

    ### 7.2 Findings ledger format
    Header line: `review_passes: <n>`

    | Column | Required | Meaning |
    |--------|----------|---------|
    | `finding_id` | yes | Stable id `F-<n>`, never reused |
    | `severity` | yes | `must-fix` or `nice-to-have` |
    | `status` | yes | `open` / `resolved` / `demoted` |
    | `attempts` | yes | Starts at 1; incremented each pass it stays open |
    | `last_reviewer` | yes | Agent name (e.g. `reviewer-backend`) |
    | `bug_feature_id` | demotion only | Id of the spawned bug row |

    ### 7.3 Loop steps (leader / subleader)
    1. Reviewer returns `changes requested` → leader reads ledger.
    2. Re-dispatch matching implementer with **finding ids only**.
    3. Re-dispatch same reviewer.
    4. Check demotion triggers; if fired, perform §7.4 bookkeeping first.
    5. Loop ends when every finding is `resolved` or `demoted`.

    ### 7.4 Demotion bookkeeping
    Leader performs **one transaction**:
    1. Append one bug row per demoted finding to `feature_list.json`
       (`status: "pending"`, `class: "bug"`, `bug_origin: {...}`).
    2. Mutate the original feature row: `status: "blocked"`, drop `lane`
       and `workstreams`, add `blocked_by: [<bug ids>]`.
    3. Update the ledger: each demoted finding → `status: demoted`, fill
       `bug_feature_id`.  Write `## Final state` when the loop closes.
    4. Run `./init.sh` to confirm schema validity.

    ### 7.5 Hard prohibitions
    - No agent re-opens a demoted finding under a new id.
    - No agent edits historical `## Attempt N` blocks.
    - Demotion bookkeeping belongs to the leader only.

    ---

    ## Feature schema reference

    | Field | Required | Description |
    |-------|----------|-------------|
    | `id` | yes | Unique integer |
    | `title` | yes | Short description |
    | `status` | yes | `pending` / `in_progress` / `done` / `blocked` |
    | `class` | no | `feature` (default) or `bug` |
    | `notes` | no | Free-form context |
    | `lane` | when `in_progress` | Globally unique string |
    | `workstreams` | no | Array of `{lane, title, ...}` for decomposed work |
    | `blocked_by` | when `blocked` | Array of blocking feature ids |
    | `bug_origin` | when `class: "bug"` | `{from_feature, from_review, finding_id, attempts}` |
