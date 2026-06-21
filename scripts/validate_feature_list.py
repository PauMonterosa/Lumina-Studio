#!/usr/bin/env python3
"""Thin wrapper: validates feature_list.json by delegating to harness.py."""
from pathlib import Path
import subprocess, sys

root = Path(__file__).resolve().parent.parent
raise SystemExit(
    subprocess.call([sys.executable, str(root / "harness.py"), "validate"])
)
