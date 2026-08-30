import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(process.cwd());
const SERVER_PATH = path.join(
  ROOT,
  "server",
  "notesServer.js"
);
const ROUTE_PATH = path.join(
  ROOT,
  "server",
  "notebookScientificPlotRoutes.js"
);
const PYTHON_SCRIPT = path.join(
  ROOT,
  "scientific",
  "notebookScientificPlot.py"
);
const GITIGNORE_PATH = path.join(
  ROOT,
  ".gitignore"
);

const IMPORT_LINE =
  'import { registerNotebookScientificPlotRoutes } from "./notebookScientificPlotRoutes.js";';

function die(message) {
  console.error(
    `\nERROR: ${message}`
  );
  process.exit(1);
}

function patchNotesServer() {
  if (
    !fs.existsSync(
      SERVER_PATH
    )
  ) {
    die(
      "No encuentro server/notesServer.js. Ejecuta este instalador desde la raíz de Lumina Studio."
    );
  }

  let source = fs.readFileSync(
    SERVER_PATH,
    "utf8"
  );

  if (
    !source.includes(
      IMPORT_LINE
    )
  ) {
    const imports = [
      ...source.matchAll(
        /^import .*;$/gm
      ),
    ];

    const lastImport =
      imports.at(-1);

    if (!lastImport) {
      die(
        "No encuentro los imports de notesServer.js."
      );
    }

    const insertionIndex =
      lastImport.index +
      lastImport[0].length;

    source =
      source.slice(
        0,
        insertionIndex
      ) +
      `\n${IMPORT_LINE}` +
      source.slice(
        insertionIndex
      );

    console.log(
      "✓ Import de gráficas científicas añadido"
    );
  } else {
    console.log(
      "✓ Import de gráficas científicas ya presente"
    );
  }

  if (
    !source.includes(
      "registerNotebookScientificPlotRoutes(app"
    )
  ) {
    const middlewareRegex =
      /app\.use\(\s*express\.json\(\s*\{\s*limit:\s*["']6mb["']\s*\}\s*\)\s*\)\s*;/m;

    const match =
      source.match(
        middlewareRegex
      );

    if (!match) {
      die(
        "No encuentro app.use(express.json(...)) en notesServer.js."
      );
    }

    const registration = `

registerNotebookScientificPlotRoutes(app, {
    model: STUDY_MODEL,
    ollamaUrl: OLLAMA_URL,
});`;

    source = source.replace(
      match[0],
      match[0] +
        registration
    );

    console.log(
      "✓ Rutas de gráficas científicas registradas"
    );
  } else {
    console.log(
      "✓ Rutas de gráficas científicas ya registradas"
    );
  }

  fs.writeFileSync(
    SERVER_PATH,
    source,
    "utf8"
  );
}

function getPythonPath() {
  if (
    process.env.LUMINA_PYTHON
  ) {
    return process.env
      .LUMINA_PYTHON;
  }

  const candidate =
    process.platform ===
    "win32"
      ? path.join(
          ROOT,
          ".venv",
          "Scripts",
          "python.exe"
        )
      : path.join(
          ROOT,
          ".venv",
          "bin",
          "python"
        );

  return candidate;
}

function checkPython() {
  const python =
    getPythonPath();

  if (
    !fs.existsSync(python)
  ) {
    die(
      "No encuentro .venv. Instala primero Lumina Scientific Engine o crea el entorno Python local."
    );
  }

  const dependencyCheck =
    spawnSync(
      python,
      [
        "-c",
        "import sympy,numpy,matplotlib,scipy; print('ok')",
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        windowsHide: true,
      }
    );

  if (
    dependencyCheck.status !==
    0
  ) {
    console.log(
      "\nInstalando dependencias de gráficas..."
    );

    const install =
      spawnSync(
        python,
        [
          "-m",
          "pip",
          "install",
          "sympy>=1.13,<2",
          "numpy>=2,<3",
          "matplotlib>=3.9,<4",
          "scipy>=1.14,<2",
        ],
        {
          cwd: ROOT,
          stdio: "inherit",
          windowsHide: true,
        }
      );

    if (
      install.status !== 0
    ) {
      die(
        "No se pudieron instalar SymPy, NumPy, SciPy y Matplotlib."
      );
    }
  } else {
    console.log(
      "✓ SymPy, NumPy, SciPy y Matplotlib disponibles"
    );
  }

  const health =
    spawnSync(
      python,
      [
        PYTHON_SCRIPT,
      ],
      {
        cwd: ROOT,
        input: JSON.stringify({
          operation:
            "health",
        }),
        encoding: "utf8",
        windowsHide: true,
      }
    );

  if (
    health.status !== 0
  ) {
    die(
      health.stderr ||
        "El motor de gráficas no supera el test de salud."
    );
  }

  try {
    const data =
      JSON.parse(
        health.stdout ||
          "{}"
      );

    if (!data.ok) {
      die(
        data.error ||
          "El motor de gráficas no está disponible."
      );
    }

    console.log(
      `✓ Motor de gráficas ${data.version} · ${data.types.length} tipos`
    );
  } catch {
    die(
      "La prueba Python no devolvió JSON válido."
    );
  }
}

function updateGitignore() {
  let source =
    fs.existsSync(
      GITIGNORE_PATH
    )
      ? fs.readFileSync(
          GITIGNORE_PATH,
          "utf8"
        )
      : "";

  const required = [
    ".venv/",
    "notes/media/",
  ];

  const currentLines =
    source.split(
      /\r?\n/
    );

  for (
    const line of required
  ) {
    if (
      !currentLines.includes(
        line
      )
    ) {
      if (
        source &&
        !source.endsWith(
          "\n"
        )
      ) {
        source += "\n";
      }

      source += `${line}\n`;
    }
  }

  fs.writeFileSync(
    GITIGNORE_PATH,
    source,
    "utf8"
  );

  console.log(
    "✓ .gitignore comprobado"
  );
}

function checkFiles() {
  const required = [
    ROUTE_PATH,
    PYTHON_SCRIPT,
    path.join(
      ROOT,
      "src",
      "components",
      "LatexNotebook.jsx"
    ),
  ];

  for (
    const file of required
  ) {
    if (
      !fs.existsSync(file)
    ) {
      die(
        `Falta ${path.relative(ROOT, file)}. Descomprime el ZIP completo en la raíz de Lumina.`
      );
    }
  }
}

checkFiles();
patchNotesServer();
updateGitignore();
checkPython();

console.log(`
==========================================
 LUMINA · GRÁFICAS EXACTAS V1 INSTALADAS
==========================================

Comprobaciones:

  node --check .\\server\\notebookScientificPlotRoutes.js
  node --check .\\server\\notesServer.js
  npm.cmd run build

Después reinicia:

  npm.cmd run notes
  npm.cmd run dev

En Apuntes aparecerá:

  Gráfica exacta

Prueba:

  Representa y = exp(-x)*sin(4*x) entre 0 y 10.
  Título: Respuesta amortiguada.
  Eje x: tiempo (s). Eje y: amplitud.
`);
