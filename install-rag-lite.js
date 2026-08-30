import fs from "node:fs";
import path from "node:path";

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
    "No encuentro server/notesServer.js. Ejecuta el instalador desde la raíz de Lumina."
  );
}

let source = fs.readFileSync(
  SERVER_PATH,
  "utf8"
);

const importLine =
  'import { registerRagRoutes, retrieveRagContext } from "./ragRoutes.js";';

if (!source.includes(importLine)) {
  const importMatches = [
    ...source.matchAll(/^import .*;$/gm),
  ];

  const lastImport =
    importMatches.at(-1);

  if (!lastImport) {
    die(
      "No encuentro los imports de notesServer.js."
    );
  }

  const index =
    lastImport.index +
    lastImport[0].length;

  source =
    source.slice(0, index) +
    `\n${importLine}` +
    source.slice(index);

  console.log("✓ Import RAG añadido");
} else {
  console.log("✓ Import RAG ya existente");
}

if (!source.includes("registerRagRoutes(app);")) {
  const appJsonRegex =
    /app\.use\(\s*express\.json\([^;]*\)\s*\)\s*;/m;

  const match =
    source.match(appJsonRegex);

  if (!match) {
    die(
      "No encuentro app.use(express.json(...))."
    );
  }

  source = source.replace(
    match[0],
    `${match[0]}\n\nregisterRagRoutes(app);`
  );

  console.log("✓ Ruta RAG registrada");
} else {
  console.log("✓ Ruta RAG ya registrada");
}

if (!source.includes("const ragContext = await retrieveRagContext")) {
  const questionRegex =
    /const\s+question\s*=\s*getLastUserQuestion\s*\(\s*messages\s*\)\s*;/m;

  const match =
    source.match(questionRegex);

  if (!match) {
    die(
      "No encuentro getLastUserQuestion(messages) en el chat contextual."
    );
  }

  const ragBlock = `${match[0]}

        const ragContext = await retrieveRagContext({
            query: question,
            subject,
            selectedDateKey,
            topK: 6,
            maxChars: 8500,
        });`;

  source = source.replace(
    match[0],
    ragBlock
  );

  console.log("✓ Recuperación RAG añadida al chat");
} else {
  console.log("✓ Recuperación RAG ya instalada");
}

// Si RAG encuentra contexto, evitamos cargar también el bloque completo de apuntes.
// Esto reduce tokens, latencia y carga del modelo.
if (
  source.includes(
    "const ragContext = await retrieveRagContext"
  ) &&
  !source.includes(
    'const latexContext = ragContext ? "" : await readSubjectLatex(subject);'
  )
) {
  const latexRegex =
    /const\s+latexContext\s*=\s*await\s+readSubjectLatex\s*\(\s*subject\s*\)\s*;/m;

  const match =
    source.match(latexRegex);

  if (match) {
    source = source.replace(
      match[0],
      'const latexContext = ragContext ? "" : await readSubjectLatex(subject);'
    );

    console.log(
      "✓ Contexto completo sustituido por RAG cuando hay coincidencias"
    );
  } else {
    console.warn(
      "AVISO: no he encontrado la lectura completa de latexContext. El RAG funcionará, pero quizá no reduzca tanto el prompt."
    );
  }
}

// Convertir systemPrompt a let y añadir RAG justo después de construirlo.
if (!source.includes("systemPrompt += `\\n\\n${ragContext}`")) {
  const systemRegex =
    /(const|let)\s+systemPrompt\s*=\s*buildChatSystemPrompt\s*\(\s*\{[\s\S]*?\}\s*\)\s*;/m;

  const match =
    source.match(systemRegex);

  if (!match) {
    die(
      "No encuentro buildChatSystemPrompt(...) en el chat contextual."
    );
  }

  const mutableBlock =
    match[0].replace(
      /^(const|let)\s+systemPrompt/,
      "let systemPrompt"
    );

  const replacement = `${mutableBlock}

        if (ragContext) {
            systemPrompt += \`\\n\\n\${ragContext}\`;
        }`;

  source = source.replace(
    match[0],
    replacement
  );

  console.log("✓ Contexto RAG conectado al prompt");
} else {
  console.log("✓ Contexto RAG ya conectado al prompt");
}

fs.writeFileSync(
  SERVER_PATH,
  source,
  "utf8"
);

console.log(`
================================
 LUMINA RAG LITE V1 INSTALADO
================================

No necesita ningún modelo adicional.

Comprueba:
  node --check .\\server\\ragRoutes.js
  node --check .\\server\\notesServer.js
  npm.cmd run build

Después reinicia:
  npm.cmd run notes

Health:
  http://localhost:3001/api/rag/health
`);
