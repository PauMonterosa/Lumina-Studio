#!/usr/bin/env python3
"""Print one agent prompt per active lane (multi-chat fallback)."""
from pathlib import Path
import subprocess, sys

root = Path(__file__).resolve().parent.parent
raise SystemExit(
    subprocess.call([sys.executable, str(root / "harness.py"), "emit-prompts"])
)
