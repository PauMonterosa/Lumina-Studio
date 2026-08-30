import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(process.cwd());
const SERVER_PATH = path.join(ROOT, "server", "notesServer.js");
const GITIGNORE_PATH = path.join(ROOT, ".gitignore");

function die(message) {
  console.error("\nERROR:", message);
  process.exit(1);
}

function findPython() {
  const candidates =
    process.platform === "win32"
      ? [
          {
            command: path.join(
              ROOT,
              ".venv",
              "Scripts",
              "python.exe"
            ),
            prefix: [],
          },
          { command: "py", prefix: ["-3"] },
          { command: "python", prefix: [] },
        ]
      : [
          {
            command: path.join(
              ROOT,
              ".venv",
              "bin",
              "python"
            ),
            prefix: [],
          },
          { command: "python3", prefix: [] },
          { command: "python", prefix: [] },
        ];

  for (const candidate of candidates) {
    const test = spawnSync(
      candidate.command,
      [
        ...candidate.prefix,
        "-c",
        "import sys; print(sys.version)",
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        windowsHide: true,
      }
    );

    if (test.status === 0) {
      return candidate;
    }
  }

  return null;
}

function ensurePyMuPDF() {
  const python = findPython();

  if (!python) {
    die("No encuentro Python 3.");
  }

  const test = spawnSync(
    python.command,
    [
      ...python.prefix,
      "-c",
      "import fitz; print(fitz.VersionBind)",
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      windowsHide: true,
    }
  );

  if (test.status === 0) {
    console.log("✓ PyMuPDF ya instalado");
    return;
  }

  console.log("Instalando PyMuPDF...");

  const install = spawnSync(
    python.command,
    [
      ...python.prefix,
      "-m",
      "pip",
      "install",
      "pymupdf>=1.24,<2",
    ],
    {
      cwd: ROOT,
      stdio: "inherit",
      windowsHide: true,
    }
  );

  if (install.status !== 0) {
    die("No se pudo instalar PyMuPDF.");
  }

  console.log("✓ PyMuPDF instalado");
}

function patchServer() {
  if (!fs.existsSync(SERVER_PATH)) {
    die(
      "No encuentro server/notesServer.js. Ejecuta desde la raíz de Lumina."
    );
  }

  let source = fs.readFileSync(
    SERVER_PATH,
    "utf8"
  );

  const importLine =
    'import { registerPdfRagRoutes, retrievePdfRagContext } from "./pdfRagRoutes.js";';

  if (!source.includes(importLine)) {
    const imports = [
      ...source.matchAll(/^import .*;$/gm),
    ];

    const last = imports.at(-1);

    if (!last) {
      die("No encuentro los imports de notesServer.js.");
    }

    const index =
      last.index + last[0].length;

    source =
      source.slice(0, index) +
      `\n${importLine}` +
      source.slice(index);

    console.log("✓ Import PDF RAG añadido");
  } else {
    console.log("✓ Import PDF RAG ya existente");
  }

  if (!source.includes("registerPdfRagRoutes(app);")) {
    const jsonRegex =
      /app\.use\(\s*express\.json\([^;]*\)\s*\)\s*;/m;

    const match = source.match(jsonRegex);

    if (!match) {
      die(
        "No encuentro app.use(express.json(...))."
      );
    }

    source = source.replace(
      match[0],
      `${match[0]}\n\nregisterPdfRagRoutes(app);`
    );

    console.log("✓ Rutas PDF RAG registradas");
  } else {
    console.log("✓ Rutas PDF RAG ya registradas");
  }

  if (
    !source.includes(
      "const pdfRagContext = await retrievePdfRagContext"
    )
  ) {
    const ragAnchorRegex =
      /const\s+ragContext\s*=\s*await\s+retrieveRagContext\s*\(\s*\{[\s\S]*?\}\s*\)\s*;/m;

    const questionRegex =
      /const\s+question\s*=\s*getLastUserQuestion\s*\(\s*messages\s*\)\s*;/m;

    const ragMatch = source.match(ragAnchorRegex);

    if (ragMatch) {
      source = source.replace(
        ragMatch[0],
        `${ragMatch[0]}

        const pdfRagContext = await retrievePdfRagContext({
            query: question,
            subject,
            topK: 4,
            maxChars: 4300,
        });`
      );
    } else {
      const questionMatch = source.match(questionRegex);

      if (!questionMatch) {
        die(
          "No encuentro la pregunta actual del chat contextual."
        );
      }

      source = source.replace(
        questionMatch[0],
        `${questionMatch[0]}

        const pdfRagContext = await retrievePdfRagContext({
            query: question,
            subject,
            topK: 4,
            maxChars: 4300,
        });`
      );
    }

    console.log("✓ Recuperación desde PDFs añadida");
  } else {
    console.log("✓ Recuperación PDF ya instalada");
  }

  if (
    !source.includes(
      'systemPrompt += `\\n\\n${pdfRagContext}`'
    )
  ) {
    const systemRegex =
      /(const|let)\s+systemPrompt\s*=\s*buildChatSystemPrompt\s*\(\s*\{[\s\S]*?\}\s*\)\s*;/m;

    const match = source.match(systemRegex);

    if (!match) {
      die(
        "No encuentro buildChatSystemPrompt(...) en el chat."
      );
    }

    const mutable =
      match[0].replace(
        /^(const|let)\s+systemPrompt/,
        "let systemPrompt"
      );

    source = source.replace(
      match[0],
      `${mutable}

        if (pdfRagContext) {
            systemPrompt += \`\\n\\n\${pdfRagContext}\`;
        }`
    );

    console.log("✓ Contexto PDF conectado a Qwen");
  } else {
    console.log("✓ Contexto PDF ya conectado a Qwen");
  }

  fs.writeFileSync(
    SERVER_PATH,
    source,
    "utf8"
  );
}

function updateGitignore() {
  let source = fs.existsSync(GITIGNORE_PATH)
    ? fs.readFileSync(GITIGNORE_PATH, "utf8")
    : "";

  const entries = [
    "library/pdfs/",
    ".lumina/rag-pdf/",
  ];

  for (const entry of entries) {
    if (!source.split(/\r?\n/).includes(entry)) {
      if (source && !source.endsWith("\n")) {
        source += "\n";
      }
      source += `${entry}\n`;
    }
  }

  fs.writeFileSync(
    GITIGNORE_PATH,
    source,
    "utf8"
  );

  console.log("✓ PDFs y caché protegidos por .gitignore");
}

fs.mkdirSync(
  path.join(ROOT, "library", "pdfs"),
  { recursive: true }
);

ensurePyMuPDF();
patchServer();
updateGitignore();

console.log(`
=================================
 LUMINA PDF RAG V2 INSTALADO
=================================

Comprueba:
  node --check .\\server\\pdfRagRoutes.js
  node --check .\\server\\notesServer.js
  npm.cmd run build

Reinicia:
  npm.cmd run notes

Después abre:
  http://localhost:3001/rag-library

Ahí podrás añadir tus libros PDF.
`);
