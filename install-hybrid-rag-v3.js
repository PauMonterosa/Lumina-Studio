import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(process.cwd());
const SERVER_PATH = path.join(
  ROOT,
  "server",
  "notesServer.js"
);

const EMBED_MODEL =
  "embeddinggemma:300m-qat-q4_0";

function die(message) {
  console.error("\nERROR:", message);
  process.exit(1);
}

function patchNotesServer() {
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
    'import { registerHybridRagRoutes, retrieveHybridRagContext } from "./hybridRagRoutes.js";';

  if (!source.includes(importLine)) {
    const imports = [
      ...source.matchAll(/^import .*;$/gm),
    ];

    const last = imports.at(-1);

    if (!last) {
      die(
        "No encuentro imports en notesServer.js."
      );
    }

    const index =
      last.index +
      last[0].length;

    source =
      source.slice(0, index) +
      `\n${importLine}` +
      source.slice(index);

    console.log(
      "✓ Import Hybrid RAG añadido"
    );
  } else {
    console.log(
      "✓ Import Hybrid RAG ya existente"
    );
  }

  if (
    !source.includes(
      "registerHybridRagRoutes(app);"
    )
  ) {
    const jsonRegex =
      /app\.use\(\s*express\.json\([^;]*\)\s*\)\s*;/m;

    const match =
      source.match(jsonRegex);

    if (!match) {
      die(
        "No encuentro app.use(express.json(...))."
      );
    }

    source = source.replace(
      match[0],
      `${match[0]}

registerHybridRagRoutes(app);`
    );

    console.log(
      "✓ Rutas Hybrid RAG registradas"
    );
  }

  if (
    !source.includes(
      "const hybridRagContext = await retrieveHybridRagContext"
    )
  ) {
    const questionRegex =
      /const\s+question\s*=\s*getLastUserQuestion\s*\(\s*messages\s*\)\s*;/m;

    const questionMatch =
      source.match(questionRegex);

    if (!questionMatch) {
      die(
        "No encuentro question en /api/chat/contextual."
      );
    }

    const block = `${questionMatch[0]}

        const hybridRagContext = await retrieveHybridRagContext({
            query: question,
            subject,
            selectedDateKey,
            topK: 6,
            maxChars: 7200,
        });`;

    source = source.replace(
      questionMatch[0],
      block
    );

    console.log(
      "✓ Hybrid RAG conectado a la pregunta"
    );
  }

  // Desactivar la inclusión antigua de RAG Lite/PDF RAG en el prompt.
  // Sus endpoints siguen existiendo; Hybrid RAG los usa internamente.
  const ragContextRegex =
    /const\s+ragContext\s*=\s*await\s+retrieveRagContext\s*\(\s*\{[\s\S]*?\}\s*\)\s*;/m;

  if (ragContextRegex.test(source)) {
    source = source.replace(
      ragContextRegex,
      'const ragContext = "";'
    );

    console.log(
      "✓ Contexto RAG Lite directo desactivado"
    );
  }

  const pdfContextRegex =
    /const\s+pdfRagContext\s*=\s*await\s+retrievePdfRagContext\s*\(\s*\{[\s\S]*?\}\s*\)\s*;/m;

  if (pdfContextRegex.test(source)) {
    source = source.replace(
      pdfContextRegex,
      'const pdfRagContext = "";'
    );

    console.log(
      "✓ Contexto PDF directo desactivado"
    );
  }

  const latexContextRegex =
    /const\s+latexContext\s*=\s*ragContext\s*\?\s*["']["']\s*:\s*await\s+readSubjectLatex\s*\(\s*subject\s*\)\s*;/m;

  if (latexContextRegex.test(source)) {
    source = source.replace(
      latexContextRegex,
      'const latexContext = hybridRagContext ? "" : await readSubjectLatex(subject);'
    );

    console.log(
      "✓ Contexto completo sustituido por Hybrid RAG"
    );
  }

  if (
    !source.includes(
      'systemPrompt += `\\n\\n${hybridRagContext}`'
    )
  ) {
    const systemRegex =
      /(const|let)\s+systemPrompt\s*=\s*buildChatSystemPrompt\s*\(\s*\{[\s\S]*?\}\s*\)\s*;/m;

    const match =
      source.match(systemRegex);

    if (!match) {
      die(
        "No encuentro buildChatSystemPrompt(...)."
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

        if (hybridRagContext) {
            systemPrompt += \`\\n\\n\${hybridRagContext}\`;
        }`
    );

    console.log(
      "✓ Contexto híbrido añadido al prompt"
    );
  }

  fs.writeFileSync(
    SERVER_PATH,
    source,
    "utf8"
  );
}

function hasOllama() {
  const result = spawnSync(
    "ollama",
    ["--version"],
    {
      cwd: ROOT,
      encoding: "utf8",
      windowsHide: true,
    }
  );

  return result.status === 0;
}

function modelInstalled() {
  const result = spawnSync(
    "ollama",
    ["list"],
    {
      cwd: ROOT,
      encoding: "utf8",
      windowsHide: true,
    }
  );

  if (result.status !== 0) {
    return false;
  }

  return String(
    result.stdout || ""
  ).includes(
    "embeddinggemma"
  );
}

function ensureEmbeddingModel() {
  if (!hasOllama()) {
    console.warn(
      "AVISO: Ollama no está disponible. Hybrid RAG funcionará en modo BM25 fallback."
    );
    return;
  }

  if (modelInstalled()) {
    console.log(
      "✓ EmbeddingGemma ya instalado"
    );
    return;
  }

  console.log(`
Descargando el embedding ligero:
  ${EMBED_MODEL}

Tamaño aproximado: 239 MB.
Solo se usa durante la búsqueda semántica y se descarga de memoria inmediatamente.
`);

  const result = spawnSync(
    "ollama",
    ["pull", EMBED_MODEL],
    {
      cwd: ROOT,
      stdio: "inherit",
      windowsHide: true,
    }
  );

  if (result.status !== 0) {
    console.warn(
      "AVISO: no se pudo descargar EmbeddingGemma. Hybrid RAG seguirá funcionando con BM25."
    );
  } else {
    console.log(
      "✓ EmbeddingGemma instalado"
    );
  }
}

patchNotesServer();
ensureEmbeddingModel();

console.log(`
==================================
 LUMINA HYBRID RAG V3 INSTALADO
==================================

Comprueba:
  node --check .\\server\\hybridRagRoutes.js
  node --check .\\server\\notesServer.js
  npm.cmd run build

Reinicia:
  npm.cmd run notes

Health:
  http://localhost:3001/api/rag/hybrid/health

Modo ECO:
- máximo 14 candidatos;
- embedding de 256 dimensiones;
- modelo q4 de ~239 MB;
- keep_alive = 0;
- Qwen recibe solo los 6 mejores fragmentos.
`);
