import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(process.cwd());
const SERVER_PATH = path.join(ROOT, "server", "notesServer.js");
const CHAT_PATH = path.join(ROOT, "src", "components", "ChatAsignatura.jsx");
const MESSAGE_CONTENT_PATH = path.join(ROOT, "src", "components", "MessageContent.jsx");
const GITIGNORE_PATH = path.join(ROOT, ".gitignore");
const REQUIREMENTS_PATH = path.join(
  ROOT,
  "scientific",
  "requirements.txt"
);

function die(message) {
  console.error("\nERROR:", message);
  process.exit(1);
}

function patchNotesServer() {
  if (!fs.existsSync(SERVER_PATH)) {
    die("No encuentro server/notesServer.js. Ejecuta este instalador desde la raíz de Lumina.");
  }

  let source = fs.readFileSync(SERVER_PATH, "utf8");

  const importLine =
    'import { registerScientificRoutes, getScientificContext } from "./scientificRoutes.js";';

  if (!source.includes(importLine)) {
    const anchor =
      'import { registerGoogleCalendarBridgeRoutes } from "./googleCalendarBridgeRoutes.js";';

    if (source.includes(anchor)) {
      source = source.replace(
        anchor,
        `${anchor}\n${importLine}`
      );
    } else {
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
    }
  }

  if (!source.includes("registerScientificRoutes(app")) {
    const registerAnchor =
      "registerGoogleCalendarBridgeRoutes(app);";

    const block = `${registerAnchor}
registerScientificRoutes(app, {
    model: STUDY_MODEL,
    ollamaUrl: OLLAMA_URL,
    keepAlive: OLLAMA_KEEP_ALIVE,
});`;

    if (!source.includes(registerAnchor)) {
      die("No encuentro el registro de rutas de Google Calendar.");
    }

    source = source.replace(
      registerAnchor,
      block
    );
  }

  const hasStructuredScientificIntegration =
    source.includes("let scientificPlotUrl = null;");

  if (!hasStructuredScientificIntegration) {
    // Upgrade from V1.1 if it is already present.
    const oldV11Regex =
      /try\s*\{\s*const scientificContext = await getScientificContext\(\{[\s\S]*?console\.warn\(\s*"Scientific Engine:",\s*scientificError\.message\s*\);\s*\}\s*/m;

    if (oldV11Regex.test(source)) {
      source = source.replace(
        oldV11Regex,
        `let scientificPlotUrl = null;

        try {
            const scientific = await getScientificContext({
                question,
                subjectName: finalSubjectName,
                model,
                ollamaUrl: OLLAMA_URL,
                keepAlive: OLLAMA_KEEP_ALIVE,
            });

            if (scientific?.context) {
                systemPrompt += \`\\n\\n\${scientific.context}\`;
            }

            scientificPlotUrl = scientific?.plotUrl || null;
        } catch (scientificError) {
            console.warn(
                "Scientific Engine:",
                scientificError.message
            );
        }

        `
      );
      console.log("✓ Scientific Engine V1.1 actualizado a contexto estructurado");
    } else {
      // Fresh install: locate the systemPrompt block regardless of formatting.
      const systemPromptRegex =
        /const\s+systemPrompt\s*=\s*buildChatSystemPrompt\s*\(\s*\{[\s\S]*?\}\s*\)\s*;/m;

      const match = source.match(systemPromptRegex);

      if (!match) {
        die(
          "No encuentro la creación de systemPrompt en /api/chat/contextual."
        );
      }

      const originalBlock = match[0];
      const mutableBlock = originalBlock.replace(
        /^const\s+systemPrompt/,
        "let systemPrompt"
      );

      const scientificBlock = `

        let scientificPlotUrl = null;

        try {
            const scientific = await getScientificContext({
                question,
                subjectName: finalSubjectName,
                model,
                ollamaUrl: OLLAMA_URL,
                keepAlive: OLLAMA_KEEP_ALIVE,
            });

            if (scientific?.context) {
                systemPrompt += \`\\n\\n\${scientific.context}\`;
            }

            scientificPlotUrl = scientific?.plotUrl || null;
        } catch (scientificError) {
            console.warn(
                "Scientific Engine:",
                scientificError.message
            );
        }`;

      source = source.replace(
        originalBlock,
        mutableBlock + scientificBlock
      );

      console.log("✓ Scientific Engine conectado al chat contextual");
    }
  } else {
    console.log("✓ Contexto científico estructurado ya instalado");
  }

  if (!source.includes('type: "scientific_plot"')) {
    const streamLoopRegex =
      /for\s+await\s*\(\s*const\s+chunk\s+of\s+ollamaResponse\.body\s*\)\s*\{/m;

    const match = source.match(streamLoopRegex);

    if (!match) {
      die(
        "No encuentro el bucle que retransmite el stream de Ollama."
      );
    }

    const loopAnchor = match[0];

    const metadataBlock = `if (scientificPlotUrl) {
        res.write(
            JSON.stringify({
                lumina: {
                    type: "scientific_plot",
                    url: scientificPlotUrl,
                },
            }) + "\\n"
        );
    }

    ${loopAnchor}`;

    source = source.replace(
      loopAnchor,
      metadataBlock
    );

    console.log("✓ Canal scientific_plot añadido al stream");
  } else {
    console.log("✓ Canal scientific_plot ya estaba instalado");
  }


  fs.writeFileSync(
    SERVER_PATH,
    source,
    "utf8"
  );

  console.log("✓ server/notesServer.js integrado");
}


function patchChatFrontend() {
  if (!fs.existsSync(CHAT_PATH)) {
    die("No encuentro src/components/ChatAsignatura.jsx.");
  }

  let source = fs.readFileSync(CHAT_PATH, "utf8");

  // 1) Helper para asociar una gráfica al último mensaje del asistente.
  if (!source.includes("setLastAssistantScientificPlot")) {
    const sendMessageRegex =
      /(\s*)const\s+sendMessage\s*=\s*async\s*\(\s*\)\s*=>\s*\{/m;

    const match = source.match(sendMessageRegex);

    if (!match) {
      die("No encuentro sendMessage en ChatAsignatura.jsx.");
    }

    const indent = match[1] || "    ";

    const helper = `${indent}const setLastAssistantScientificPlot = (url) => {
${indent}    if (!url) return;

${indent}    setMessages((prev) => {
${indent}        const updated = [...prev];
${indent}        const lastIndex = updated.length - 1;

${indent}        if (lastIndex < 0) return prev;

${indent}        updated[lastIndex] = {
${indent}            ...updated[lastIndex],
${indent}            scientificPlotUrl: url,
${indent}        };

${indent}        return updated;
${indent}    });
${indent}};

`;

    source = source.replace(
      sendMessageRegex,
      helper + match[0]
    );

    console.log("✓ Helper de gráfica añadido al chat");
  } else {
    console.log("✓ Helper de gráfica ya estaba instalado");
  }

  // 2) Interceptar eventos estructurados scientific_plot del stream NDJSON.
  if (!source.includes('parsed?.lumina?.type === "scientific_plot"')) {
    const chunkRegex =
      /(\s*)const\s+chunk\s*=\s*parsed\?\.message\?\.content\s*\|\|\s*["']["']\s*;/m;

    const match = source.match(chunkRegex);

    if (!match) {
      die("No encuentro el parser de chunks de Ollama en ChatAsignatura.jsx.");
    }

    const indent = match[1] || "                    ";

    const metadataParser = `${indent}if (
${indent}    parsed?.lumina?.type === "scientific_plot" &&
${indent}    parsed?.lumina?.url
${indent}) {
${indent}    setLastAssistantScientificPlot(
${indent}        parsed.lumina.url
${indent}    );
${indent}    continue;
${indent}}

`;

    source = source.replace(
      chunkRegex,
      metadataParser + match[0]
    );

    console.log("✓ Parser scientific_plot añadido");
  } else {
    console.log("✓ Parser scientific_plot ya estaba instalado");
  }

  // 3) Renderizar la gráfica directamente debajo de MessageContent.
  if (!source.includes("message.scientificPlotUrl &&")) {
    const renderRegex =
      /(\s*)<MessageContent\s+content=\{message\.content\}\s*\/>/m;

    const match = source.match(renderRegex);

    if (!match) {
      die("No encuentro MessageContent en ChatAsignatura.jsx.");
    }

    const indent = match[1] || "                            ";

    const renderBlock = `${match[0]}

${indent}{message.scientificPlotUrl && (
${indent}    <figure className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/20">
${indent}        <img
${indent}            src={message.scientificPlotUrl}
${indent}            alt="Gráfica generada por Lumina Scientific Engine"
${indent}            className="block h-auto w-full bg-white"
${indent}            loading="lazy"
${indent}        />
${indent}        <figcaption className="border-t border-white/10 px-3 py-2 text-[10px] text-slate-500">
${indent}            Lumina Scientific Engine · Matplotlib
${indent}        </figcaption>
${indent}    </figure>
${indent})}`;

    source = source.replace(
      renderRegex,
      renderBlock
    );

    console.log("✓ Render de gráfica añadido al mensaje");
  } else {
    console.log("✓ Render de gráfica ya estaba instalado");
  }

  fs.writeFileSync(CHAT_PATH, source, "utf8");
  console.log("✓ Chat preparado para gráficas científicas estructuradas");
}

function patchMessageContent() {
  // La V1.2.2 ya no depende del render Markdown para las gráficas.
  // Las imágenes científicas se renderizan directamente en ChatAsignatura.
  console.log("✓ Render científico independiente de Markdown");
}

function updateGitignore() {
  let source = fs.existsSync(GITIGNORE_PATH)
    ? fs.readFileSync(GITIGNORE_PATH, "utf8")
    : "";

  const lines = [
    ".venv/",
    ".lumina/",
  ];

  for (const line of lines) {
    if (!source.split(/\r?\n/).includes(line)) {
      if (source && !source.endsWith("\n")) {
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

  console.log("✓ .gitignore actualizado");
}

function works(command, args = []) {
  const result = spawnSync(
    command,
    [...args, "-c", "import sys; print(sys.version_info[:2])"],
    {
      cwd: ROOT,
      encoding: "utf8",
      windowsHide: true,
    }
  );

  return result.status === 0;
}

function findBasePython() {
  if (process.env.LUMINA_PYTHON) {
    return {
      command: process.env.LUMINA_PYTHON,
      prefix: [],
    };
  }

  if (process.platform === "win32") {
    if (works("py", ["-3"])) {
      return {
        command: "py",
        prefix: ["-3"],
      };
    }

    if (works("python")) {
      return {
        command: "python",
        prefix: [],
      };
    }
  } else {
    if (works("python3")) {
      return {
        command: "python3",
        prefix: [],
      };
    }

    if (works("python")) {
      return {
        command: "python",
        prefix: [],
      };
    }
  }

  return null;
}

function venvPythonPath() {
  return process.platform === "win32"
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
}

function installPythonEnvironment() {
  const venvPython = venvPythonPath();

  if (!fs.existsSync(venvPython)) {
    const base = findBasePython();

    if (!base) {
      die(
        "No encuentro Python 3. Instala Python y vuelve a ejecutar el instalador."
      );
    }

    console.log("\nCreando .venv...");
    const create = spawnSync(
      base.command,
      [...base.prefix, "-m", "venv", ".venv"],
      {
        cwd: ROOT,
        stdio: "inherit",
        windowsHide: true,
      }
    );

    if (create.status !== 0) {
      die("No se pudo crear .venv.");
    }
  } else {
    console.log("✓ .venv ya existe");
  }

  console.log("\nInstalando SymPy, NumPy, SciPy y Matplotlib...");
  const install = spawnSync(
    venvPython,
    [
      "-m",
      "pip",
      "install",
      "-r",
      REQUIREMENTS_PATH,
    ],
    {
      cwd: ROOT,
      stdio: "inherit",
      windowsHide: true,
    }
  );

  if (install.status !== 0) {
    die("pip no pudo instalar las dependencias científicas.");
  }

  console.log("✓ dependencias Python instaladas");

  const health = spawnSync(
    venvPython,
    [
      path.join(
        ROOT,
        "scientific",
        "engine.py"
      ),
    ],
    {
      cwd: ROOT,
      input: JSON.stringify({
        operation: "health",
      }),
      encoding: "utf8",
      windowsHide: true,
    }
  );

  if (health.status !== 0) {
    die(
      health.stderr ||
        "El Scientific Engine no supera el test de salud."
    );
  }

  try {
    const data = JSON.parse(
      health.stdout || "{}"
    );

    if (!data.ok) {
      die(
        data.error ||
          "El test de salud ha fallado."
      );
    }

    console.log(
      `✓ Scientific Engine ${data.version} · Python ${data.python}`
    );
    console.log(
      `  SymPy ${data.sympy} · NumPy ${data.numpy} · SciPy ${data.scipy}`
    );
  } catch {
    die("La prueba Python no devolvió JSON válido.");
  }
}

patchNotesServer();
patchChatFrontend();
patchMessageContent();
updateGitignore();
installPythonEnvironment();

console.log(`
========================================
 LUMINA SCIENTIFIC ENGINE V1.2.2 INSTALADO
========================================

Ahora ejecuta:

  node --check .\\server\\scientificRoutes.js
  node --check .\\server\\notesServer.js
  npm.cmd run build

Después reinicia:

  npm.cmd run notes

y prueba en el chat:

  Resuelve x^2 - 5x + 6 = 0

o:

  Calcula la integral de sin(x)^2 entre 0 y pi

o:

  Representa sin(x) + 0.3*sin(5*x) entre -6.28 y 6.28
`);
