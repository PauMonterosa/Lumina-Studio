// Lumina Studio · Bibliography + PPTX V1.1 repair installer
// Safe/idempotent update for V1 installations that stopped while patching ChatAsignatura.jsx.
// Run from the root of Lumina-Studio:
//   node .\install-bibliography-v1-1.js

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const INSTALLER_DIR = path.dirname(fileURLToPath(import.meta.url));
const PATCH_DIR = path.join(INSTALLER_DIR, "patch");
const MARKER = "LUMINA_BIBLIOGRAPHY_V1";

function projectPath(relative) {
  return path.join(ROOT, ...relative.split("/"));
}

function read(relative) {
  return fs.readFileSync(projectPath(relative), "utf8");
}

function requireFile(relative) {
  if (!fs.existsSync(projectPath(relative))) {
    throw new Error(`No encuentro ${relative}. Ejecuta este instalador desde la raíz de Lumina Studio.`);
  }
}

function addMarker(text) {
  return text.includes(`// ${MARKER}`) ? text : `// ${MARKER}\n${text}`;
}

function addNamedImportToLucide(text, name, label) {
  if (new RegExp(`\\b${name}\\b`).test(text.slice(0, text.indexOf('from "lucide-react"') + 30))) {
    return text;
  }
  const importEnd = text.indexOf('} from "lucide-react";');
  if (importEnd < 0) throw new Error(`No he encontrado el import de lucide-react en ${label}.`);
  return text.slice(0, importEnd) + `  ${name},\n` + text.slice(importEnd);
}

function insertAfterLineContaining(text, needle, addition, label, { optional = false } = {}) {
  if (text.includes(addition.trim())) return text;
  const idx = text.indexOf(needle);
  if (idx < 0) {
    if (optional) return text;
    throw new Error(`No he encontrado el punto de integración: ${label}.`);
  }
  const lineEnd = text.indexOf("\n", idx);
  if (lineEnd < 0) {
    if (optional) return text;
    throw new Error(`No he encontrado el final de línea: ${label}.`);
  }
  return text.slice(0, lineEnd + 1) + addition + text.slice(lineEnd + 1);
}

function insertBefore(text, needle, addition, label, { optional = false } = {}) {
  if (text.includes(addition.trim())) return text;
  const idx = text.indexOf(needle);
  if (idx < 0) {
    if (optional) return text;
    throw new Error(`No he encontrado el punto de integración: ${label}.`);
  }
  return text.slice(0, idx) + addition + text.slice(idx);
}

function insertBeforeLineContaining(text, needle, addition, label, { optional = false } = {}) {
  if (text.includes(addition.trim())) return text;
  const idx = text.indexOf(needle);
  if (idx < 0) {
    if (optional) return text;
    throw new Error(`No he encontrado el punto de integración: ${label}.`);
  }
  const lineStart = text.lastIndexOf("\n", idx) + 1;
  return text.slice(0, lineStart) + addition + text.slice(lineStart);
}

function ensureFunctionProp(text, functionName, propLine, propName, label) {
  const startNeedle = `export default function ${functionName}({`;
  const start = text.indexOf(startNeedle);
  if (start < 0) throw new Error(`No encuentro la cabecera de ${functionName} en ${label}.`);
  const close = text.indexOf("}) {", start);
  if (close < 0) throw new Error(`No encuentro el final de props de ${functionName} en ${label}.`);
  const header = text.slice(start, close);
  if (new RegExp(`\\b${propName}\\b`).test(header)) return text;
  const before = text.slice(0, close);
  const after = text.slice(close);
  const indentMatch = header.match(/\n([ \t]+)[A-Za-z_$][\w$]*[^\n]*,?\s*$/);
  const indent = indentMatch?.[1] || "  ";
  return before + `${indent}${propLine}\n` + after;
}

function ensureObjectFieldAfter(text, anchor, fieldText, fieldName, label) {
  // Check a small neighborhood around the anchor so a same-named variable elsewhere does not fool us.
  const idx = text.indexOf(anchor);
  if (idx < 0) throw new Error(`No he encontrado ${label}.`);
  const neighborhood = text.slice(idx, idx + 500);
  if (new RegExp(`\\b${fieldName}\\s*,`).test(neighborhood)) return text;
  const lineEnd = text.indexOf("\n", idx);
  return text.slice(0, lineEnd + 1) + fieldText + text.slice(lineEnd + 1);
}

function transformApp(input) {
  let text = input.replace(/\r\n/g, "\n");

  // If V1 already completed App.jsx before the previous failure, do not duplicate it.
  const alreadyIntegrated =
    text.includes('label: "Bibliografía"') &&
    text.includes('const [activeReference, setActiveReference]') &&
    text.includes('<Bibliography') &&
    text.includes('activeReference={activeReference}');
  if (alreadyIntegrated) return addMarker(text);

  text = addNamedImportToLucide(text, "Library", "App.jsx");

  if (!text.includes('import Bibliography from "./components/Bibliography";')) {
    text = insertAfterLineContaining(
      text,
      'import AcademicPlanner from "./components/AcademicPlanner";',
      'import Bibliography from "./components/Bibliography";\n',
      "App.jsx · import Bibliography"
    );
  }

  if (!text.includes('label: "Bibliografía"')) {
    const plannerBlock = `  planner: {\n    label: "Agenda",\n    description: "Eventos, entregas y diario",\n    icon: CalendarDays,\n  },\n`;
    const idx = text.indexOf(plannerBlock);
    if (idx < 0) throw new Error("No he encontrado WORKSPACES.planner en App.jsx.");
    const end = idx + plannerBlock.length;
    text = text.slice(0, end) + `  bibliography: {\n    label: "Bibliografía",\n    description: "Libros, papers y presentaciones por asignatura",\n    icon: Library,\n  },\n` + text.slice(end);
  }

  if (!text.includes('const [activeReference, setActiveReference]')) {
    text = insertAfterLineContaining(
      text,
      'const [studyResult, setStudyResult] = useState(null);',
      '  const [activeReference, setActiveReference] = useState(null);\n',
      "App.jsx · state activeReference"
    );
  }

  if (!text.includes("const openReferenceInNotes")) {
    const anchor = '  const handleWorkspaceChange = (workspaceId) => {';
    text = insertBefore(
      text,
      anchor,
      `  const openReferenceInNotes = (document) => {\n    if (!document) return;\n    if (document.subject && ASIGNATURAS.some((item) => item.id === document.subject)) {\n      setActiveSubject(document.subject);\n    }\n    setActiveReference({\n      ...document,\n      slide: document.kind === "pptx" ? Number(document.slide || 1) : undefined,\n    });\n    setActiveWorkspace("notes");\n  };\n\n`,
      "App.jsx · openReferenceInNotes"
    );
  }

  if (!text.includes('activeWorkspace === "bibliography"')) {
    text = insertBefore(
      text,
      '    if (activeWorkspace === "grades") {',
      `    if (activeWorkspace === "bibliography") {\n      return {\n        icon: Library,\n        title: \`Bibliografía · \${activeSubjectData?.name || activeSubject}\`,\n        subtitle: "Libros, papers y presentaciones disponibles para Lumina AI",\n        badge: "Biblioteca",\n      };\n    }\n\n`,
      "App.jsx · header Bibliografía"
    );
  }

  // Chat prop: target only the ChatAsignatura component block.
  if (!text.includes('activeReference={activeReference}')) {
    const chatStart = text.indexOf("<ChatAsignatura");
    if (chatStart < 0) throw new Error("No encuentro <ChatAsignatura en App.jsx.");
    const chatEnd = text.indexOf("/>", chatStart);
    if (chatEnd < 0) throw new Error("No encuentro el cierre de <ChatAsignatura en App.jsx.");
    const block = text.slice(chatStart, chatEnd);
    const langIdx = block.lastIndexOf("languageName=");
    if (langIdx < 0) throw new Error("No encuentro languageName en <ChatAsignatura de App.jsx.");
    const absoluteLang = chatStart + langIdx;
    const lineEnd = text.indexOf("\n", absoluteLang);
    text = text.slice(0, lineEnd + 1) + "                  activeReference={activeReference}\n" + text.slice(lineEnd + 1);
  }

  // LatexNotebook props
  if (!text.includes('onActiveReferenceChange={setActiveReference}')) {
    const noteStart = text.indexOf("<LatexNotebook");
    if (noteStart < 0) throw new Error("No encuentro <LatexNotebook en App.jsx.");
    const noteEnd = text.indexOf("/>", noteStart);
    const anchorIdx = text.indexOf("onNotePresenceChange=", noteStart);
    if (anchorIdx < 0 || anchorIdx > noteEnd) throw new Error("No encuentro onNotePresenceChange en <LatexNotebook de App.jsx.");
    const lineEnd = text.indexOf("\n", anchorIdx);
    text = text.slice(0, lineEnd + 1) + "          activeReference={activeReference}\n          onActiveReferenceChange={setActiveReference}\n" + text.slice(lineEnd + 1);
  }

  if (!text.includes('activeWorkspace === "bibliography" &&')) {
    text = insertBefore(
      text,
      '      {activeWorkspace === "planner" && (',
      `      {activeWorkspace === "bibliography" && (\n        <Bibliography\n          subjects={ASIGNATURAS}\n          activeSubject={activeSubject}\n          onSubjectChange={handleSubjectChange}\n          onOpenInNotes={openReferenceInNotes}\n        />\n      )}\n\n`,
      "App.jsx · render Bibliography"
    );
  }

  if (text.includes("V5.1")) text = text.replace("V5.1", "V5.2");
  return addMarker(text);
}

function transformChat(input) {
  let text = input.replace(/\r\n/g, "\n");

  text = ensureFunctionProp(
    text,
    "ChatAsignatura",
    "activeReference = null,",
    "activeReference",
    "ChatAsignatura.jsx"
  );

  if (!text.includes("                    activeReference,")) {
    text = ensureObjectFieldAfter(
      text,
      "                    diaryNotes: contextNotes,",
      "                    activeReference,\n",
      "activeReference",
      "ChatAsignatura.jsx · body contextual"
    );
  }

  // Cosmetic status line. It is intentionally non-fatal if the local UI has changed.
  if (!text.includes("Referència:") && !text.includes("Referencia: {activeReference.title}")) {
    const contextIdx = text.indexOf("Contexto activo:");
    if (contextIdx >= 0) {
      const pEnd = text.indexOf("</p>", contextIdx);
      if (pEnd >= 0) {
        const insertAt = pEnd + 4;
        const addition = `\n                        {activeReference?.title && (\n                            <p className="mt-1 truncate text-xs text-cyan-300">\n                                Referencia: {activeReference.title}\n                                {activeReference.kind === "pptx" && activeReference.slide\n                                    ? \` · diap. \${activeReference.slide}\`\n                                    : ""}\n                            </p>\n                        )}`;
        text = text.slice(0, insertAt) + addition + text.slice(insertAt);
      }
    }
  }

  return addMarker(text);
}

function transformLatexNotebook(input) {
  let text = input.replace(/\r\n/g, "\n");

  const integrated =
    text.includes('import ReferencePanel from "./ReferencePanel";') &&
    text.includes("referenceOpen") &&
    text.includes("<ReferencePanel") &&
    text.includes("onActiveReferenceChange");
  if (integrated) return addMarker(text);

  text = addNamedImportToLucide(text, "Library", "LatexNotebook.jsx");

  if (!text.includes('import ReferencePanel from "./ReferencePanel";')) {
    text = insertAfterLineContaining(
      text,
      'import { useEffect, useRef, useState } from "react";',
      'import ReferencePanel from "./ReferencePanel";\n',
      "LatexNotebook.jsx · import ReferencePanel"
    );
  }

  text = ensureFunctionProp(text, "LatexNotebook", "activeReference,", "activeReference", "LatexNotebook.jsx");
  text = ensureFunctionProp(text, "LatexNotebook", "onActiveReferenceChange,", "onActiveReferenceChange", "LatexNotebook.jsx");

  if (!text.includes("const [referenceOpen, setReferenceOpen]")) {
    text = insertAfterLineContaining(
      text,
      "const [autoCompile, setAutoCompile] = useState(true);",
      "  const [referenceOpen, setReferenceOpen] = useState(Boolean(activeReference));\n",
      "LatexNotebook.jsx · state referenceOpen"
    );
  }

  if (!text.includes("setReferenceOpen(true);")) {
    text = insertBeforeLineContaining(
      text,
      "const readApiJson = async",
      `  useEffect(() => {\n    if (activeReference?.id) {\n      setReferenceOpen(true);\n    }\n  }, [activeReference?.id]);\n\n`,
      "LatexNotebook.jsx · auto-open reference"
    );
  }

  if (!text.includes('title="Abrir bibliografía junto a los apuntes"')) {
    const toolbar = '<div className="mt-4 flex flex-wrap gap-2">';
    const idx = text.indexOf(toolbar);
    if (idx < 0) throw new Error("No encuentro la barra de snippets en LatexNotebook.jsx.");
    const insertAt = idx + toolbar.length;
    const button = `\n              <button\n                type="button"\n                onClick={() => setReferenceOpen((value) => !value)}\n                className={\`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition \${\n                  referenceOpen\n                    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"\n                    : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-cyan-400/25 hover:text-cyan-200"\n                }\`}\n                title="Abrir bibliografía junto a los apuntes"\n              >\n                <Library size={13} />\n                Referencia\n                {activeReference?.title && (\n                  <span className="ml-1 max-w-28 truncate text-[10px] text-cyan-300/80">\n                    {activeReference.title}\n                  </span>\n                )}\n              </button>\n`;
    text = text.slice(0, insertAt) + button + text.slice(insertAt);
  }

  if (!text.includes("<ReferencePanel")) {
    const mainClose = text.lastIndexOf("    </main>");
    if (mainClose < 0) throw new Error("No encuentro el cierre </main> de LatexNotebook.jsx.");
    const drawer = `      {referenceOpen && (\n        <div className="fixed right-4 top-[170px] z-50 h-[calc(100vh-190px)] w-[min(540px,calc(100vw-2rem))] min-w-[340px]">\n          <ReferencePanel\n            activeSubject={activeSubject}\n            activeReference={activeReference}\n            onActiveReferenceChange={onActiveReferenceChange}\n            onClose={() => setReferenceOpen(false)}\n          />\n        </div>\n      )}\n\n`;
    text = text.slice(0, mainClose) + drawer + text.slice(mainClose);
  }

  return addMarker(text);
}

function insertAfterHybridCall(text, addition) {
  if (text.includes("const pptxRagContext =")) return text;
  const start = text.indexOf("const hybridRagContext = await retrieveHybridRagContext({");
  if (start < 0) throw new Error("No encuentro la llamada a retrieveHybridRagContext en notesServer.js.");
  const close = text.indexOf("});", start);
  if (close < 0) throw new Error("No encuentro el cierre de retrieveHybridRagContext en notesServer.js.");
  const lineEnd = text.indexOf("\n", close);
  return text.slice(0, lineEnd + 1) + addition + text.slice(lineEnd + 1);
}

function transformNotesServer(input) {
  let text = input.replace(/\r\n/g, "\n");

  const alreadyIntegrated =
    text.includes('from "./documentLibraryRoutes.js"') &&
    text.includes("registerDocumentLibraryRoutes(app);") &&
    text.includes("const pptxRagContext =") &&
    text.includes("const activeReferenceContext =") &&
    text.includes("if (pptxRagContext)") &&
    text.includes("if (activeReferenceContext)");
  if (alreadyIntegrated) return addMarker(text);

  if (!text.includes('from "./documentLibraryRoutes.js"')) {
    text = insertAfterLineContaining(
      text,
      'import { registerHybridRagRoutes, retrieveHybridRagContext } from "./hybridRagRoutes.js";',
      'import {\n    registerDocumentLibraryRoutes,\n    retrievePptxRagContext,\n    getActiveReferenceContext,\n} from "./documentLibraryRoutes.js";\n',
      "notesServer.js · import document library"
    );
  }

  if (!text.includes("registerDocumentLibraryRoutes(app);")) {
    text = insertBefore(
      text,
      "registerHybridRagRoutes(app);",
      "registerDocumentLibraryRoutes(app);\n\n",
      "notesServer.js · register library routes"
    );
  }

  // Add activeReference to /api/chat/contextual destructuring only if missing in that route.
  const routeStart = text.indexOf('app.post("/api/chat/contextual"');
  if (routeStart < 0) throw new Error("No encuentro /api/chat/contextual en notesServer.js.");
  const routeSlice = text.slice(routeStart, routeStart + 2500);
  if (!/\bactiveReference\s*=/.test(routeSlice)) {
    const diaryIdx = text.indexOf("diaryNotes = [],", routeStart);
    if (diaryIdx < 0) throw new Error("No encuentro diaryNotes en /api/chat/contextual.");
    const lineEnd = text.indexOf("\n", diaryIdx);
    const indent = (text.slice(text.lastIndexOf("\n", diaryIdx) + 1, diaryIdx).match(/^\s*/) || [""])[0];
    text = text.slice(0, lineEnd + 1) + `${indent}activeReference = null,\n` + text.slice(lineEnd + 1);
  }

  text = insertAfterHybridCall(
    text,
    `\n        const pptxRagContext = await retrievePptxRagContext({\n            query: question,\n            subject,\n            topK: 5,\n            maxChars: 4800,\n        }).catch(() => "");\n\n        const activeReferenceContext = await getActiveReferenceContext({\n            activeReference,\n            subject,\n        }).catch(() => "");\n`
  );

  const hybridIfIdx = text.indexOf("if (hybridRagContext) {");
  if (hybridIfIdx < 0) throw new Error("No encuentro el bloque if (hybridRagContext) en notesServer.js.");
  const hybridLineStart = text.lastIndexOf("\n", hybridIfIdx) + 1;
  const hybridIndent = text.slice(hybridLineStart, hybridIfIdx);

  if (!text.includes("if (activeReferenceContext)")) {
    const addition = `${hybridIndent}if (activeReferenceContext) {\n${hybridIndent}    systemPrompt += \`\\n\\n\${activeReferenceContext}\`;\n${hybridIndent}}\n\n`;
    text = text.slice(0, hybridLineStart) + addition + text.slice(hybridLineStart);
  }

  if (!text.includes("if (pptxRagContext)")) {
    const refreshedHybridIdx = text.indexOf("if (hybridRagContext) {");
    const refreshedLineStart = text.lastIndexOf("\n", refreshedHybridIdx) + 1;
    const refreshedIndent = text.slice(refreshedLineStart, refreshedHybridIdx);
    const hybridCloseBrace = text.indexOf(`\n${refreshedIndent}}`, refreshedHybridIdx);
    if (hybridCloseBrace < 0) throw new Error("No encuentro el cierre del bloque if (hybridRagContext) en notesServer.js.");
    const hybridCloseLineEnd = text.indexOf("\n", hybridCloseBrace + 1);
    const insertAt = hybridCloseLineEnd >= 0 ? hybridCloseLineEnd + 1 : text.length;
    const addition = `\n${refreshedIndent}if (pptxRagContext) {\n${refreshedIndent}    systemPrompt += \`\\n\\n\${pptxRagContext}\`;\n${refreshedIndent}}\n`;
    text = text.slice(0, insertAt) + addition + text.slice(insertAt);
  }

  return addMarker(text);
}

function transformGitignore(input) {
  let text = input.replace(/\r\n/g, "\n");
  if (!text.includes("library/presentations/")) {
    text += "\n# Lumina Bibliography · local/private presentations\nlibrary/presentations/\n";
  }
  return text;
}

async function copyPatchFiles() {
  const files = [
    "src/components/Bibliography.jsx",
    "src/components/ReferencePanel.jsx",
    "server/documentLibraryRoutes.js",
    "scientific/extractPptxLibrary.py",
    "scientific/convertPptxPreview.ps1",
  ];
  for (const relative of files) {
    const source = path.join(PATCH_DIR, ...relative.split("/"));
    if (!fs.existsSync(source)) throw new Error(`Falta ${relative} dentro del paquete.`);
    const target = projectPath(relative);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.copyFile(source, target);
  }
}

async function main() {
  const required = [
    "package.json",
    "src/App.jsx",
    "src/components/LatexNotebook.jsx",
    "src/components/ChatAsignatura.jsx",
    "server/notesServer.js",
    ".gitignore",
  ];
  required.forEach(requireFile);

  // Compute every edit first. If one transformation fails, no primary source file is modified.
  const transformed = {
    "src/App.jsx": transformApp(read("src/App.jsx")),
    "src/components/ChatAsignatura.jsx": transformChat(read("src/components/ChatAsignatura.jsx")),
    "src/components/LatexNotebook.jsx": transformLatexNotebook(read("src/components/LatexNotebook.jsx")),
    "server/notesServer.js": transformNotesServer(read("server/notesServer.js")),
    ".gitignore": transformGitignore(read(".gitignore")),
  };

  const backupRoot = projectPath(
    `.lumina/backups/bibliography-v1-1-${new Date().toISOString().replace(/[:.]/g, "-")}`
  );
  fs.mkdirSync(backupRoot, { recursive: true });

  for (const relative of Object.keys(transformed)) {
    const source = projectPath(relative);
    const target = path.join(backupRoot, ...relative.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }

  await copyPatchFiles();

  for (const [relative, content] of Object.entries(transformed)) {
    const target = projectPath(relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
  }

  console.log("\nLumina Bibliography + PPTX V1.1 instalada/reparada.\n");
  console.log("Esta versión acepta una instalación V1 parcialmente aplicada y no depende del formato exacto de ChatAsignatura.jsx.");
  console.log(`\nBackup local: ${backupRoot}`);
  console.log("\nComprueba ahora:");
  console.log("  node --check .\\server\\documentLibraryRoutes.js");
  console.log("  node --check .\\server\\notesServer.js");
  console.log("  python .\\scientific\\extractPptxLibrary.py --help");
  console.log("  npm.cmd run build");
  console.log("\nSi todo pasa, reinicia:");
  console.log("  npm.cmd run notes");
  console.log("  npm.cmd run dev");
}

main().catch((error) => {
  console.error("\nINSTALACIÓN CANCELADA:\n" + (error.message || error));
  console.error("\nV1.1 calcula primero todos los cambios: si falla antes del backup/escritura, no toca los archivos principales.");
  process.exit(1);
});
