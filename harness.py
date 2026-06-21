#!/usr/bin/env python3
"""
harness.py — Disk-First Multi-Agent Bootstrap

Bootstraps, validates, and operates a disk-first multi-agent harness
for Software Engineering projects.

Usage:
  python harness.py init                          # Bootstrap all harness files
  python harness.py setup-project                 # Interactive Q&A → project_context + Cursor agent (multitask)
  python harness.py add-feature "Login flow" --notes "Email/password auth" --class feature
  python harness.py validate                      # Validate feature_list.json schema
  python harness.py emit-prompts                  # Print one lane-prompt per active worker
  python harness.py status                        # Summarize feature progress in terminal
  python harness.py add-agent <name> --desc "..." # Register a new agent role at runtime

Environment / API keys (not used by this script itself):
  OPENAI_API_KEY, ANTHROPIC_API_KEY, CURSOR_API_KEY
  Place these in .env — never commit credentials.

Design principles:
  - feature_list.json is the single source of truth for work state.
  - Every active worker owns one globally unique lane string.
  - Leaders coordinate; implementers code; reviewers approve or demote.
  - Review loops are bounded: ≤5 attempts/finding, ≤10 passes/feature.
  - All heavy handoffs live under progress/, never in chat.
  - Adding a new agent role never requires changes to validation or prompt-emit logic.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import stat
import subprocess
import sys
import textwrap
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

# ---------------------------------------------------------------------------
# Domain configuration — the only section you must edit to adapt this harness
# to a new project or a new agent ecosystem.  Everything else is driven from
# these data structures.
# ---------------------------------------------------------------------------

SKILLS_DIR = ".agents/skills"

# Roles registered at runtime via `add-agent` are persisted here so they
# survive past the process that created them — every subsequent harness.py
# invocation (validate, emit-prompts, status, a future `init --force`) loads
# this file first and merges it into ALL_ROLES.  Without this, a runtime-added
# role would vanish the moment the adding process exited (see add_agent_role).
CUSTOM_ROLES_PATH = ".agents/roles.json"


def skill_md_path(skill_name: str) -> str:
    """Return repo-root-relative path to a skill's SKILL.md."""
    return f"{SKILLS_DIR}/{skill_name}/SKILL.md"


# Each AgentRole entry drives: AGENTS.md role table, skill-section output,
# lane-prompt generation, and specialist-prompt file generation.
@dataclass
class AgentRole:
    name: str
    description: str
    # Relative paths (from project root) to SKILL.md files this role must read.
    skills: list[str] = field(default_factory=list)
    # If True, harness writes a dedicated .cursor/agents/<name>.md file.
    emit_agent_file: bool = True
    # For implementer-like roles: what files/areas they own and avoid.
    owns: str = ""
    avoids: str = ""
    standards: str = ""
    # Which reviewer role should be requested after implementation.
    reviewer: str = "reviewer"
    # Free-form "when to use" text for the agent file header.
    when: str = ""
    # If True this role is a coordinator (leader/subleader) — changes prompt shape.
    is_coordinator: bool = False
    # If True this role performs review — changes prompt shape.
    is_reviewer: bool = False


# ---------------------------------------------------------------------------
# CORE ROLES — orchestrators, reviewers, and utilities.
# Extend this list to add new non-domain-specialist roles.
# ---------------------------------------------------------------------------
CORE_ROLES: list[AgentRole] = [
    AgentRole(
        name="leader",
        description="Plans, decomposes, delegates, integrates. Does not write product code.",
        is_coordinator=True,
    ),
    AgentRole(
        name="subleader",
        description=(
            "Coordinates a bounded subtree (≤5 children) for large features. "
            "Does not write product code."
        ),
        is_coordinator=True,
    ),
    AgentRole(
        name="reviewer",
        description=(
            "General review pass: correctness, scope, tests, maintainability, "
            "security, and failure modes."
        ),
        is_reviewer=True,
    ),
    AgentRole(
        name="reviewer-frontend",
        description=(
            "Focused UI review: behavior, accessibility, state management, "
            "rendering correctness, and UX risks."
        ),
        skills=[skill_md_path("frontend"), skill_md_path("accessibility")],
        is_reviewer=True,
    ),
    AgentRole(
        name="reviewer-backend",
        description=(
            "Focused backend review: data integrity, auth contracts, API "
            "surface, failure modes, and credential hygiene."
        ),
        skills=[skill_md_path("backend"), skill_md_path("security")],
        is_reviewer=True,
    ),
    AgentRole(
        name="reviewer-security",
        description=(
            "Deep security review: secrets exposure, authorization gaps, "
            "injection surfaces, and network/data boundary violations."
        ),
        skills=[skill_md_path("security")],
        is_reviewer=True,
    ),
    AgentRole(
        name="git-commit",
        description=(
            "Post-approval commit planning. Proposes a logical multi-commit "
            "split. Does not push unless explicitly asked."
        ),
        emit_agent_file=True,
    ),
]

# ---------------------------------------------------------------------------
# SPECIALIST IMPLEMENTER ROLES — one per domain.
# Add a new AgentRole here to introduce a new specialist without touching
# validation, prompt-emit, or AGENTS.md rendering code.
# ---------------------------------------------------------------------------
SPECIALIST_ROLES: list[AgentRole] = [
    AgentRole(
        name="implementer-frontend",
        description="Owns UI, React/Vue/Svelte, client state, styling, accessibility.",
        skills=[
            skill_md_path("frontend"),
            skill_md_path("typescript"),
            skill_md_path("accessibility"),
        ],
        owns=(
            "UI files — `src/**`, components, stylesheets, client state modules, "
            "and browser-facing utilities."
        ),
        avoids=(
            "Database schema, server-side auth, deployment scripts, and unrelated "
            "documentation unless the lane explicitly includes them."
        ),
        standards=(
            "Match neighboring UI patterns. Preserve keyboard/focus behavior. "
            "Verify affected views render correctly and pass accessibility checks."
        ),
        reviewer="reviewer-frontend",
        when=(
            "HTML structure, layout, navigation, modals, forms, CSS/responsive design, "
            "client-side state, event handlers, and accessibility."
        ),
    ),
    AgentRole(
        name="implementer-backend",
        description="Owns services, APIs, persistence, migrations, auth, background jobs.",
        skills=[skill_md_path("backend"), skill_md_path("security")],
        owns=(
            "Storage layers, service modules, API endpoints, database migrations, "
            "and data-integrity rules."
        ),
        avoids=(
            "Visual redesigns, CSS-only work, and CI/deploy changes unless "
            "explicitly in lane scope."
        ),
        standards=(
            "Keep API contracts stable unless the feature explicitly changes them. "
            "Validate at every boundary. Never commit secrets or credentials."
        ),
        reviewer="reviewer-backend",
        when=(
            "Database access, schemas, seed data, auth, validation, business rules, "
            "API endpoints, and third-party integrations."
        ),
    ),
    AgentRole(
        name="implementer-fullstack",
        description="Owns thin vertical slices spanning UI and backend in one coordinated lane.",
        skills=[
            skill_md_path("frontend"),
            skill_md_path("backend"),
            skill_md_path("typescript"),
        ],
        owns="End-to-end feature wiring from user action to persisted, returned outcome.",
        avoids="Large unrelated refactors and broad documentation projects.",
        standards=(
            "Implement the backend contract first, then wire the UI. "
            "Keep the slice shippable at every commit."
        ),
        reviewer="reviewer",
        when=(
            "Thin vertical slices that need coordinated UI and backend changes "
            "in a single lane without a decomposition step."
        ),
    ),
    AgentRole(
        name="implementer-devops",
        description="Owns CI, deployment, scripts, observability, and build tooling.",
        skills=[skill_md_path("devops"), skill_md_path("shell-safety")],
        owns=(
            "`init.sh`, `init.ps1`, harness scripts, `scripts/**`, CI/workflow "
            "files, and observability configuration."
        ),
        avoids="Product UI, business logic, and large documentation rewrites.",
        standards=(
            "Prefer simple, portable scripts. Never weaken verification gates. "
            "Quote all shell variables; use `set -euo pipefail`."
        ),
        reviewer="reviewer",
        when=(
            "Local dev servers, build scripts, CI checks, lint gates, test "
            "runners, and deployment workflow."
        ),
    ),
    AgentRole(
        name="implementer-documentation",
        description="Owns docs, READMEs, ADRs, migration notes, and user-facing guides.",
        skills=[skill_md_path("documentation")],
        owns="`docs/**`, progress artifacts, conventions, and verification docs.",
        avoids="Product code and CI/deploy logic unless explicitly in scope.",
        standards=(
            "Write exact commands and paths so the next operator can follow without "
            "guessing. Remove stale instructions immediately."
        ),
        reviewer="reviewer",
        when=(
            "READMEs, setup guides, migration notes, architectural decision records "
            "(ADRs), runbooks, and handoff documents."
        ),
    ),
    AgentRole(
        name="implementer",
        description=(
            "Generalist for small or mixed tasks when no specialist fits. "
            "Prefer a specialist when the domain is clear."
        ),
        skills=[],  # Populated dynamically from the smallest relevant bundle
        owns="Assigned lane scope only.",
        avoids="Any file or module outside the lane scope.",
        standards=(
            "Read AGENTS.md, docs/conventions.md, and CHECKPOINTS.md before starting. "
            "Prefer specialists for single-domain work."
        ),
        reviewer="reviewer",
        when=(
            "Small or mixed tasks that touch many layers lightly and do not "
            "cleanly fit any single specialist role."
        ),
    ),
]

# Flat lookup: name → AgentRole
ALL_ROLES: dict[str, AgentRole] = {
    r.name: r for r in CORE_ROLES + SPECIALIST_ROLES
}

ALLOWED_STATUS: frozenset[str] = frozenset({"pending", "in_progress", "done", "blocked"})
ALLOWED_CLASS: frozenset[str] = frozenset({"feature", "bug"})

# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def _dedent(text: str) -> str:
    """Strip leading blank line + consistent indentation from triple-quoted strings."""
    return textwrap.dedent(text).lstrip("\n")


def write_file(path: Path, content: str, *, executable: bool = False, overwrite: bool = False) -> None:
    """Write *content* to *path* creating parent directories as needed.

    By default the file is only written when it does not already exist, which
    lets ``init`` be run repeatedly without clobbering local edits.  Pass
    ``overwrite=True`` when you explicitly want to regenerate a file.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not overwrite:
        return
    path.write_text(content, encoding="utf-8")
    if executable:
        mode = path.stat().st_mode
        path.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def read_json(path: Path) -> dict[str, Any]:
    """Return parsed JSON from *path*, or a blank ledger skeleton when absent."""
    if not path.exists():
        return {"version": 1, "features": []}
    raw = path.read_text(encoding="utf-8")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"error: {path} is not valid JSON — {exc}") from exc
    if not isinstance(data, dict):
        raise SystemExit(f"error: {path} must be a JSON object, got {type(data).__name__}")
    return data


def write_json(path: Path, data: dict[str, Any]) -> None:
    """Atomically write *data* as pretty-printed JSON to *path*."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


# ---------------------------------------------------------------------------
# Concurrency — feature_list.json is read-modify-written by many independent
# `harness.py` invocations (one per parallel agent lane).  Without a lock,
# two agents claiming work at the same moment can race: both read the same
# "pending" snapshot, both write back a full file, and the second write
# silently clobbers the first agent's claim (lost work, duplicate lanes that
# only `validate` catches *after* the damage, or a corrupted ledger if writes
# interleave at the OS level). FileLock + locked_ledger() turn every harness
# mutation into a single atomic transaction so that can't happen.
# ---------------------------------------------------------------------------

class FileLock:
    """Dependency-free, cross-platform exclusive lock backed by a lock file.

    Uses ``os.O_CREAT | os.O_EXCL`` for atomic lock-file creation — this is
    atomic on POSIX and Windows alike, so no third-party `filelock` package
    is required. A lock file older than *stale_after* seconds is assumed to
    belong to a crashed process and is reclaimed automatically, so a killed
    agent can never wedge the ledger for everyone else.
    """

    def __init__(
        self,
        target: Path,
        *,
        timeout: float = 10.0,
        poll: float = 0.05,
        stale_after: float = 30.0,
    ) -> None:
        self.lock_path = target.with_name(target.name + ".lock")
        self.timeout = timeout
        self.poll = poll
        self.stale_after = stale_after

    def __enter__(self) -> "FileLock":
        deadline = time.monotonic() + self.timeout
        while True:
            try:
                fd = os.open(str(self.lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(fd, f"{os.getpid()} {time.time()}\n".encode())
                os.close(fd)
                return self
            except FileExistsError:
                if self._reclaim_if_stale():
                    continue
                if time.monotonic() >= deadline:
                    raise SystemExit(
                        f"error: timed out waiting for {self.lock_path.name} "
                        f"— another harness command is mid-write on this ledger. "
                        f"Retry shortly. If no harness process is actually running, "
                        f"delete {self.lock_path} and try again."
                    )
                time.sleep(self.poll)

    def _reclaim_if_stale(self) -> bool:
        try:
            age = time.time() - self.lock_path.stat().st_mtime
        except OSError:
            return False
        if age <= self.stale_after:
            return False
        try:
            self.lock_path.unlink()
        except OSError:
            return False
        return True

    def __exit__(self, *exc_info: Any) -> None:
        try:
            self.lock_path.unlink()
        except OSError:
            pass


@contextlib.contextmanager
def locked_ledger(root: Path) -> Iterator[dict[str, Any]]:
    """Hold an exclusive lock across one read-modify-write transaction on
    feature_list.json. Yields the parsed ledger for the caller to mutate in
    place; on clean exit the result is written back atomically, all under
    the same lock — so no other harness process can interleave a write.
    On exception, nothing is written and the lock is released.
    """
    path = root / "feature_list.json"
    with FileLock(path):
        data = read_json(path)
        yield data
        write_json(path, data)


def _collect_all_lanes(features: list[dict[str, Any]]) -> list[str]:
    """Return every currently-active lane string across all features and
    their workstreams.  A workstream only counts as active when its own
    `status` is `in_progress` — a `done` workstream inside an otherwise
    still-active parent feature must not block its lane being reused or
    show up as a phantom active lane in `status`/`emit-prompts`.
    """
    lanes: list[str] = []
    for row in features:
        if row.get("status") == "in_progress":
            lane = row.get("lane")
            if isinstance(lane, str) and lane.strip():
                lanes.append(lane.strip())
            for ws in row.get("workstreams") or []:
                if isinstance(ws, dict) and ws.get("status", "pending") == "in_progress":
                    wlane = ws.get("lane")
                    if isinstance(wlane, str) and wlane.strip():
                        lanes.append(wlane.strip())
    return lanes


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def _validate_feature_list_errors(
    root: Path,
) -> tuple[list[str], list[dict[str, Any]], list[str]]:
    """Core schema/invariant check. Returns (errors, features, active_lanes)
    instead of raising or printing, so callers that need the ledger to be
    valid before doing something else (emit-prompts, status, claim, complete,
    demote) can fail with one clean, specific error instead of a Python
    traceback or — worse — silently acting on a malformed ledger.
    """
    path = root / "feature_list.json"
    if not path.exists():
        return (
            ["missing feature_list.json — run `python harness.py init` first"],
            [],
            [],
        )

    data = read_json(path)
    features = data.get("features")
    if not isinstance(features, list):
        return (["feature_list.json must contain a top-level 'features' array"], [], [])

    seen_ids: set[int] = set()
    all_lanes: list[str] = []
    errors: list[str] = []

    for i, row in enumerate(features):
        if not isinstance(row, dict):
            errors.append(f"features[{i}] must be an object")
            continue

        # ── Required fields ──────────────────────────────────────────────
        for key in ("id", "title", "status"):
            if key not in row:
                errors.append(f"features[{i}] missing required field {key!r}")

        fid = row.get("id")
        if not isinstance(fid, int):
            errors.append(f"features[{i}].id must be an integer, got {type(fid).__name__}")
            continue  # Cannot proceed without a valid id
        if fid in seen_ids:
            errors.append(f"duplicate feature id {fid}")
        else:
            seen_ids.add(fid)

        title = row.get("title", "")
        if not isinstance(title, str) or not title.strip():
            errors.append(f"feature {fid}.title must be a non-empty string")

        status = row.get("status")
        if status not in ALLOWED_STATUS:
            errors.append(
                f"feature {fid}.status must be one of {sorted(ALLOWED_STATUS)}, got {status!r}"
            )

        klass = row.get("class", "feature")
        if klass not in ALLOWED_CLASS:
            errors.append(
                f"feature {fid}.class must be one of {sorted(ALLOWED_CLASS)}, got {klass!r}"
            )

        # ── in_progress: lane + workstreams ──────────────────────────────
        if status == "in_progress":
            lane = row.get("lane")
            workstreams = row.get("workstreams")
            has_workstreams = isinstance(workstreams, list) and len(workstreams) > 0

            # A row's own `lane` is mandatory for a flat (non-decomposed) lane,
            # but optional when the feature is fully delegated to workstreams —
            # the leader coordinates those, it doesn't hold a lane of its own.
            # It's still validated *if present*, since a leader may also be
            # implementing a residual slice directly alongside its children.
            if lane is not None or not has_workstreams:
                if not isinstance(lane, str) or not lane.strip():
                    errors.append(
                        f"feature {fid} is in_progress but has no valid non-empty "
                        f"'lane' string (required unless fully delegated to "
                        f"'workstreams')"
                    )
                else:
                    all_lanes.append(lane.strip())

            if workstreams is not None:
                if not isinstance(workstreams, list):
                    errors.append(f"feature {fid}.workstreams must be an array")
                else:
                    for j, ws in enumerate(workstreams):
                        if not isinstance(ws, dict):
                            errors.append(f"feature {fid}.workstreams[{j}] must be an object")
                            continue
                        wtitle = ws.get("title")
                        if not isinstance(wtitle, str) or not wtitle.strip():
                            errors.append(
                                f"feature {fid}.workstreams[{j}] needs a non-empty 'title'"
                            )

                        wstatus = ws.get("status", "pending")
                        if wstatus not in ALLOWED_STATUS:
                            errors.append(
                                f"feature {fid}.workstreams[{j}].status must be one "
                                f"of {sorted(ALLOWED_STATUS)}, got {wstatus!r}"
                            )

                        wlane = ws.get("lane")
                        if wstatus == "in_progress":
                            if not isinstance(wlane, str) or not wlane.strip():
                                errors.append(
                                    f"feature {fid}.workstreams[{j}] is in_progress "
                                    f"but has no valid non-empty 'lane'"
                                )
                            else:
                                all_lanes.append(wlane.strip())
                        elif wlane:
                            errors.append(
                                f"feature {fid}.workstreams[{j}] has status "
                                f"{wstatus!r} but still carries a 'lane' "
                                f"({wlane!r}) — drop it (e.g. via `harness.py "
                                f"complete {fid} --workstream {wlane}`)"
                            )

                        specialist = ws.get("specialist")
                        if specialist is not None and specialist not in ALL_ROLES:
                            errors.append(
                                f"feature {fid}.workstreams[{j}].specialist {specialist!r} "
                                f"is not a known role — known roles: {sorted(ALL_ROLES)}"
                            )

        # ── blocked: blocked_by ──────────────────────────────────────────
        if status == "blocked":
            blocked_by = row.get("blocked_by")
            if not isinstance(blocked_by, list) or not blocked_by:
                errors.append(
                    f"feature {fid} is blocked but blocked_by is missing or empty"
                )
            else:
                for bid in blocked_by:
                    if not isinstance(bid, int):
                        errors.append(
                            f"feature {fid}.blocked_by entries must be integers, got {bid!r}"
                        )

        # ── bug_origin ────────────────────────────────────────────────────
        if klass == "bug" and "bug_origin" in row:
            origin = row["bug_origin"]
            if not isinstance(origin, dict):
                errors.append(f"feature {fid}.bug_origin must be an object")
            else:
                from_feature = origin.get("from_feature")
                finding_id = origin.get("finding_id", "")
                attempts = origin.get("attempts")
                if not isinstance(from_feature, int):
                    errors.append(
                        f"feature {fid}.bug_origin.from_feature must be an integer"
                    )
                if not isinstance(finding_id, str) or not finding_id.startswith("F-"):
                    errors.append(
                        f"feature {fid}.bug_origin.finding_id must be a string like 'F-<n>'"
                    )
                if not isinstance(attempts, int) or attempts < 1:
                    errors.append(
                        f"feature {fid}.bug_origin.attempts must be a positive integer"
                    )

    # ── Global lane uniqueness ────────────────────────────────────────────
    if len(all_lanes) != len(set(all_lanes)):
        from collections import Counter
        dupes = sorted(lane for lane, count in Counter(all_lanes).items() if count > 1)
        errors.append(f"duplicate lane(s) detected: {dupes}")

    # ── Cross-reference: blocked_by and bug_origin.from_feature ─────────
    for row in features:
        fid = row.get("id")
        if fid is None:
            continue
        if row.get("status") == "blocked":
            for bid in row.get("blocked_by") or []:
                if isinstance(bid, int) and bid not in seen_ids:
                    errors.append(
                        f"feature {fid}.blocked_by references unknown id {bid}"
                    )
                if isinstance(bid, int) and bid == fid:
                    errors.append(f"feature {fid} cannot block itself")
        if row.get("class") == "bug":
            origin = row.get("bug_origin") or {}
            from_feature = origin.get("from_feature")
            if isinstance(from_feature, int) and from_feature not in seen_ids:
                errors.append(
                    f"bug feature {fid}.bug_origin.from_feature {from_feature} "
                    f"references unknown id"
                )

    return errors, features, all_lanes


def validate_feature_list(root: Path) -> None:
    """Validate feature_list.json schema and invariants.  Raises SystemExit on failure."""
    errors, features, all_lanes = _validate_feature_list_errors(root)
    if errors:
        formatted = "\n".join(f"  • {e}" for e in errors)
        raise SystemExit(f"error: feature_list.json validation failed:\n{formatted}")
    print(f"ok: feature_list.json — {len(features)} feature(s), {len(all_lanes)} active lane(s)")


def _require_valid_ledger(root: Path) -> list[dict[str, Any]]:
    """Like validate_feature_list, but silent on success — for internal use
    by commands that need a guaranteed-valid ledger before acting (so a
    malformed file fails with one clear message, not a stack trace).
    """
    errors, features, _all_lanes = _validate_feature_list_errors(root)
    if errors:
        formatted = "\n".join(f"  • {e}" for e in errors)
        raise SystemExit(f"error: feature_list.json is invalid, refusing to proceed:\n{formatted}")
    return features


# ---------------------------------------------------------------------------
# Feature management
#
# Every mutation below goes through locked_ledger(), so two `harness.py`
# invocations racing on the same feature_list.json (e.g. two parallel agent
# lanes both claiming work at once) serialize cleanly instead of corrupting
# state. Preconditions (must be pending, lane must be free, ids must exist)
# are checked *inside* the lock, against the freshest data — not against a
# snapshot an agent read a few seconds earlier in chat.
# ---------------------------------------------------------------------------

def _next_feature_id(data: dict[str, Any]) -> int:
    ids = [r["id"] for r in data.get("features", []) if isinstance(r.get("id"), int)]
    return max(ids, default=0) + 1


def _find_feature(data: dict[str, Any], fid: int) -> dict[str, Any] | None:
    for row in data.get("features", []):
        if isinstance(row, dict) and row.get("id") == fid:
            return row
    return None


def _find_workstream(row: dict[str, Any], ws_lane: str) -> dict[str, Any] | None:
    for ws in row.get("workstreams") or []:
        if isinstance(ws, dict) and ws.get("lane") == ws_lane:
            return ws
    return None


def add_feature(
    root: Path,
    title: str,
    notes: str,
    klass: str = "feature",
) -> int:
    """Append a new pending feature row and immediately validate the ledger."""
    if not title.strip():
        raise SystemExit("error: feature title must not be empty")
    if klass not in ALLOWED_CLASS:
        raise SystemExit(f"error: --class must be one of {sorted(ALLOWED_CLASS)}")

    with locked_ledger(root) as data:
        data.setdefault("version", 1)
        data.setdefault("features", [])
        new_id = _next_feature_id(data)
        data["features"].append(
            {
                "id": new_id,
                "title": title.strip(),
                "status": "pending",
                "class": klass,
                "notes": notes.strip(),
            }
        )
    validate_feature_list(root)
    print(f"added: feature {new_id} — {title!r}")
    return new_id


def claim_lane(root: Path, fid: int, lane: str, workstream: str | None = None) -> None:
    """Atomically claim a feature or a declared workstream for a lane.

    This is the tool-mediated replacement for "edit feature_list.json by
    hand": the precondition checks (target exists, is `pending`, lane is
    globally unique) run inside the same lock as the write, so two agents
    racing to claim work get one clean winner and one clear, actionable
    error — never a silently dropped claim or a duplicate lane that only
    surfaces later in `validate`.
    """
    lane = lane.strip()
    if not lane:
        raise SystemExit("error: --lane must not be empty")

    with locked_ledger(root) as data:
        row = _find_feature(data, fid)
        if row is None:
            raise SystemExit(f"error: no feature with id {fid}")

        existing_lanes = set(_collect_all_lanes(data.get("features", [])))
        if lane in existing_lanes:
            raise SystemExit(
                f"error: lane {lane!r} is already in use — choose a different lane"
            )

        if workstream:
            target = _find_workstream(row, workstream)
            if target is None:
                raise SystemExit(
                    f"error: feature {fid} has no workstream with lane {workstream!r}. "
                    f"Workstreams must already be declared in feature_list.json "
                    f"(by a leader's decomposition) before they can be claimed."
                )
            wstatus = target.get("status", "pending")
            if wstatus != "pending":
                raise SystemExit(
                    f"error: workstream {workstream!r} on feature {fid} is "
                    f"{wstatus!r}, not 'pending' — cannot claim"
                )
            target["status"] = "in_progress"
            target["lane"] = lane
            if row.get("status") == "pending":
                row["status"] = "in_progress"
        else:
            if row.get("status") != "pending":
                raise SystemExit(
                    f"error: feature {fid} is {row.get('status')!r}, not 'pending' "
                    f"— cannot claim"
                )
            row["status"] = "in_progress"
            row["lane"] = lane

    suffix = f" workstream {workstream!r}" if workstream else ""
    print(f"claimed: feature {fid}{suffix} -> lane {lane!r}")


def complete_lane(root: Path, fid: int, workstream: str | None = None) -> None:
    """Atomically mark a feature or workstream done and drop its lane.

    When every workstream under a feature is done, the parent feature is
    auto-completed too — closing a real gap in the original design, where
    workstreams had no individual status at all and a leader had no
    tool-supported way to track partial completion of a decomposed feature.
    """
    with locked_ledger(root) as data:
        row = _find_feature(data, fid)
        if row is None:
            raise SystemExit(f"error: no feature with id {fid}")

        if workstream:
            target = _find_workstream(row, workstream)
            if target is None:
                raise SystemExit(
                    f"error: feature {fid} has no workstream with lane {workstream!r}"
                )
            target["status"] = "done"
            target.pop("lane", None)
            siblings = [ws for ws in (row.get("workstreams") or []) if isinstance(ws, dict)]
            if siblings and all(ws.get("status") == "done" for ws in siblings):
                row["status"] = "done"
                row.pop("lane", None)
        else:
            row["status"] = "done"
            row.pop("lane", None)

    suffix = f" workstream {workstream!r}" if workstream else ""
    print(f"done: feature {fid}{suffix}")


def block_feature(root: Path, fid: int, blocked_by: list[int]) -> None:
    """Atomically mark a feature blocked with the given blocker ids."""
    if not blocked_by:
        raise SystemExit("error: --blocked-by requires at least one feature id")

    with locked_ledger(root) as data:
        row = _find_feature(data, fid)
        if row is None:
            raise SystemExit(f"error: no feature with id {fid}")
        known_ids = {r.get("id") for r in data.get("features", []) if isinstance(r, dict)}
        unknown = [b for b in blocked_by if b not in known_ids]
        if unknown:
            raise SystemExit(f"error: blocked_by references unknown id(s): {unknown}")
        if fid in blocked_by:
            raise SystemExit(f"error: feature {fid} cannot block itself")
        row["status"] = "blocked"
        row.pop("lane", None)
        row.pop("workstreams", None)
        row["blocked_by"] = sorted(set(blocked_by))

    print(f"blocked: feature {fid} -> blocked_by={sorted(set(blocked_by))}")


def demote_finding(
    root: Path,
    fid: int,
    finding_id: str,
    attempts: int,
    title: str | None,
    notes: str,
) -> int:
    """Perform AGENTS.md §7.4 demotion bookkeeping as **one** atomic
    transaction: append a bug row referencing the finding, and flip the
    parent feature to `blocked` (accumulating blocked_by if called more than
    once for the same feature). The original design left this as a two-step
    manual edit a leader-agent had to choreograph by hand across two related
    objects in the same file with no atomicity guarantee — exactly the kind
    of compound mutation that should be a single tool call instead of prose.
    """
    finding_id = finding_id.strip()
    if not finding_id.startswith("F-"):
        raise SystemExit("error: --finding must look like 'F-<n>' (e.g. F-3)")
    if attempts < 1:
        raise SystemExit("error: --attempts must be a positive integer")

    with locked_ledger(root) as data:
        row = _find_feature(data, fid)
        if row is None:
            raise SystemExit(f"error: no feature with id {fid}")

        new_id = _next_feature_id(data)
        bug_title = (title or f"Fix {finding_id} from feature {fid} review").strip()
        data["features"].append(
            {
                "id": new_id,
                "title": bug_title,
                "status": "pending",
                "class": "bug",
                "notes": notes.strip(),
                "bug_origin": {
                    "from_feature": fid,
                    "finding_id": finding_id,
                    "attempts": attempts,
                },
            }
        )

        prior_blocked_by = row.get("blocked_by") if row.get("status") == "blocked" else []
        if not isinstance(prior_blocked_by, list):
            prior_blocked_by = []
        row["status"] = "blocked"
        row.pop("lane", None)
        row.pop("workstreams", None)
        row["blocked_by"] = sorted(set(prior_blocked_by) | {new_id})

    validate_feature_list(root)
    print(
        f"demoted: {finding_id} on feature {fid} -> bug feature {new_id}; "
        f"feature {fid} is now blocked"
    )
    return new_id


# ---------------------------------------------------------------------------
# Custom agent roles — persistence
#
# `add-agent` used to mutate the in-memory ALL_ROLES dict only, then print
# "restart harness to emit agent file" even though the file was already
# written before exit — and on the *next* process, the role was gone, so
# `validate`, `emit-prompts`, and AGENTS.md regeneration silently forgot it
# existed. Custom roles now persist to CUSTOM_ROLES_PATH and are merged back
# into ALL_ROLES at the start of every command.
# ---------------------------------------------------------------------------

def _load_custom_roles(root: Path) -> None:
    """Merge previously-registered custom roles into ALL_ROLES / SPECIALIST_ROLES."""
    path = root / CUSTOM_ROLES_PATH
    if not path.exists():
        return
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return
    for entry in raw.get("roles", []):
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        if not isinstance(name, str) or not name or name in ALL_ROLES:
            continue
        role = AgentRole(
            name=name,
            description=entry.get("description", ""),
            skills=[s for s in entry.get("skills", []) if isinstance(s, str)],
        )
        ALL_ROLES[name] = role
        SPECIALIST_ROLES.append(role)


def _save_custom_role(root: Path, role: AgentRole) -> None:
    """Persist *role* to CUSTOM_ROLES_PATH so future processes see it too."""
    path = root / CUSTOM_ROLES_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    data: dict[str, Any] = {"roles": []}
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            data = {"roles": []}
    roles = [r for r in data.get("roles", []) if r.get("name") != role.name]
    roles.append({"name": role.name, "description": role.description, "skills": role.skills})
    data["roles"] = roles
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def add_agent_role(name: str, description: str, skills: list[str]) -> AgentRole:
    """Register a new agent role in ALL_ROLES at runtime (used by cmd_add_agent)."""
    if name in ALL_ROLES:
        raise SystemExit(f"error: role {name!r} already exists")
    role = AgentRole(name=name, description=description, skills=skills)
    ALL_ROLES[name] = role
    SPECIALIST_ROLES.append(role)
    return role


# ---------------------------------------------------------------------------
# Skill section rendering
# ---------------------------------------------------------------------------

def _skill_section(role_name: str) -> str:
    role = ALL_ROLES.get(role_name)
    bundle = role.skills if role else []
    if not bundle:
        return (
            "### Required Skills\n\n"
            "No fixed skill bundle for this role. Read the docs relevant to your slice.\n"
        )
    lines = "\n".join(f"- `{p}`" for p in bundle)
    return f"### Required Skills\n\nRead these **before** any substantive work:\n\n{lines}\n"


def _delegation_skills_table() -> str:
    """Markdown table rows mapping delegatees to their typical skill paths."""
    delegatees = [
        "implementer-frontend",
        "implementer-backend",
        "implementer-fullstack",
        "implementer-devops",
        "reviewer-frontend",
        "reviewer-backend",
    ]
    rows: list[str] = []
    for name in delegatees:
        role = ALL_ROLES[name]
        if name == "implementer-fullstack":
            skills_col = "All of the above"
        else:
            skills_col = ", ".join(f"`{s}`" for s in role.skills)
        rows.append(f"    | `{name}` | {skills_col} |")
    return "\n".join(rows)


def _write_skill_stubs(root: Path, skill_paths: set[str]) -> None:
    """Create `.agents/skills/<name>/SKILL.md` and `check.py` for each skill."""
    seen: set[str] = set()
    for skill_path in sorted(skill_paths):
        slug = Path(skill_path).parent.name
        if slug in seen:
            continue
        seen.add(slug)
        skill_dir = root / SKILLS_DIR / slug
        display = slug.replace("-", " ").title()
        write_file(
            skill_dir / "SKILL.md",
            _dedent(f"""
            ---
            name: {slug}
            description: >-
              Team standards for {slug.replace("-", " ")} work. Read before
              coding or reviewing.
            ---

            # {display} Skill

            **Replace this stub** with your team's concrete standards for {slug}.

            Agents must read relevant skill files before coding or reviewing.

            Suggested sections:
            - Preferred libraries/frameworks and versions
            - Naming and file-structure conventions
            - Key do's and don'ts
            - Security considerations
            - Example patterns (correct vs incorrect)
            """),
        )
        write_file(
            skill_dir / "check.py",
            _dedent(f"""
            #!/usr/bin/env python3
            \"\"\"Optional helper for the {slug} skill.

            Replace or extend with domain-specific checks or utilities.
            \"\"\"
            """),
            executable=True,
        )


# ---------------------------------------------------------------------------
# Prompt generation — each function returns a clean Markdown string.
# ---------------------------------------------------------------------------

def _leader_prompt() -> str:
    return _dedent(f"""
    ---
    name: leader
    description: >-
      Orchestration lead. Breaks goals into sequenced work (decomposition,
      workstreams, optional sub-leader tiers per AGENTS.md §2e), assigns bounded
      tasks to sub-leaders, implementers, and reviewers. Canonical state lives in
      repo files (progress/, docs/). Does not implement application code.
    tools: Read, Write, Edit, Glob, Grep, Bash
    ---

    # Leader Agent

    You coordinate work **without playing telephone**.

    Write plans and acceptance criteria to disk (`progress/current.md`) so
    downstream agents read the primary source.  In chat, prefer pointers such as
    "see `progress/current.md` — Plan" rather than repeating long text.

    You **do not** implement application code.

    ---

    ## Core Responsibilities

    ### 1 · Read state before acting
    1. Read `AGENTS.md`, `feature_list.json`, `progress/current.md`, and every
       active `progress/features/<id>/impl.md`.
    2. Identify `in_progress` rows — each **must** have a distinct, non-empty `lane`.
    3. Identify blockers and check demotion triggers (§7 caps) before dispatching new work.

    ### 2 · Plan and write to disk
    Produce a short **ordered plan** with explicit done-criteria in
    `progress/current.md`.  For parallel lanes, list them under **Parallel Lanes**
    with non-overlapping file scopes and link to decomposition docs when used.

    ### 3 · Decompose large features
    When a feature is too large, ambiguous, or spans multiple domains:

    1. Split into bounded vertical slices with explicit acceptance criteria.
    2. Write `progress/features/<id>/decomposition.md` (overview, dependency order,
       allowed/forbidden paths per slice, integration checkpoints).
    3. Encode slices as a **`workstreams`** array in the feature row — each entry
       **must** include `lane` and `title`; add `specialist`, `scope`, `acceptance`,
       and `notes` when they reduce ambiguity.
    4. Ensure **every** `lane` (row `lane` + each `workstreams[].lane`) is globally
       unique — `init` enforces this.
    5. Dispatch one agent per workstream with a tight prompt (lane, specialist, scope,
       acceptance, forbidden paths, pointer to decomposition doc, required skills).

    ### 4 · Parallel dispatch (mandatory when ≥2 lanes are active)
    When two or more worker lanes can proceed:
    - Delegate **all of them in one turn** using parallel subagent tooling.
    - Do **not** serialize unrelated lanes in chat prose unless tooling is unavailable.
    - When tooling is unavailable, point to `python scripts/emit_parallel_lane_prompts.py`.
    - Every delegation **must** include a `### Required skills (read first)` block.

    ### 5 · Delegate by role
    Match each workstream to the right specialist:

    | Role | Domain |
    |------|--------|
    | `subleader` | Bounded subtree when you would coordinate >5 children |
    | `implementer-frontend` | `src/` UI, React/TS, client state |
    | `implementer-backend` | Services, APIs, DB, auth, migrations |
    | `implementer-fullstack` | Thin end-to-end vertical slice |
    | `implementer-devops` | CI, scripts, build tooling |
    | `implementer-documentation` | Docs, READMEs, ADRs |
    | `implementer` | Small/mixed work when no specialist fits |

    Ask implementers to write `progress/features/<id>/impl.md` and return paths only.

    ### 6 · Review and fix loop (bounded — AGENTS.md §7)
    After implementation, dispatch the appropriate reviewer.  When `changes requested`
    is returned:

    1. Read `progress/features/<id>/review.md`.  Confirm `review_passes` incremented
       and `attempts` bumped for still-open findings.
    2. Re-dispatch the **matching specialist implementer** with **finding ids only**
       (e.g. *"address F-1, F-3 per progress/features/<id>/review.md Attempt 3"*).
       Do **not** restate finding bodies in chat — the implementer reads the ledger.
    3. Re-dispatch the **same reviewer**.
    4. **Demotion triggers** (check mechanically after every reviewer turn):
       - Per-finding: `must-fix` with `status: open` and `attempts == 5`.
       - Per-feature: `review_passes == 10` (demote **all** still-open findings).
    5. On demotion: append bug rows to `feature_list.json`, mutate the parent row
       to `blocked` with `blocked_by`, update the ledger — then run `./init.sh`.

    ### 7 · Commit planning
    When implementation is complete and `init` is green, delegate `git-commit`
    to produce `progress/git_commit_plan.md`.

    ---

    ## Skills with every delegation

    Each delegation prompt **must** end with a `### Required skills (read first)`
    section listing repo-root-relative paths to `SKILL.md` files.

    | Delegatee | Typical skills |
    |-----------|----------------|
{_delegation_skills_table()}

    ---

    ## Hard Rules
    - Disk-first handoffs. Heavy detail belongs in `progress/`, not in chat.
    - Parallel lanes must have non-overlapping file scopes.
    - Never mark a feature `done` until verification is green and review approves.
    - Never spin an unbounded review loop — demote at the caps.

    ## Reply format
    Short pointer to on-disk artifacts. Do not paste full plans or diffs when
    `progress/current.md` already holds them.
    """)


def _subleader_prompt() -> str:
    return _dedent("""
    ---
    name: subleader
    description: >-
      Coordinates a bounded subtree (≤5 parallel children) under one parent
      feature. Does not write product code.
    tools: Read, Write, Edit, Glob, Grep, Bash
    ---

    # Subleader Agent

    You coordinate a **bounded subtree** assigned by the root leader.
    You do **not** write product code.

    ## Activation
    The leader dispatches you when its own coordination surface would exceed
    ~5 parallel children, or when dependency depth is too great for one chat.

    ## Protocol
    1. Read `progress/features/<id>/decomposition.md` and your assigned lane.
    2. Maintain `progress/subplan_<lane>.md` — this is your primary coordination
       artifact.  Root leader reads it for status; do not overwrite `current.md`.
    3. Delegate child lanes to implementers (or, rarely, deeper sub-leaders).
    4. Apply the same parallel-dispatch rule as the root leader: when ≥2 child
       lanes can proceed, fire them in one turn with required skills blocks.
    5. Apply the same review-fix loop and demotion rules (see AGENTS.md §7).
    6. Keep breadth ≤5 children per tier.  If you would exceed this, insert
       another subleader tier.
    7. Report up with path pointers only: "see progress/subplan_<lane>.md".

    ## Hard Rules
    - Same independence, lane-uniqueness, and disk-first rules as the root leader.
    - If uncertain about scope boundaries, read `decomposition.md`, not chat.

    ## Reply format
    ```
    subtree <lane> complete -> all slices integrated; see progress/subplan_<lane>.md
    ```
    or
    ```
    subtree <lane> blocked -> see progress/subplan_<lane>.md
    ```
    """)


def _implementer_prompt() -> str:
    return _dedent("""
    ---
    name: implementer
    description: >-
      Generalist worker. Implements exactly ONE feature or workstream lane per
      agent instance. Use only when no specialist role fits.
    tools: Read, Write, Edit, Glob, Grep, Bash
    ---

    # Implementer Agent (Generalist)

    You implement exactly **one** feature or **one** workstream lane.
    Use this generalist role only when the lane is truly narrow, mixed-domain,
    or no specialist fits.

    ## Choose a specialist instead when the domain is clear
    | Domain | Role |
    |--------|------|
    | UI, React, CSS, accessibility | `implementer-frontend` |
    | Services, DB, APIs, auth | `implementer-backend` |
    | End-to-end vertical slice | `implementer-fullstack` |
    | CI, scripts, build tooling | `implementer-devops` |
    | Docs, READMEs, ADRs | `implementer-documentation` |

    ## Protocol
    1. Read `AGENTS.md` (incl. §7 Review-fix loop), `docs/conventions.md`,
       `CHECKPOINTS.md`, and all required skill files for your lane.
    2. Claim your lane in `feature_list.json`: status → `in_progress`, add unique `lane`.
    3. Record progress: if solo, update `progress/current.md`; if parallel, write
       `progress/features/<id>/impl.md` only (do not overwrite peers' notes).
    4. Implement exactly what the `acceptance` criteria describe.
    5. Add or update tests proportional to risk and blast radius.
    6. Run `./init.sh` or `.\\init.ps1`. On failure, return to step 4.
    7. Request review — **do not** set status `done` until approved.
    8. After approval: set status `done`, append to `progress/history.md`.

    ## Fix passes (responding to a reviewer)
    When re-dispatched with finding ids:
    1. Read **only** the latest `## Attempt N` block of the review ledger.
    2. Address each finding **by id** (e.g. F-1, F-3). Record which ids each
       edit targets under `## Fix pass for review attempt N` in impl.md.
    3. Re-run `init` and invoke the reviewer.
    4. Never mark done while any `must-fix` finding is `open`.
    5. Never bump `attempts` yourself or edit historical Attempt blocks.

    ## Hard Rules
    - One lane per agent instance.  Touching another feature → report blocker.
    - Pair code changes with tests before moving on.
    - Unexpected tool failure → record `blocked` in impl.md and stop.

    ## Reply format
    ```
    done -> feature <id> implemented and reviewed (commit pending)
    ```
    or
    ```
    blocked -> see progress/features/<id>/impl.md
    ```
    or (fix pass)
    ```
    fix pass done -> findings F-1,F-3 addressed; awaiting reviewer
    ```
    """)


def _reviewer_prompt() -> str:
    return _dedent("""
    ---
    name: reviewer
    description: >-
      General review pass for correctness, scope, tests, maintainability,
      and security.  Maintains the findings ledger.  Does not edit product code.
    tools: Read, Glob, Grep, Bash
    ---

    # Reviewer Agent

    You review changed work.  You do **not** edit product code.

    ## Protocol
    1. Read `CHECKPOINTS.md`, `AGENTS.md §7`, `docs/conventions.md`,
       `progress/features/<id>/impl.md`, and changed files.
    2. Compare against `feature_list.json` acceptance criteria.
    3. Open or update `progress/features/<id>/review.md`.

    ## What to review
    - **Correctness:** does the implementation satisfy the acceptance criteria?
    - **Tests:** are new or updated tests proportional to risk?
    - **Scope:** does the change touch only what the lane specifies?
    - **Security:** are auth, secrets, migrations, and API boundaries safe?
    - **Failure modes:** are error paths explicit and actionable?
    - **Maintainability:** is the code consistent with `docs/conventions.md`?

    ## Findings ledger format (`progress/features/<id>/review.md`)

    ### Header (first line)
    ```
    review_passes: <n>
    ```

    ### Ledger table
    | finding_id | severity | status | attempts | last_reviewer | bug_feature_id |
    |------------|----------|--------|----------|---------------|----------------|

    **Severity:** `must-fix` or `nice-to-have`
    **Status:** `open` → `resolved` | `demoted`

    ### Per-attempt section
    ```
    ## Attempt <n> — <YYYY-MM-DD> — <reviewer-role>
    ```
    List still-open findings by id with current context. New findings get the
    next free F-<n>.

    ### Final state section
    Write `## Final state` once every finding is `resolved` or `demoted`.

    ## Caps and demotion
    - **Per-finding cap:** 5 attempts.  On the 5th pass still `open`, return
      `verdict: demoted F-<n>`.  Leader performs bookkeeping.
    - **Feature cap:** 10 review passes.  On the 10th pass, demote all still-open
      `must-fix` findings.
    - You increment `review_passes` and bump `attempts` on still-open findings.
    - You **never** demote findings or mutate `feature_list.json` yourself.

    ## Reply format
    ```
    approved -> feature <id> passes all checks
    ```
    or
    ```
    changes requested -> see progress/features/<id>/review.md Attempt <n>
    ```
    or (demotion threshold hit)
    ```
    verdict: demoted F-<n> -> see progress/features/<id>/review.md Attempt <n>
    ```
    """)


def _git_commit_prompt() -> str:
    return _dedent("""
    ---
    name: git-commit
    description: >-
      Post-approval commit planner. Proposes a logical multi-commit split.
      Does not push unless explicitly instructed.
    tools: Read, Glob, Grep, Bash
    ---

    # Git Commit Agent

    You plan reviewable commits **after** implementation is approved and
    `./init.sh` is green.

    ## Protocol
    1. Run `git status` and `git diff --stat` to understand the change surface.
    2. Group changes into logical, reviewable commits (one concern per commit).
    3. Write the plan to `progress/git_commit_plan.md`:
       - One section per proposed commit.
       - Each section: proposed commit message (imperative mood, ≤72 chars), list
         of files/paths in that commit, and a one-sentence rationale.
    4. Flag any staged secrets, `.env` files, local databases, or credentials —
       block the plan if found.
    5. **Do not run `git add`, `git commit`, or `git push`** unless the human
       explicitly asks you to execute the plan.

    ## Commit message format
    ```
    <type>(<scope>): <short description>

    <optional body>
    ```
    Types: feat, fix, docs, style, refactor, test, chore

    ## Hard rules
    - One concern per commit.
    - Never commit sensitive files.
    - The human pushes; you plan.

    ## Reply format
    ```
    commit plan ready -> see progress/git_commit_plan.md (<n> proposed commits)
    ```
    """)


def _specialist_prompt(role: AgentRole) -> str:
    """Generate a .cursor/agents/<name>.md prompt for any specialist implementer role."""
    skill_block = _skill_section(role.name)

    # Build skill reading list for the "Required reading" section
    skill_lines = ""
    for i, path in enumerate(role.skills, start=3):
        skill_lines += f"    {i}. `{path}`\n"

    return _dedent(f"""
    ---
    name: {role.name}
    description: >-
      {role.description}
    tools: Read, Write, Edit, Glob, Grep, Bash
    ---

    # {role.name.replace("-", " ").title()} Agent

    You implement exactly **one** feature or **one** workstream lane in your specialty.

    ## When to use this agent
    {role.when}

    ## Required reading (in order)
    1. `AGENTS.md` (incl. §7 Review-fix loop), `docs/conventions.md`, `CHECKPOINTS.md`
    2. Your assigned lane in `feature_list.json` and `progress/features/<id>/`
{skill_lines}
    ## Scope
    **Owns**
    {role.owns}

    **Avoid unless the lane explicitly includes it**
    {role.avoids}

    ## Protocol
    1. Read `AGENTS.md`, `docs/conventions.md`, `CHECKPOINTS.md`, and every skill
       file listed above **before** writing a single line of code.
    2. Confirm your lane is `in_progress` in `feature_list.json`.
    3. Record work in `progress/features/<id>/impl.md` under `## Lane <lane>`.
    4. Implement **only** your lane scope — nothing outside the acceptance criteria.
    5. Add or update tests proportional to risk.  No test → no done.
    6. Run `./init.sh` or `.\\init.ps1`.  Fix failures before requesting review.
    7. Request `{role.reviewer}`.  **Do not** mark done until approved.

    ## Implementation standards
    {role.standards}

    ## Fix passes
    When re-dispatched with finding ids (e.g. F-1, F-3):
    1. Read the latest `## Attempt N` block of the review ledger on disk.
    2. Address each finding by id. Record targets under `## Fix pass for review attempt N`.
    3. Re-run `init` and invoke `{role.reviewer}`.
    4. Never mark done while any `must-fix` finding is `open`.
    5. Never bump `attempts` yourself or edit historical Attempt blocks.

    ## Reply format
    ```
    done -> feature <id> implemented and reviewed (commit pending)
    ```
    or
    ```
    blocked -> see progress/features/<id>/impl.md
    ```
    or (fix pass)
    ```
    fix pass done -> findings F-1,F-3 addressed; awaiting reviewer
    ```
    """)


# ---------------------------------------------------------------------------
# AGENTS.md generation
# ---------------------------------------------------------------------------

def _agents_md_content() -> str:
    role_table_rows = "\n".join(
        f"| `{r.name}` | {r.description} |"
        for r in CORE_ROLES + SPECIALIST_ROLES
    )
    skill_table_rows = "\n".join(
        f"| `{r.name}` | {', '.join(f'`{s}`' for s in r.skills) or '—'} |"
        for r in CORE_ROLES + SPECIALIST_ROLES
        if r.skills or r.is_coordinator
    )
    return _dedent("""
    # AGENTS.md — Navigation map for AI agents

    This file is the **entry point** for every agent working in this repository.
    It is a **map**, not an exhaustive rulebook.  Read only what you need, when
    you need it (progressive disclosure).

    Nearest `AGENTS.md` wins when editing nested folders.

    ---

    ## 1 · Before you start (mandatory)

    1. Run `./init.sh` (or `.\\init.ps1` on Windows) and confirm exit code 0.
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

    ---

    ## 2b · Agent roles

    | Role | Description |
    |------|-------------|
    """ + role_table_rows + """

    ---

    ## 2c · Skill bundles

    Each agent reads its skill files **before** writing code or performing review.

    | Role | Skills |
    |------|--------|
    """ + skill_table_rows + """

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
    """)


# ---------------------------------------------------------------------------
# CHECKPOINTS.md generation
# ---------------------------------------------------------------------------

def _checkpoints_md_content() -> str:
    return _dedent("""
    # Checkpoints — Objective "Done" Criteria

    Use this list as a **pre-flight checklist** before setting any feature to `done`
    in `feature_list.json`.  Every box must be checked or explicitly documented as
    N/A for this feature.

    ---

    ## Automation

    - [ ] `./init.sh` or `.\\init.ps1` exits with code **0**.
          This gate validates the schema, runs lint, builds, and executes tests.
          A non-zero exit is a hard blocker — do not proceed.

    ---

    ## Scope

    - [ ] Changes implement **only** the selected feature or workstream lane.
          Unrelated refactors must be split into a separate pending feature.
    - [ ] No temporary debug output committed (stray `console.log`, `println!`,
          `print()`, scratch files, or commented-out dead code).
    - [ ] No secrets, credentials, `.env` files, or local database files staged.

    ---

    ## Quality

    - [ ] Tests cover the acceptance criteria for every logic path that changed.
          New tests exist where the feature adds non-trivial behavior.
    - [ ] Error paths are explicit and actionable — no silent swallowing of
          exceptions that the user or operator should know about.
    - [ ] Security-sensitive surfaces are not weakened: auth flows, secret
          handling, API boundaries, migrations, and cryptographic operations
          are reviewed against `.agents/skills/security/SKILL.md`.

    ---

    ## Handoff

    - [ ] `progress/features/<id>/impl.md` exists and accurately describes
          files changed, commands run, and test output.
    - [ ] `progress/features/<id>/review.md` exists and records approval
          (or lists all findings as `resolved` / `demoted`).
    - [ ] Every active `in_progress` lane is globally unique.
          Verified by `scripts/validate_feature_list.py` (called by `init`).

    ---

    ## Review-fix loop (when applicable)

    - [ ] No `must-fix` finding in `review.md` has status `open`.
    - [ ] If demotion occurred, the leader performed §7.4 bookkeeping before
          closing the parent feature.

    ---

    ## Communication

    - [ ] `progress/history.md` has a one-line entry for this feature.
    - [ ] `progress/current.md` is reset to idle (if you were coordinator/solo).
    """)


# ---------------------------------------------------------------------------
# conventions.md generation
# ---------------------------------------------------------------------------

def _conventions_md_content() -> str:
    return _dedent("""
    # Conventions

    This document is the **style and practice contract** for this project.
    Agents must read it before writing any code.

    ---

    ## General

    - Prefer small, focused changes tied to a single `feature_list.json` entry.
    - Match neighboring code style before introducing new patterns.
    - Keep domain decisions in `docs/` or ADRs, not buried in chat transcripts.
    - When in doubt, read existing code — don't invent conventions.

    ---

    ## Software Engineering Defaults

    - **API contracts:** Preserve them unless the feature explicitly changes them.
      Breaking changes require a migration plan documented in `docs/`.
    - **Tests:** Add or update tests proportional to risk and blast radius.
      High-risk paths (auth, data mutation, external calls) require tests.
    - **Security-sensitive surfaces:** Treat auth flows, secrets, migrations,
      logging of sensitive data, and network boundaries as security-sensitive.
      Flag any change to these in `progress/features/<id>/impl.md`.
    - **Error handling:** Make errors explicit and actionable.  Avoid silent
      catches that hide failures the operator should know about.

    ---

    ## Handoffs

    - Implementation notes go in `progress/features/<id>/impl.md`.
    - Review state goes in `progress/features/<id>/review.md`.
    - Heavy detail belongs on disk, not in chat.

    ---

    ## Commit style

    Use imperative mood in commit messages (≤72 chars subject):
    ```
    feat(auth): add email/password login endpoint
    fix(ui): correct focus trap in modal dialog
    docs(api): document rate-limit headers
    ```

    Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
    """)


# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

def bootstrap(root: Path, *, force: bool = False) -> None:
    """Write all harness scaffold files to *root*.

    By default, every file is written once and never touched again so local
    edits survive repeated `init` runs. Pass force=True to regenerate the
    *generated* scaffolding (AGENTS.md, CHECKPOINTS.md, conventions.md,
    agent prompt files, helper scripts, init.sh/init.ps1) after upgrading
    harness.py — this never touches feature_list.json or anything under
    progress/, since those hold live work state and history that must
    never be silently clobbered.
    """
    # Pick up any roles registered via `add-agent` in a previous run so a
    # --force regeneration of AGENTS.md reflects them instead of forgetting
    # they exist.
    _load_custom_roles(root)

    # Core ledger and progress files — NEVER regenerated, force or not.
    write_file(root / "feature_list.json", '{\n  "version": 1,\n  "features": []\n}\n')
    write_file(
        root / "progress" / "current.md",
        _dedent("""
        # Current Session

        **Status:** idle

        ## Active Feature

        (none)

        ## Plan

        (none)

        ## Parallel Lanes

        (none)

        ## Blockers

        (none)
        """),
    )
    write_file(
        root / "progress" / "history.md",
        _dedent("""
        # History

        Append completed feature summaries here, one line per closure:
        `YYYY-MM-DD · feature <id> · <name> · <one-sentence outcome>`
        """),
    )

    # Core Markdown docs — regenerated under --force.
    write_file(root / "AGENTS.md", _agents_md_content(), overwrite=force)
    write_file(root / "CHECKPOINTS.md", _checkpoints_md_content(), overwrite=force)
    write_file(root / "docs" / "conventions.md", _conventions_md_content(), overwrite=force)

    write_file(
        root / "docs" / "architecture.md",
        _dedent("""
        # Architecture

        Replace this stub with your project's architecture overview.

        Suggested sections:
        - System context diagram
        - Key components and their responsibilities
        - Data flow between components
        - Security model (auth, secrets, trust boundaries)
        - Deployment topology
        """),
    )

    write_file(
        root / "docs" / "verification.md",
        _dedent("""
        # Verification

        The mandatory verification gate:

        ```bash
        ./init.sh
        ```

        On Windows (PowerShell):

        ```powershell
        .\\init.ps1
        ```

        Customize these scripts for your stack.  Always keep
        `python harness.py validate` as the **first step** so schema
        invariants are checked before any build or test step.

        ## Common project checks
        Add the relevant checks to `init.sh` / `init.ps1`:
        ```bash
        # npm test
        # pytest
        # cargo test
        # go test ./...
        # npm run lint && npm run build
        ```
        """),
    )

    # Skill stub directories — never auto-regenerated; once a team fills
    # these in they're project knowledge, not generated boilerplate.
    all_skills: set[str] = set()
    for role in CORE_ROLES + SPECIALIST_ROLES:
        for skill_path in role.skills:
            all_skills.add(skill_path)

    _write_skill_stubs(root, all_skills)

    # Agent prompt files — regenerated under --force.
    agent_files: dict[str, str] = {
        "leader.md": _leader_prompt(),
        "subleader.md": _subleader_prompt(),
        "implementer.md": _implementer_prompt(),
        "reviewer.md": _reviewer_prompt(),
        "git-commit.md": _git_commit_prompt(),
    }
    for role in SPECIALIST_ROLES:
        if role.name != "implementer" and role.emit_agent_file:
            agent_files[f"{role.name}.md"] = _specialist_prompt(role)
    for name, content in agent_files.items():
        write_file(root / ".cursor" / "agents" / name, content, overwrite=force)

    # Helper scripts — regenerated under --force.
    write_file(
        root / "scripts" / "validate_feature_list.py",
        _dedent("""
        #!/usr/bin/env python3
        \"\"\"Thin wrapper: validates feature_list.json by delegating to harness.py.\"\"\"
        from pathlib import Path
        import subprocess, sys

        root = Path(__file__).resolve().parent.parent
        raise SystemExit(
            subprocess.call([sys.executable, str(root / "harness.py"), "validate"])
        )
        """),
        executable=True,
        overwrite=force,
    )

    write_file(
        root / "scripts" / "emit_parallel_lane_prompts.py",
        _dedent("""
        #!/usr/bin/env python3
        \"\"\"Print one agent prompt per active lane (multi-chat fallback).\"\"\"
        from pathlib import Path
        import subprocess, sys

        root = Path(__file__).resolve().parent.parent
        raise SystemExit(
            subprocess.call([sys.executable, str(root / "harness.py"), "emit-prompts"])
        )
        """),
        executable=True,
        overwrite=force,
    )

    # Verification gate scripts — regenerated under --force.
    write_file(
        root / "init.sh",
        _dedent("""
        #!/usr/bin/env bash
        # Verification gate — customize for your stack.
        # Keep validate as the first step; it enforces schema invariants.
        set -euo pipefail
        cd "$(dirname "$0")"

        echo "==> [1/N] Validate feature_list.json"
        python harness.py validate

        # Add project-specific steps below and update [1/N] to reflect the count.
        # echo "==> [2/N] Install dependencies"
        # npm ci
        # echo "==> [3/N] Lint"
        # npm run lint
        # echo "==> [4/N] Build"
        # npm run build
        # echo "==> [5/N] Test"
        # npm test
        # cargo test

        echo ""
        echo "==> All checks passed."
        """),
        executable=True,
        overwrite=force,
    )

    write_file(
        root / "init.ps1",
        _dedent("""
        # Verification gate (PowerShell) — customize for your stack.
        $ErrorActionPreference = 'Stop'
        Set-Location $PSScriptRoot

        Write-Host "==> [1/N] Validate feature_list.json"
        python harness.py validate
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

        # Add project-specific steps below.
        # Write-Host "==> [2/N] Install dependencies"
        # npm ci
        # if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

        Write-Host ""
        Write-Host "==> All checks passed."
        """),
        overwrite=force,
    )

    # .gitignore — credential hygiene is called out in this script's own
    # docstring ("never commit credentials") but nothing previously enforced
    # it. Also ignore the *.lock files FileLock creates so a crashed agent
    # never leaves a stray lock file staged in a commit.
    gitignore_path = root / ".gitignore"
    gitignore_block = _dedent("""
    # --- harness-managed: credential & lock hygiene -------------------------
    .env
    .env.*
    !.env.example
    *.lock
    __pycache__/
    *.pyc
    .DS_Store
    """)
    if gitignore_path.exists():
        existing = gitignore_path.read_text(encoding="utf-8")
        if ".env" not in existing:
            print(
                "  ⚠ .gitignore exists but doesn't mention .env — add an entry "
                "manually so credentials can't be committed by accident."
            )
    else:
        write_file(gitignore_path, gitignore_block)

    # Self-copy harness to project root if it isn't already there, or refresh
    # it under --force so an upgraded harness.py actually propagates into
    # the repo it's bootstrapping (previously there was no way to do this
    # short of manually copying the file over).
    harness_src = Path(__file__).resolve()
    harness_dst = root / "harness.py"
    if harness_src != harness_dst and (force or not harness_dst.exists()):
        harness_dst.write_bytes(harness_src.read_bytes())

    print("ok: harness bootstrapped" + (" (--force: scaffolding regenerated)" if force else ""))
    print("  • Edit init.sh / init.ps1 with your project's build and test commands.")
    print("  • Fill in .agents/skills/*/SKILL.md with your team's concrete standards.")
    print("  • Run `python harness.py add-feature \"...\"` to register your first task.")
    print("  • Run `python harness.py validate` to confirm the schema is healthy.")


# ---------------------------------------------------------------------------
# Emit prompts
# ---------------------------------------------------------------------------

def emit_prompts(root: Path) -> None:
    """Print one ready-to-paste agent prompt per claimed lane."""
    features = _require_valid_ledger(root)
    active = [f for f in features if f.get("status") == "in_progress"]
    if not active:
        print("No in_progress features — nothing to emit.")
        return

    blocks: list[tuple[int, str, str, str, str, dict[str, Any], bool]] = []
    for row in active:
        fid = row["id"]
        workstreams = row.get("workstreams")
        if isinstance(workstreams, list) and workstreams:
            for ws in workstreams:
                if not isinstance(ws, dict) or ws.get("status", "pending") != "in_progress":
                    continue  # not yet claimed, or already done — nothing to dispatch
                lane = ws.get("lane")
                title = ws.get("title") or row.get("title", "")
                if not lane:
                    continue
                blocks.append((fid, lane, title, row.get("notes", ""),
                                ws.get("specialist") or "implementer", ws, True))
        else:
            lane = row.get("lane")
            if lane:
                blocks.append((fid, lane, row.get("title", ""), row.get("notes", ""),
                                "implementer", row, False))

    if not blocks:
        print(
            "Features are in_progress but nothing has been claimed yet — "
            "run `python harness.py claim <id> --lane <name>` first."
        )
        return

    print("# Parallel Lane Prompts\n")
    print("Paste one block per agent chat tab.\n")
    for fid, lane, title, notes, role, row, is_ws in blocks:
        _print_lane_prompt(fid, lane, title, notes, role, row, is_ws)


def _print_lane_prompt(
    fid: int,
    lane: str,
    title: str,
    notes: str,
    role: str,
    row: dict[str, Any],
    is_workstream: bool = False,
) -> None:
    scope = row.get("scope", "Use feature notes and progress artifacts.")
    acceptance = row.get("acceptance", "Tests/checks pass and reviewer approves.")
    skill_block = _skill_section(role)
    complete_cmd = (
        f"python harness.py complete {fid} --workstream {lane}"
        if is_workstream
        else f"python harness.py complete {fid}"
    )

    block = _dedent(f"""
    ---

    ## Lane `{lane}` — Feature {fid}

    You are **`{role}`** for exactly one lane: `{lane}`.

    ### Task
    - **Title:** {title}
    - **Notes:** {notes or "(see feature_list.json)"}
    - **Scope:** {scope}
    - **Acceptance:** {acceptance}

    ### Protocol
    1. Read `AGENTS.md` (incl. §7), `docs/conventions.md`, `CHECKPOINTS.md`,
       and all required skill files listed below.
    2. Confirm lane `{lane}` is `in_progress` for feature {fid} in `feature_list.json`
       (it was claimed for you via `harness.py claim`).
    3. Record progress in `progress/features/{fid}/impl.md` under `## Lane {lane}`.
    4. Stay inside your scope. Do not edit other lanes' progress sections.
    5. Add or update tests proportional to risk.
    6. Run `./init.sh` or `.\\init.ps1` before handoff.
    7. Request review; do not mark done until approved.
    8. Once approved, run `{complete_cmd}` to close the lane — don't hand-edit the ledger.

    {skill_block}
    """).strip()
    print(block)
    print()


# ---------------------------------------------------------------------------
# Status summary
# ---------------------------------------------------------------------------

def print_status(root: Path) -> None:
    """Print a human-readable summary of feature progress."""
    errors, _features, _lanes = _validate_feature_list_errors(root)
    data = read_json(root / "feature_list.json")
    features = data.get("features", [])
    if not isinstance(features, list):
        features = []
    if not features:
        print("feature_list.json is empty — run `python harness.py add-feature \"...\"` to start.")
        return

    if errors:
        print(f"\n⚠ feature_list.json has {len(errors)} validation issue(s) — showing best-effort status:")
        for e in errors[:5]:
            print(f"  • {e}")
        if len(errors) > 5:
            print(f"  … and {len(errors) - 5} more (run `python harness.py validate` for the full list)")

    counts: dict[str, int] = {s: 0 for s in sorted(ALLOWED_STATUS)}
    for row in features:
        if not isinstance(row, dict):
            continue
        s = row.get("status", "unknown")
        counts[s] = counts.get(s, 0) + 1

    BAR_CAP = 40
    print(f"\n{'═'*52}")
    print(f"  Feature Status — {root.name}")
    print(f"{'═'*52}")
    for status, count in counts.items():
        bar = "█" * min(count, BAR_CAP) + ("…" if count > BAR_CAP else "")
        print(f"  {status:<12} {count:>3}  {bar}")
    print(f"{'─'*52}")
    print(f"  {'total':<12} {len(features):>3}")
    print(f"{'═'*52}\n")

    in_progress = [r for r in features if isinstance(r, dict) and r.get("status") == "in_progress"]
    if in_progress:
        print("Active lanes:")
        for row in in_progress:
            lane = row.get("lane") or "(delegated to workstreams)"
            print(f"  [{row.get('id','?')}] {str(row.get('title',''))[:48]:<48}  lane={lane}")
            for ws in (row.get("workstreams") or []):
                if not isinstance(ws, dict):
                    continue
                wstatus = ws.get("status", "pending")
                wlane = ws.get("lane") or "—"
                print(f"       ↳ [{wstatus}] {wlane:<20} {str(ws.get('title',''))[:36]}")
        print()

    blocked = [r for r in features if isinstance(r, dict) and r.get("status") == "blocked"]
    if blocked:
        print("Blocked features:")
        for row in blocked:
            bb = row.get("blocked_by", [])
            print(f"  [{row.get('id','?')}] {str(row.get('title',''))[:48]}  blocked_by={bb}")
        print()


# ---------------------------------------------------------------------------
# CLI command handlers
# ---------------------------------------------------------------------------

def cmd_setup_project(args: argparse.Namespace) -> None:
    root = Path(args.root).resolve()
    # Ensure the harness is bootstrapped before we try to adapt it
    if not (root / "AGENTS.md").exists():
        print("  Note: harness not yet initialised. Running `init` first…\n")
        bootstrap(root)
    answers_path = Path(args.answers).resolve() if getattr(args, "answers", None) else None
    setup_project(
        root,
        answers_path=answers_path,
        model=getattr(args, "model", None),
        skip_agent_run=getattr(args, "no_run_agent", False),
    )


def cmd_run_setup_agent(args: argparse.Namespace) -> None:
    root = Path(args.root).resolve()
    log_path = Path(args.log).resolve() if getattr(args, "log", None) else None
    run_setup_adapter_agent_blocking(root, args.model, log_path=log_path)


def cmd_init(args: argparse.Namespace) -> None:
    root = Path(args.root).resolve()
    bootstrap(root, force=getattr(args, "force", False))


def cmd_validate(args: argparse.Namespace) -> None:
    validate_feature_list(Path(args.root).resolve())


def cmd_add_feature(args: argparse.Namespace) -> None:
    add_feature(Path(args.root).resolve(), args.title, args.notes or "", args.klass)


def cmd_emit_prompts(args: argparse.Namespace) -> None:
    emit_prompts(Path(args.root).resolve())


def cmd_status(args: argparse.Namespace) -> None:
    print_status(Path(args.root).resolve())


def cmd_claim(args: argparse.Namespace) -> None:
    root = Path(args.root).resolve()
    claim_lane(root, args.feature_id, args.lane, args.workstream)
    validate_feature_list(root)


def cmd_complete(args: argparse.Namespace) -> None:
    root = Path(args.root).resolve()
    complete_lane(root, args.feature_id, args.workstream)
    validate_feature_list(root)


def cmd_block(args: argparse.Namespace) -> None:
    root = Path(args.root).resolve()
    block_feature(root, args.feature_id, args.blocked_by)
    validate_feature_list(root)


def cmd_demote(args: argparse.Namespace) -> None:
    root = Path(args.root).resolve()
    demote_finding(root, args.feature_id, args.finding, args.attempts, args.title, args.notes or "")


def cmd_add_agent(args: argparse.Namespace) -> None:
    root = Path(args.root).resolve()
    _load_custom_roles(root)  # see what's already registered before checking for collisions
    skills = [s.strip() for s in (args.skills or "").split(",") if s.strip()]
    role = add_agent_role(args.name, args.desc, skills)
    _save_custom_role(root, role)
    if skills:
        _write_skill_stubs(root, set(skills))
    agent_path = root / ".cursor" / "agents" / f"{args.name}.md"
    write_file(agent_path, _specialist_prompt(role), overwrite=True)
    print(f"ok: registered role {args.name!r} and wrote {agent_path}")
    print(
        "  Note: AGENTS.md's role/skill tables were generated at `init` time and "
        "won't list this role until you run `python harness.py init --force` "
        "(safe — it never touches feature_list.json or progress/ history)."
    )


# ---------------------------------------------------------------------------
# Project setup — interactive questionnaire → project_context files + Cursor
# ---------------------------------------------------------------------------

_SETUP_QUESTIONS: list[tuple[str, str, str]] = [
    # (key, prompt_text, hint)
    (
        "objective",
        "What is the main objective of this project?",
        "One or two sentences describing what you are building and for whom.",
    ),
    (
        "tech_stack",
        "What is the technology stack?",
        "Languages, frameworks, databases, and major libraries (e.g. TypeScript, React, FastAPI, PostgreSQL).",
    ),
    (
        "domains",
        "What are the main functional domains or modules?",
        "List the key areas of the codebase (e.g. auth, billing, dashboard, API, worker).",
    ),
    (
        "global_rules",
        "Are there global coding rules or constraints the agents must respect?",
        "E.g. no direct DB access outside the repository layer, always validate at boundaries, etc.",
    ),
    (
        "forbidden",
        "What files, patterns, or actions are strictly forbidden?",
        "E.g. never commit .env, never modify migrations after merge, no direct SQL outside models/.",
    ),
    (
        "testing_strategy",
        "How should agents approach testing?",
        "E.g. unit tests with pytest, E2E with Playwright, minimum coverage thresholds, snapshot tests.",
    ),
    (
        "review_focus",
        "What should reviewers pay particular attention to in this project?",
        "E.g. performance of DB queries, accessibility of all UI, strict API versioning.",
    ),
    (
        "deployment_notes",
        "Any deployment or environment notes agents should know?",
        "E.g. staging vs production branches, required env vars, infra details.",
    ),
    (
        "extra_context",
        "Anything else agents should know about this project? (press Enter to skip)",
        "Free-form: team conventions, third-party integrations, known pain points, etc.",
    ),
]


def _ask(prompt: str, hint: str) -> str:
    """Print a labelled prompt with a hint and return the stripped user input."""
    print(f"\n  {prompt}")
    if hint:
        print(f"  \033[2m{hint}\033[0m")
    sys.stdout.write("  > ")
    sys.stdout.flush()
    try:
        return input().strip()
    except (EOFError, KeyboardInterrupt):
        print()
        return ""


def _load_project_context_from_file(path: Path) -> dict[str, str]:
    """Load questionnaire answers from a JSON file (full ledger or plain context dict)."""
    if not path.exists():
        raise SystemExit(f"error: answers file not found — {path}")
    raw = path.read_text(encoding="utf-8")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"error: {path} is not valid JSON — {exc}") from exc
    if not isinstance(data, dict):
        raise SystemExit(
            f"error: {path} must be a JSON object, got {type(data).__name__}"
        )
    if "project_context" in data and isinstance(data["project_context"], dict):
        context = data["project_context"]
    else:
        context = data
    known_keys = {key for key, _, _ in _SETUP_QUESTIONS}
    unknown = sorted(set(context.keys()) - known_keys)
    if unknown:
        raise SystemExit(
            f"error: {path} has unknown keys: {', '.join(unknown)}"
        )
    return {key: str(context.get(key, "")).strip() for key in known_keys}


def _normalize_project_context(raw: dict[str, Any]) -> dict[str, str]:
    """Normalize a project_context dict to the questionnaire key set."""
    known_keys = [key for key, _, _ in _SETUP_QUESTIONS]
    return {key: str(raw.get(key, "")).strip() for key in known_keys}


def _load_existing_project_context(root: Path) -> dict[str, str] | None:
    """Load project_context.json when present and valid; return None if absent or invalid."""
    json_path = root / "project_context.json"
    if not json_path.exists():
        return None
    raw = json_path.read_text(encoding="utf-8")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    if "project_context" in data and isinstance(data["project_context"], dict):
        context = data["project_context"]
    elif all(key in data for key, _, _ in _SETUP_QUESTIONS):
        context = data
    else:
        return None
    return _normalize_project_context(context)


def _context_has_content(context: dict[str, str]) -> bool:
    return any(value.strip() for value in context.values())


def _prompt_reuse_existing_context() -> bool:
    """Ask whether to keep existing project context. True = reuse, False = rewrite."""
    print("\n  Project context already exists (project_context.json).")
    print("    1. Use existing context")
    print("    2. Rewrite (run the questionnaire again)")
    sys.stdout.write("  > ")
    sys.stdout.flush()
    try:
        choice = input().strip().lower()
    except (EOFError, KeyboardInterrupt):
        print()
        return True
    if not choice or choice in {"1", "use", "existing", "reuse", "u", "e"}:
        return True
    if choice in {"2", "rewrite", "r", "new"}:
        return False
    return True


def _run_interactive_questionnaire() -> dict[str, str]:
    """Run the interactive questionnaire and return a dict of answers."""
    print("\n" + "═" * 60)
    print("  Project Setup — Adapting the harness to your project")
    print("═" * 60)
    print("  Answer the questions below.  Press Enter to skip optional ones.")
    print("  Your answers will be saved to project_context.json and")
    print("  docs/project_context.md.\n")

    context: dict[str, str] = {}
    for key, prompt_text, hint in _SETUP_QUESTIONS:
        answer = _ask(prompt_text, hint)
        context[key] = answer

    return context


def _resolve_project_context(
    root: Path,
    answers_path: Path | None = None,
) -> tuple[dict[str, str], bool]:
    """Return (context, reused_existing)."""
    if answers_path is not None:
        print(f"\n  Loading answers from {answers_path}…")
        return _load_project_context_from_file(answers_path), False

    existing = _load_existing_project_context(root)
    if existing is not None and _context_has_content(existing):
        if _prompt_reuse_existing_context():
            return existing, True

    return _run_interactive_questionnaire(), False


def _collect_project_context(
    answers_path: Path | None = None,
    root: Path | None = None,
) -> dict[str, str]:
    """Run the interactive questionnaire or load answers from a JSON file."""
    if root is not None:
        context, _ = _resolve_project_context(root, answers_path)
        return context
    if answers_path is not None:
        print(f"\n  Loading answers from {answers_path}…")
        return _load_project_context_from_file(answers_path)
    return _run_interactive_questionnaire()


def _project_context_md(context: dict[str, str]) -> str:
    """Render project context as a Markdown document."""
    def _section(title: str, key: str) -> str:
        value = context.get(key, "").strip()
        body = value if value else "_Not specified._"
        return f"## {title}\n\n{body}\n"

    lines = ["# Project Context\n",
             "_Generated by `python harness.py setup-project`. "
             "Edit freely — agents read this file before any substantive work._\n"]
    lines.append(_section("Objective", "objective"))
    lines.append(_section("Technology Stack", "tech_stack"))
    lines.append(_section("Main Domains / Modules", "domains"))
    lines.append(_section("Global Coding Rules", "global_rules"))
    lines.append(_section("Forbidden Actions / Patterns", "forbidden"))
    lines.append(_section("Testing Strategy", "testing_strategy"))
    lines.append(_section("Review Focus Areas", "review_focus"))
    lines.append(_section("Deployment & Environment Notes", "deployment_notes"))
    lines.append(_section("Additional Context", "extra_context"))
    return "\n".join(lines)


def _cursor_agent_prompt(
    context: dict[str, str],
    root: Path,
    model: str | None = None,
) -> str:
    """Build the Cursor agent prompt that requests harness file adaptation."""
    ctx_path = "docs/project_context.md"
    json_path = "project_context.json"
    roles_listed = ", ".join(f"`{n}`" for n in ALL_ROLES)
    model_field = model if model else "inherit"

    # Summarise non-empty answers for inline context in the prompt
    inline: list[str] = []
    labels = {
        "objective": "Objective",
        "tech_stack": "Stack",
        "domains": "Domains",
        "global_rules": "Global rules",
        "forbidden": "Forbidden",
        "testing_strategy": "Testing",
        "review_focus": "Review focus",
        "deployment_notes": "Deployment",
        "extra_context": "Extra context",
    }
    for key, label in labels.items():
        val = context.get(key, "").strip()
        if val:
            inline.append(f"**{label}:** {val}")

    inline_block = "\n".join(f"- {l}" for l in inline) if inline else "(see files)"

    return _dedent(f"""\
    ---
    name: project-setup-adapter
    description: >-
      One-shot adapter. Reads project_context.json and docs/project_context.md
      and regenerates all harness files so they fit the specific project.
      Runs once; deletes itself afterwards.
    tools: Read, Write, Edit, Glob, Grep, Bash
    is_background: true
    model: {model_field}
    ---

    # Project Setup Adapter

    You are a **one-shot agent**. Your job is to adapt every harness file in this
    repository so it reflects the specific project described below.  When done,
    delete this file (`.cursor/agents/project-setup-adapter.md`).

    ---

    ## Project summary (from questionnaire)

    {inline_block}

    Full context is in `{ctx_path}` and `{json_path}`.

    ---

    ## What you must do (in order)

    ### 1 · Read state
    1. Read `{ctx_path}` and `{json_path}`.
    2. Read the current `AGENTS.md`, `docs/conventions.md`, `CHECKPOINTS.md`,
       `docs/architecture.md`, and `docs/verification.md`.
    3. Read `harness.py` to understand the current role definitions.

    ### 2 · Adapt `docs/conventions.md`
    Replace the generic stub with **concrete, project-specific conventions**:
    - Naming rules for the actual stack and domains.
    - Import / module conventions.
    - Error-handling patterns for the actual frameworks.
    - Commit-message scope tokens that match the real domain names.
    Keep the same Markdown structure but make every line project-specific.

    ### 3 · Adapt `docs/architecture.md`
    Replace the stub with a concise architecture overview derived from the
    project context:
    - System context (what the product does and for whom).
    - Key components mapped to the declared domains/modules.
    - Data flow and trust boundaries.
    - Security model notes from the project context.

    ### 4 · Adapt `docs/verification.md`
    Replace the generic shell comments with **real commands** for the project's
    stack (e.g. `npm test`, `pytest`, `cargo test`).  If deployment notes mention
    required env vars, add a check for them.

    ### 5 · Adapt `CHECKPOINTS.md`
    Add project-specific checklist items under each section that reflect:
    - The real testing strategy.
    - The forbidden actions/patterns.
    - The review focus areas.
    Keep all existing generic items; only *add* or *refine*.

    ### 6 · Adapt `AGENTS.md`
    Patch the following sections to be project-specific:
    - **§2 Repository map:** add rows for project-specific paths (e.g. real `src/`
      layout, migration folder, test folder).
    - **§2b Agent roles:** if certain roles are irrelevant to this stack, mark them
      `(not used in this project)` in the description column.  Do not delete rows.
    - **§2c Skill bundles:** list the concrete skill paths that exist after step 7.
    - **§3 Hard rules:** prepend any project-specific hard rules from the
      "global rules" and "forbidden" questionnaire answers.

    ### 7 · Adapt `.agents/skills/*/SKILL.md` stubs
    For each existing skill stub (`{SKILLS_DIR}/<name>/SKILL.md`):
    - Replace the generic body with concrete, project-specific guidance for that
      domain drawn from the project context (stack, rules, review focus).
    - Keep the YAML front-matter and heading format intact.
    - If a skill domain is irrelevant to this project, write a single sentence
      saying so rather than leaving the generic stub.

    ### 8 · Adapt `.cursor/agents/*.md` role files
    For the following existing roles: {roles_listed}.
    For each file:
    - Replace generic skill path references with the real paths that now exist
      under `.agents/skills/`.
    - Patch the "When to use this agent" section to name the actual project domains.
    - Patch "Implementation standards" and "Review focus" sections with
      project-specific guidance from `docs/conventions.md` (which you wrote above).
    - Do **not** alter the protocol steps, caps, or format — only the
      project-specific content.

    ### 9 · Update `init.sh` / `init.ps1`
    Replace the commented-out steps with the real commands for this project's
    stack.  Add numbered steps (update `[1/N]` to reflect the real count).

    ### 10 · Write a setup summary
    Write `progress/setup_summary.md`:
    ```
    # Setup Summary

    Generated: <date>

    ## Changes made
    <bullet list of every file you changed and what you changed>

    ## Assumptions
    <list anything you inferred that the project owner should verify>

    ## Next steps
    <what the human should do next: fill in gaps, add features, run init>
    ```

    ### 11 · Self-delete
    Delete `.cursor/agents/project-setup-adapter.md` (this file).

    ---

    ## Hard rules for this task
    - Do **not** change `harness.py` itself.
    - Do **not** change `feature_list.json`.
    - Do **not** invent facts not present in the project context; use
      `_Not specified._` sections as hints to ask or leave as stubs.
    - Every file you write must be valid Markdown (for `.md`) or valid JSON
      (for `.json`).
    - Run `python harness.py validate` at the end to confirm schema health.

    ## Reply format
    ```
    setup complete -> see progress/setup_summary.md
    ```
    """)


def _detect_cursor(root: Path) -> bool:
    """Return True if the project appears to be open in Cursor."""
    # Heuristics: .cursor/ directory exists, or CURSOR_TRACE / CURSOR_SESSION_ID env vars
    cursor_dir = root / ".cursor"
    if cursor_dir.is_dir():
        return True
    if os.environ.get("CURSOR_TRACE") or os.environ.get("CURSOR_SESSION_ID"):
        return True
    # Check if the process was launched from Cursor's integrated terminal
    ppid_cmd = ""
    try:
        ppid = os.getppid()
        ppid_path = Path(f"/proc/{ppid}/cmdline")
        if ppid_path.exists():
            ppid_cmd = ppid_path.read_bytes().replace(b"\x00", b" ").decode(errors="ignore")
    except Exception:
        pass
    if "cursor" in ppid_cmd.lower():
        return True
    return False


def _cursor_api_key() -> str | None:
    key = os.environ.get("CURSOR_API_KEY")
    return key.strip() if key else None


def _cursor_sdk_import_error() -> str | None:
    try:
        import cursor_sdk  # noqa: F401
    except ImportError:
        return "cursor-sdk is not installed (pip install cursor-sdk)"
    return None


def _list_cursor_models(api_key: str) -> list[str]:
    from cursor_sdk import Cursor

    models = Cursor.models.list(api_key=api_key)
    ids: list[str] = []
    for model in models:
        model_id = getattr(model, "id", None)
        if model_id:
            ids.append(str(model_id))
    return ids


def _prompt_setup_model(api_key: str | None = None) -> str:
    """Ask which model to use for the setup adapter agent."""
    default = "composer-2.5"
    key = api_key or _cursor_api_key()
    model_ids: list[str] = []

    if key and _cursor_sdk_import_error() is None:
        try:
            model_ids = _list_cursor_models(key)
        except Exception as exc:
            print(f"  Warning: could not list models ({exc}). Enter an ID manually.")

    print("\n  Select a model for the setup adapter agent:")
    if model_ids:
        for index, model_id in enumerate(model_ids, start=1):
            print(f"    {index}. {model_id}")
        print(f"    0. Enter custom model ID (default: {default})")
        sys.stdout.write("  > ")
        sys.stdout.flush()
        try:
            choice = input().strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return default
        if not choice:
            return default
        if choice.isdigit():
            pick = int(choice)
            if pick == 0:
                sys.stdout.write(f"  Model ID (default: {default}): ")
                sys.stdout.flush()
                try:
                    custom = input().strip()
                except (EOFError, KeyboardInterrupt):
                    print()
                    return default
                return custom or default
            if 1 <= pick <= len(model_ids):
                return model_ids[pick - 1]
        return choice

    print(f"  Enter model ID (default: {default})")
    sys.stdout.write("  > ")
    sys.stdout.flush()
    try:
        entered = input().strip()
    except (EOFError, KeyboardInterrupt):
        print()
        return default
    return entered or default


SETUP_ADAPTER_PROMPT = "/multitask /project-setup-adapter run"
SETUP_AGENT_LOG = Path("progress") / "setup_agent.log"


class _TeeStream:
    """Mirror writes to the original stream and a log file."""

    def __init__(self, stream: Any, log_file: Any) -> None:
        self._stream = stream
        self._log = log_file

    def write(self, data: str) -> int:
        self._stream.write(data)
        self._log.write(data)
        return len(data)

    def flush(self) -> None:
        self._stream.flush()
        self._log.flush()

    def fileno(self) -> int:
        return self._stream.fileno()


@contextlib.contextmanager
def _tee_stdio_to_log(log_path: Path) -> Iterator[None]:
    """Tee stdout/stderr to a log file without replacing them before SDK bridge launch."""
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_file = log_path.open("a", encoding="utf-8", buffering=1)
    orig_out, orig_err = sys.stdout, sys.stderr
    sys.stdout = _TeeStream(orig_out, log_file)
    sys.stderr = _TeeStream(orig_err, log_file)
    try:
        yield
    finally:
        sys.stdout, sys.stderr = orig_out, orig_err
        log_file.close()


def _drive_setup_adapter_agent(agent: Any, log_path: Path | None) -> None:
    """Send the setup prompt and stream results from an already-created SDK agent."""
    stream_ctx = _tee_stdio_to_log(log_path) if log_path else contextlib.nullcontext()
    with stream_ctx:
        print(f"  agent_id={agent.agent_id}")
        run = agent.send(SETUP_ADAPTER_PROMPT)
        print(f"  run_id={run.id}")
        for message in run.messages():
            if message.type == "assistant":
                for block in message.message.content:
                    if block.type == "text":
                        sys.stdout.write(block.text)
                        sys.stdout.flush()
        result = run.wait()
        if result.status == "error":
            raise SystemExit(f"error: setup agent run failed (run_id={result.id})")
        print("\n  Setup adapter finished.")


def _patch_cursor_sdk_windows_bridge() -> None:
    """Patch cursor-sdk bridge discovery to avoid select() on Windows pipes."""
    if sys.platform != "win32":
        return

    import queue
    import threading

    import cursor_sdk._bridge as bridge_mod

    if getattr(bridge_mod, "_harness_windows_discovery_patch", False):
        return

    def read_discovery_windows(
        process: subprocess.Popen[str],
        timeout: float,
    ) -> dict[str, Any]:
        if process.stderr is None:
            raise bridge_mod.CursorSDKError("Bridge process stderr is unavailable")

        events: queue.Queue[tuple[str, Any]] = queue.Queue()

        def reader() -> None:
            stderr_lines: list[str] = []
            try:
                while True:
                    line = process.stderr.readline()
                    if line == "":
                        events.put(("eof", "".join(stderr_lines)))
                        return
                    stderr_lines.append(line)
                    discovery = bridge_mod.parse_discovery_line(line)
                    if discovery is not None:
                        events.put(("discovery", discovery))
                        return
            except Exception as exc:
                events.put(("error", exc))

        thread = threading.Thread(target=reader, daemon=True)
        thread.start()
        deadline = time.monotonic() + timeout

        while time.monotonic() < deadline:
            remaining = max(0.0, deadline - time.monotonic())
            try:
                kind, value = events.get(timeout=min(0.1, remaining))
            except queue.Empty:
                exit_code = process.poll()
                if exit_code is not None:
                    try:
                        kind, value = events.get_nowait()
                    except queue.Empty:
                        kind, value = "eof", ""
                    if kind == "error":
                        raise value
                    if kind == "discovery":
                        return dict(value)
                    raise bridge_mod.CursorSDKError(
                        f"Bridge exited before discovery with status {exit_code}: "
                        f"{value}"
                    )
                continue

            if kind == "discovery":
                return dict(value)
            if kind == "error":
                raise value
            if kind == "eof":
                exit_code = process.poll()
                raise bridge_mod.CursorSDKError(
                    f"Bridge exited before discovery with status {exit_code}: {value}"
                )

        raise bridge_mod.CursorSDKError("Timed out waiting for bridge discovery")

    bridge_mod._read_discovery = read_discovery_windows
    bridge_mod._harness_windows_discovery_patch = True


def run_setup_adapter_agent_blocking(
    root: Path,
    model: str,
    log_path: Path | None = None,
) -> None:
    """Launch project-setup-adapter via the Cursor SDK and wait for completion."""
    sdk_err = _cursor_sdk_import_error()
    if sdk_err:
        raise SystemExit(f"error: {sdk_err}")

    api_key = _cursor_api_key()
    if not api_key:
        raise SystemExit(
            "error: CURSOR_API_KEY is required to launch the setup agent "
            "(set it in the environment or .env)"
        )

    _patch_cursor_sdk_windows_bridge()

    from cursor_sdk import Agent, AgentOptions, CursorAgentError, LocalAgentOptions

    # Keep real stdout/stderr until Agent.create finishes — cursor-sdk's Windows
    # bridge discovery uses select() and breaks when stdio is redirected early.
    print(f"\n  Launching setup adapter (model={model}) in multitask mode…")
    try:
        with Agent.create(
            AgentOptions(
                model=model,
                api_key=api_key,
                local=LocalAgentOptions(cwd=str(root)),
                name="harness-setup-project",
            ),
        ) as agent:
            _drive_setup_adapter_agent(agent, log_path)
    except CursorAgentError as exc:
        raise SystemExit(
            f"error: could not start setup agent — {exc.message} "
            f"(retryable={exc.is_retryable})"
        ) from exc


def _spawn_setup_adapter_agent(root: Path, model: str) -> tuple[subprocess.Popen[Any], Path]:
    """Start run-setup-agent in a background process (multitask / non-blocking)."""
    harness = Path(__file__).resolve()
    log_path = root / SETUP_AGENT_LOG
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(f"setup adapter log — model={model}\n", encoding="utf-8")
    cmd = [
        sys.executable,
        str(harness),
        "run-setup-agent",
        "--root",
        str(root),
        "--model",
        model,
        "--log",
        str(log_path),
    ]
    # Inherit stdout/stderr from the parent terminal — DEVNULL breaks cursor-sdk
    # bridge discovery on Windows (WinError 10038).
    proc = subprocess.Popen(
        cmd,
        cwd=str(root),
        stdin=subprocess.DEVNULL,
        start_new_session=sys.platform != "win32",
    )
    return proc, log_path


def _can_launch_setup_agent() -> tuple[bool, str]:
    if _cursor_sdk_import_error():
        return False, _cursor_sdk_import_error() or "cursor-sdk unavailable"
    if not _cursor_api_key():
        return False, "CURSOR_API_KEY is not set"
    return True, ""


def setup_project(
    root: Path,
    answers_path: Path | None = None,
    model: str | None = None,
    skip_agent_run: bool = False,
) -> None:
    """Interactive project setup: questionnaire → files → optional Cursor agent."""
    # 1. Collect answers (or reuse existing project_context.json)
    context, context_reused = _resolve_project_context(root, answers_path)

    json_path = root / "project_context.json"
    md_path = root / "docs" / "project_context.md"

    if context_reused:
        print("\n  [ok] Using existing project context")
        if not md_path.exists():
            md_path.parent.mkdir(parents=True, exist_ok=True)
            md_path.write_text(_project_context_md(context), encoding="utf-8")
            print(f"  [ok] Generated missing {md_path.relative_to(root)}")
    else:
        write_json(json_path, {"version": 1, "project_context": context})
        print(f"\n  [ok] Saved {json_path.relative_to(root)}")

        md_path.parent.mkdir(parents=True, exist_ok=True)
        md_path.write_text(_project_context_md(context), encoding="utf-8")
        print(f"  [ok] Saved {md_path.relative_to(root)}")

    # 4. Write adapter prompt and optionally launch via Cursor SDK (multitask)
    in_cursor = _detect_cursor(root)
    cursor_agent_path = root / ".cursor" / "agents" / "project-setup-adapter.md"
    selected_model: str | None = model

    if in_cursor and not skip_agent_run:
        selected_model = selected_model or _prompt_setup_model()

    if in_cursor:
        print("\n  Cursor detected — writing project-setup-adapter agent prompt…")
        cursor_agent_path.parent.mkdir(parents=True, exist_ok=True)
        cursor_agent_path.write_text(
            _cursor_agent_prompt(context, root, model=selected_model),
            encoding="utf-8",
        )
        print(f"  [ok] Wrote {cursor_agent_path.relative_to(root)}")

        agent_launched = False
        if not skip_agent_run and selected_model:
            can_launch, launch_reason = _can_launch_setup_agent()
            if can_launch:
                proc, agent_log = _spawn_setup_adapter_agent(root, selected_model)
                agent_launched = True
                print()
                print(f"  [ok] Launched setup adapter in multitask mode (pid {proc.pid})")
                print(f"  Model: {selected_model}")
                print("  Track progress in the Cursor Agents panel.")
                print(f"  Log: {agent_log.relative_to(root)}")
            elif launch_reason:
                print(f"\n  Note: agent not launched automatically ({launch_reason}).")

        if not agent_launched:
            print()
            print("  Next step in Cursor:")
            print("    Open the Agent panel and type:")
            print("      /multitask /project-setup-adapter run")
            print("  The agent will adapt AGENTS.md, conventions.md, skill stubs,")
            print("  role files, and init scripts to your project.")
    else:
        # Not in Cursor — write the prompt to a file the user can copy-paste
        adapter_path = root / "progress" / "cursor_setup_prompt.md"
        adapter_path.parent.mkdir(parents=True, exist_ok=True)
        adapter_path.write_text(
            _cursor_agent_prompt(context, root, model=selected_model),
            encoding="utf-8",
        )
        print(f"\n  [ok] Cursor not detected.")
        print(f"  [ok] Agent prompt saved to {adapter_path.relative_to(root)}")
        print()
        print("  ┌─────────────────────────────────────────────────────────────┐")
        print("  │  If you are using Cursor:                                   │")
        print("  │  1. Copy progress/cursor_setup_prompt.md into               │")
        print("  │     .cursor/agents/project-setup-adapter.md                 │")
        print("  │  2. Open the Agent panel and type:                          │")
        print("  │       /multitask /project-setup-adapter run                 │")
        print("  │                                                             │")
        print("  │  If you are using another AI editor or CLI agent:           │")
        print("  │  Paste the contents of progress/cursor_setup_prompt.md      │")
        print("  │  directly into the agent chat.                              │")
        print("  └─────────────────────────────────────────────────────────────┘")

    print()
    print("  Setup questionnaire complete.")
    print("  Run `python harness.py init` next if you haven't already.")
    print()


# ---------------------------------------------------------------------------
# Argument parser
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="harness.py",
        description="Disk-first multi-agent harness for Software Engineering projects.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=_dedent("""
        Examples:
          python harness.py init
          python harness.py setup-project
          python harness.py add-feature "Build login flow" --notes "Email/password auth"
          python harness.py add-feature "Fix broken modal" --class bug
          python harness.py validate
          python harness.py emit-prompts
          python harness.py status
          python harness.py add-agent "implementer-ml" --desc "ML pipeline work" \\
              --skills ".agents/skills/python/SKILL.md,.agents/skills/ml/SKILL.md"
        """),
    )
    parser.add_argument(
        "--root",
        default=".",
        metavar="DIR",
        help="Project root directory (default: current directory)",
    )

    sub = parser.add_subparsers(dest="command", required=True, metavar="<command>")

    # init
    p_init = sub.add_parser("init", help="Bootstrap all harness scaffold files")
    p_init.set_defaults(func=cmd_init)

    # setup-project
    p_setup = sub.add_parser(
        "setup-project",
        help=(
            "Interactive Q&A: capture project context, write project_context files, "
            "and emit a Cursor agent prompt that adapts all harness files to the project"
        ),
    )
    p_setup.add_argument(
        "--answers",
        metavar="FILE",
        help="Load questionnaire answers from a JSON file instead of prompting interactively",
    )
    p_setup.add_argument(
        "--model",
        metavar="ID",
        help="Model ID for the setup adapter agent (prompts interactively when omitted)",
    )
    p_setup.add_argument(
        "--no-run-agent",
        action="store_true",
        help="Write the adapter agent file only; do not launch it via the Cursor SDK",
    )
    p_setup.set_defaults(func=cmd_setup_project)

    # run-setup-agent (background worker for setup-project multitask launch)
    p_run_setup = sub.add_parser(
        "run-setup-agent",
        help="Launch project-setup-adapter via Cursor SDK (used internally by setup-project)",
    )
    p_run_setup.add_argument(
        "--model",
        required=True,
        metavar="ID",
        help="Model ID for the setup adapter agent",
    )
    p_run_setup.add_argument(
        "--root",
        default=".",
        metavar="DIR",
        help="Project root directory (default: current directory)",
    )
    p_run_setup.add_argument(
        "--log",
        metavar="FILE",
        help="Append stdout/stderr to this log file (used by setup-project background worker)",
    )
    p_run_setup.set_defaults(func=cmd_run_setup_agent)

    # validate
    p_validate = sub.add_parser("validate", help="Validate feature_list.json schema")
    p_validate.set_defaults(func=cmd_validate)

    # add-feature
    p_add = sub.add_parser("add-feature", help="Append a new pending feature")
    p_add.add_argument("title", help="Short feature title")
    p_add.add_argument("--notes", default="", help="Free-form context")
    p_add.add_argument(
        "--class",
        dest="klass",
        default="feature",
        choices=sorted(ALLOWED_CLASS),
        help="Row class: feature (default) or bug",
    )
    p_add.set_defaults(func=cmd_add_feature)

    # emit-prompts
    p_emit = sub.add_parser(
        "emit-prompts",
        help="Print one ready-to-paste agent prompt per active lane",
    )
    p_emit.set_defaults(func=cmd_emit_prompts)

    # status
    p_status = sub.add_parser("status", help="Summarize feature progress in terminal")
    p_status.set_defaults(func=cmd_status)

    # add-agent
    p_agent = sub.add_parser(
        "add-agent",
        help="Register a new agent role and emit its .cursor/agents/<name>.md",
    )
    p_agent.add_argument("name", help="Role name (e.g. implementer-ml)")
    p_agent.add_argument("--desc", required=True, help="One-line role description")
    p_agent.add_argument(
        "--skills",
        default="",
        metavar="PATH,...",
        help="Comma-separated SKILL.md paths (e.g. .agents/skills/ml/SKILL.md)",
    )
    p_agent.set_defaults(func=cmd_agent)

    return parser


def cmd_agent(args: argparse.Namespace) -> None:
    cmd_add_agent(args)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
    except SystemExit:
        raise
    except KeyboardInterrupt:
        print("\nInterrupted.", file=sys.stderr)
        sys.exit(130)
    except Exception as exc:  # pragma: no cover
        import traceback

        traceback.print_exc()
        print(f"unexpected error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()