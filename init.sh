#!/usr/bin/env bash
# Verification gate for Lumina Studio.
set -euo pipefail
cd "$(dirname "$0")"

has_npm_script() {
  local script_name="$1"
  python - "$script_name" <<'PY'
import json
import sys
from pathlib import Path

script = sys.argv[1]
package = Path("package.json")
if not package.exists():
    sys.exit(1)

data = json.loads(package.read_text(encoding="utf-8"))
sys.exit(0 if script in data.get("scripts", {}) else 1)
PY
}

run_npm_script_if_present() {
  local script_name="$1"
  local step="$2"

  if [[ ! -f package.json ]]; then
    echo "==> [$step] npm run $script_name (skipped: package.json not present)"
    return
  fi

  if has_npm_script "$script_name"; then
    echo "==> [$step] npm run $script_name"
    npm run "$script_name"
  else
    echo "==> [$step] npm run $script_name (skipped: script not present)"
  fi
}

echo "==> [1/5] Validate feature_list.json"
python harness.py validate

if [[ -f package-lock.json ]]; then
  echo "==> [2/5] Install Node dependencies"
  npm ci
else
  echo "==> [2/5] Install Node dependencies (skipped: package-lock.json not present)"
fi

run_npm_script_if_present "lint" "3/5"
run_npm_script_if_present "build" "4/5"
run_npm_script_if_present "test" "5/5"

echo ""
echo "==> All checks passed."
