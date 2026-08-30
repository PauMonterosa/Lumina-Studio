import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(process.cwd());
const SERVER_PATH = path.join(
  ROOT,
  "server",
  "notesServer.js"
);

function die(message) {
  console.error("\nERROR:", message);
  process.exit(1);
}

if (!fs.existsSync(SERVER_PATH)) {
  die(
    "No encuentro server/notesServer.js. Ejecuta desde la raíz de Lumina."
  );
}

let source = fs.readFileSync(
  SERVER_PATH,
  "utf8"
);

const subjectFilesBlock = `const SUBJECT_FILES = {
    nanotechnologies: "nanotechnologies.tex",
    quantum_technologies: "quantum_technologies.tex",
    microelectronics_design: "microelectronics_design.tex",
    cpia: "cpia.tex",
    biophotonics: "biophotonics.tex",
};`;

const subjectNamesBlock = `const SUBJECT_NAMES = {
    nanotechnologies: "Nanotechnologies",
    quantum_technologies: "Quantum Technologies",
    microelectronics_design: "Microelectronics Design",
    cpia: "CPIA",
    biophotonics: "Biophotonics",
};`;

const filesRegex =
  /const\s+SUBJECT_FILES\s*=\s*\{[\s\S]*?\}\s*;/m;

const namesRegex =
  /const\s+SUBJECT_NAMES\s*=\s*\{[\s\S]*?\}\s*;/m;

if (!filesRegex.test(source)) {
  die(
    "No encuentro SUBJECT_FILES en notesServer.js."
  );
}

if (!namesRegex.test(source)) {
  die(
    "No encuentro SUBJECT_NAMES en notesServer.js."
  );
}

source = source.replace(
  filesRegex,
  subjectFilesBlock
);

source = source.replace(
  namesRegex,
  subjectNamesBlock
);

fs.writeFileSync(
  SERVER_PATH,
  source,
  "utf8"
);

const subjectsDir = path.join(
  ROOT,
  "notes",
  "subjects"
);

fs.mkdirSync(
  subjectsDir,
  { recursive: true }
);

for (const filename of [
  "nanotechnologies.tex",
  "quantum_technologies.tex",
  "microelectronics_design.tex",
  "cpia.tex",
  "biophotonics.tex",
]) {
  const filePath = path.join(
    subjectsDir,
    filename
  );

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(
      filePath,
      "",
      "utf8"
    );
  }
}

console.log(
  "✓ Backend actualizado a las 5 asignaturas nuevas"
);
console.log(
  "✓ Archivos base de notes/subjects creados"
);

const startupScript = path.join(
  ROOT,
  "desktop_pet",
  "install-startup.ps1"
);

// If V1 was already installed, its shortcut points to the same Python file
// and automatically becomes V2 when that file is overwritten.
// We only run the startup installer on machines without the shortcut.
if (
  process.platform === "win32" &&
  fs.existsSync(startupScript)
) {
  const home =
    process.env.USERPROFILE ||
    process.env.HOME ||
    "";

  const desktopShortcut = path.join(
    home,
    "Desktop",
    "Lumina Llama.lnk"
  );

  if (!fs.existsSync(desktopShortcut)) {
    console.log(
      "No encuentro el acceso directo anterior. Instalando Lumina Llama..."
    );

    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        startupScript,
      ],
      {
        cwd: ROOT,
        stdio: "inherit",
        windowsHide: false,
      }
    );

    if (result.status !== 0) {
      console.warn(
        "AVISO: no he podido crear el acceso directo de la mascota."
      );
    }
  } else {
    console.log(
      "✓ El acceso directo existente reutilizará automáticamente la V2"
    );
  }
}

console.log(`
================================
 LUMINA LLAMA MINI-CHAT V2
================================

Listo.

Comprueba:
  node --check .\\server\\notesServer.js
  npm.cmd run build

Después cierra cualquier llama V1 que siga abierta
(clic derecho > Salir) y vuelve a abrir Lumina Llama.

Clic en la mascota = mini-chat local.
`);
