import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(process.cwd());
const script = path.join(ROOT, "install-q7-library.ps1");

if (process.platform !== "win32") {
  console.error("Este instalador está preparado para Windows/PowerShell.");
  process.exit(1);
}

const result = spawnSync(
  "powershell.exe",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
  { cwd: ROOT, stdio: "inherit", windowsHide: false }
);

process.exit(result.status ?? 1);
