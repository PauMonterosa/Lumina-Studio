import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(process.cwd());
const APP_PATH = path.join(ROOT, "src", "App.jsx");

function die(message) {
  console.error("\nERROR:", message);
  process.exit(1);
}

if (!fs.existsSync(APP_PATH)) {
  die("No encuentro src/App.jsx. Ejecuta este instalador desde la raíz de Lumina.");
}

let source = fs.readFileSync(APP_PATH, "utf8");

// New semester gets clean localStorage keys.
// Old semester data remains stored under the old keys; it is not deleted.
source = source.replace(
  /const DIARY_STORAGE_KEY\s*=\s*"[^"]+";/,
  'const DIARY_STORAGE_KEY = "lumina-studio-diary-notes-2026-q1";'
);
source = source.replace(
  /const AGENDA_STORAGE_KEY\s*=\s*"[^"]+";/,
  'const AGENDA_STORAGE_KEY = "lumina-studio-agenda-2026-q1";'
);
source = source.replace(
  /const GRADES_STORAGE_KEY\s*=\s*"[^"]+";/,
  'const GRADES_STORAGE_KEY = "lumina-studio-grades-2026-q1";'
);

const subjectsBlock = `const ASIGNATURAS = [
  { id: "nanotechnologies", name: "Nanotechnologies", icon: Boxes },
  { id: "quantum_technologies", name: "Quantum Technologies", icon: Atom },
  { id: "microelectronics_design", name: "Microelectronics Design", icon: Cpu },
  { id: "cpia", name: "CPIA", icon: Activity },
  { id: "biophotonics", name: "Biophotonics", icon: SunMedium },
];`;

const subjectsRegex =
  /const\s+ASIGNATURAS\s*=\s*\[[\s\S]*?\]\s*;/m;

if (!subjectsRegex.test(source)) {
  die("No encuentro el bloque ASIGNATURAS de src/App.jsx.");
}

source = source.replace(subjectsRegex, subjectsBlock);

if (!source.includes("LUMINA_DEEP_LINKS_V1")) {
  const anchor =
    '  const [studyResult, setStudyResult] = useState(null);';

  if (!source.includes(anchor)) {
    die("No encuentro el punto donde añadir los accesos rápidos de la mascota.");
  }

  const deepLink = `${anchor}

  // LUMINA_DEEP_LINKS_V1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const workspace = params.get("workspace");
    const subject = params.get("subject");

    if (workspace && WORKSPACES[workspace]) {
      setActiveWorkspace(workspace);
    }

    if (
      subject &&
      ASIGNATURAS.some((item) => item.id === subject)
    ) {
      setActiveSubject(subject);
    }
  }, []);`;

  source = source.replace(anchor, deepLink);
  console.log("✓ Accesos rápidos de la mascota añadidos");
} else {
  console.log("✓ Accesos rápidos ya instalados");
}

fs.writeFileSync(APP_PATH, source, "utf8");

const subjects = [
  "nanotechnologies",
  "quantum_technologies",
  "microelectronics_design",
  "cpia",
  "biophotonics",
];

for (const subject of subjects) {
  fs.mkdirSync(
    path.join(ROOT, "notes", "daily", subject),
    { recursive: true }
  );

  fs.mkdirSync(
    path.join(ROOT, "library", "pdfs", subject),
    { recursive: true }
  );
}

console.log("✓ Asignaturas del nuevo cuadrimestre instaladas");
console.log("✓ Carpetas de apuntes y biblioteca creadas");
console.log("✓ Los datos antiguos de Agenda/Notas/Calificaciones NO se han borrado");

const psScript = path.join(
  ROOT,
  "desktop_pet",
  "install-startup.ps1"
);

if (process.platform === "win32" && fs.existsSync(psScript)) {
  console.log("\nInstalando Lumina Llama en el inicio de Windows...");

  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      psScript,
    ],
    {
      cwd: ROOT,
      stdio: "inherit",
      windowsHide: false,
    }
  );

  if (result.status !== 0) {
    console.warn(
      "\nAVISO: las asignaturas están actualizadas, pero Windows no pudo crear el acceso de inicio."
    );
    console.warn(
      "Puedes ejecutarlo manualmente con:"
    );
    console.warn(
      "powershell -ExecutionPolicy Bypass -File .\\desktop_pet\\install-startup.ps1"
    );
  }
}

console.log(`
========================================
 LUMINA · SEMESTRE + DESKTOP LLAMA V1
========================================

Asignaturas:
- Nanotechnologies
- Quantum Technologies
- Microelectronics Design
- CPIA
- Biophotonics

Comprueba:
  npm.cmd run build

Después:
  npm.cmd run notes
  npm.cmd run dev

La llama:
- clic: abre Lumina en Estudio/Chat
- arrastrar: mover por pantalla
- clic derecho: accesos rápidos
- punto verde: frontend + backend activos
- punto ámbar: solo uno activo
- punto gris: Lumina apagado

La mascota intentará arrancar Lumina y Ollama automáticamente cuando hagas clic.
`);
