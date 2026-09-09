// Lumina Studio · Bibliography + PPTX V1 installer
// Run from the root of Lumina-Studio: node .\install-bibliography-v1.js

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const PACK_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (m) => m.slice(1)));
const PATCH_DIR = path.join(PACK_DIR, "patch");
const MARKER = "LUMINA_BIBLIOGRAPHY_V1";

function projectPath(relative) {
  return path.join(ROOT, ...relative.split("/"));
}

function read(relative) {
  return fs.readFileSync(projectPath(relative), "utf8");
}

function write(relative, content) {
  const target = projectPath(relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function requireFile(relative) {
  if (!fs.existsSync(projectPath(relative))) {
    throw new Error(`No encuentro ${relative}. Ejecuta este instalador desde la raíz de Lumina Studio.`);
  }
}

function replaceOnce(text, needle, replacement, label) {
  const index = text.indexOf(needle);
  if (index < 0) {
    throw new Error(`No he encontrado el punto de integración: ${label}. No se ha sobrescrito ese archivo.`);
  }
  return text.slice(0, index) + replacement + text.slice(index + needle.length);
}

function insertAfter(text, needle, addition, label) {
  return replaceOnce(text, needle, needle + addition, label);
}

function insertBefore(text, needle, addition, label) {
  return replaceOnce(text, needle, addition + needle, label);
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

function patchApp() {
  const file = "src/App.jsx";
  let text = read(file);
  if (text.includes(`// ${MARKER}`)) return false;

  text = replaceOnce(
    text,
    "  Globe,\n  MessageSquare,",
    "  Globe,\n  Library,\n  MessageSquare,",
    "App.jsx · icono Library"
  );

  text = insertAfter(
    text,
    'import AcademicPlanner from "./components/AcademicPlanner";\n',
    'import Bibliography from "./components/Bibliography";\n',
    "App.jsx · import Bibliography"
  );

  text = insertAfter(
    text,
    "  planner: {\n    label: \"Agenda\",\n    description: \"Eventos, entregas y diario\",\n    icon: CalendarDays,\n  },\n",
    "  bibliography: {\n    label: \"Bibliografía\",\n    description: \"Libros, papers y presentaciones por asignatura\",\n    icon: Library,\n  },\n",
    "App.jsx · workspace Bibliografía"
  );

  text = insertAfter(
    text,
    '  const [studyResult, setStudyResult] = useState(null);\n',
    '  const [activeReference, setActiveReference] = useState(null);\n',
    "App.jsx · state activeReference"
  );

  text = replaceOnce(
    text,
    "  const openNotebookFromAgenda = (subjectId, dateKey) => {\n    setActiveSubject(subjectId);\n    setSelectedDateKey(dateKey);\n    setActiveWorkspace(\"notes\");\n  };\n",
    "  const openNotebookFromAgenda = (subjectId, dateKey) => {\n    setActiveSubject(subjectId);\n    setSelectedDateKey(dateKey);\n    setActiveWorkspace(\"notes\");\n  };\n\n  const openReferenceInNotes = (document) => {\n    if (!document) return;\n    if (document.subject && ASIGNATURAS.some((item) => item.id === document.subject)) {\n      setActiveSubject(document.subject);\n    }\n    setActiveReference({\n      ...document,\n      slide: document.kind === \"pptx\" ? Number(document.slide || 1) : undefined,\n    });\n    setActiveWorkspace(\"notes\");\n  };\n",
    "App.jsx · openReferenceInNotes"
  );

  text = replaceOnce(
    text,
    "    setActiveSubject(subjectId);\n    setChatInput(\"\");",
    "    setActiveSubject(subjectId);\n    setActiveReference((current) =>\n      current?.subject && current.subject !== subjectId ? null : current\n    );\n    setChatInput(\"\");",
    "App.jsx · limpiar referencia al cambiar asignatura"
  );

  text = insertBefore(
    text,
    "    if (activeWorkspace === \"grades\") {",
    "    if (activeWorkspace === \"bibliography\") {\n      return {\n        icon: Library,\n        title: `Bibliografía · ${activeSubjectData?.name || activeSubject}`,\n        subtitle: \"Libros, papers y presentaciones disponibles para Lumina AI\",\n        badge: \"Biblioteca\",\n      };\n    }\n\n",
    "App.jsx · header Bibliografía"
  );

  text = insertAfter(
    text,
    "                  languageName={activeLanguage.promptName}\n",
    "                  activeReference={activeReference}\n",
    "App.jsx · ChatAsignatura activeReference"
  );

  text = insertAfter(
    text,
    "          onNotePresenceChange={handleNotePresenceChange}\n",
    "          activeReference={activeReference}\n          onActiveReferenceChange={setActiveReference}\n",
    "App.jsx · LatexNotebook reference props"
  );

  text = insertBefore(
    text,
    '      {activeWorkspace === "planner" && (\n',
    '      {activeWorkspace === "bibliography" && (\n        <Bibliography\n          subjects={ASIGNATURAS}\n          activeSubject={activeSubject}\n          onSubjectChange={handleSubjectChange}\n          onOpenInNotes={openReferenceInNotes}\n        />\n      )}\n\n',
    "App.jsx · render Bibliography"
  );

  text = text.replace("V5.1", "V5.2");
  text = `// ${MARKER}\n${text}`;
  write(file, text);
  return true;
}

function patchChat() {
  const file = "src/components/ChatAsignatura.jsx";
  let text = read(file);
  if (text.includes(`// ${MARKER}`)) return false;

  text = replaceOnce(
    text,
    '    languageName = "castellano",\n}) {',
    '    languageName = "castellano",\n    activeReference = null,\n}) {',
    "ChatAsignatura.jsx · prop activeReference"
  );

  text = insertAfter(
    text,
    "                    diaryNotes: contextNotes,\n",
    "                    activeReference,\n",
    "ChatAsignatura.jsx · enviar activeReference"
  );

  text = insertAfter(
    text,
    "                        <p className=\"mt-1 text-xs text-slate-500\">\n                            Contexto activo: {contextNotes.length} notas de{\" \"}\n                            {activeSubjectName} · Idioma: {languageName}\n                        </p>\n",
    "                        {activeReference?.title && (\n                            <p className=\"mt-1 truncate text-xs text-cyan-300\">\n                                Referencia: {activeReference.title}\n                                {activeReference.kind === \"pptx\" && activeReference.slide\n                                    ? ` · diap. ${activeReference.slide}`\n                                    : \"\"}\n                            </p>\n                        )}\n",
    "ChatAsignatura.jsx · indicador referencia"
  );

  text = `// ${MARKER}\n${text}`;
  write(file, text);
  return true;
}

function patchLatexNotebook() {
  const file = "src/components/LatexNotebook.jsx";
  let text = read(file);
  if (text.includes(`// ${MARKER}`)) return false;

  text = replaceOnce(
    text,
    "  Loader2,\n  Play,",
    "  Loader2,\n  Library,\n  Play,",
    "LatexNotebook.jsx · icono Library"
  );

  text = insertAfter(
    text,
    'import { useEffect, useRef, useState } from "react";\n',
    'import ReferencePanel from "./ReferencePanel";\n',
    "LatexNotebook.jsx · import ReferencePanel"
  );

  text = replaceOnce(
    text,
    "  onSelectedDateChange,\n  onNotePresenceChange,\n}) {",
    "  onSelectedDateChange,\n  onNotePresenceChange,\n  activeReference,\n  onActiveReferenceChange,\n}) {",
    "LatexNotebook.jsx · props referencia"
  );

  text = insertAfter(
    text,
    "  const [autoCompile, setAutoCompile] = useState(true);\n",
    "  const [referenceOpen, setReferenceOpen] = useState(Boolean(activeReference));\n",
    "LatexNotebook.jsx · state referenceOpen"
  );

  text = insertBefore(
    text,
    "  const readApiJson = async (response, routeName) => {",
    "  useEffect(() => {\n    if (activeReference?.id) {\n      setReferenceOpen(true);\n    }\n  }, [activeReference?.id]);\n\n",
    "LatexNotebook.jsx · abrir panel con referencia"
  );

  text = insertAfter(
    text,
    '            <div className="mt-4 flex flex-wrap gap-2">\n',
    '              <button\n                type="button"\n                onClick={() => setReferenceOpen((value) => !value)}\n                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${\n                  referenceOpen\n                    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"\n                    : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-cyan-400/25 hover:text-cyan-200"\n                }`}\n                title="Abrir bibliografía junto a los apuntes"\n              >\n                <Library size={13} />\n                Referencia\n                {activeReference?.title && (\n                  <span className="ml-1 max-w-28 truncate text-[10px] text-cyan-300/80">\n                    {activeReference.title}\n                  </span>\n                )}\n              </button>\n\n',
    "LatexNotebook.jsx · botón Referencia"
  );

  const endNeedle = "      </div>\n    </main>\n  );\n}";
  const endIndex = text.lastIndexOf(endNeedle);
  if (endIndex < 0) {
    throw new Error("No he encontrado el final de LatexNotebook.jsx para insertar el panel de referencia.");
  }
  const drawer = `      </div>\n\n      {referenceOpen && (\n        <div className="fixed right-4 top-[170px] z-50 h-[calc(100vh-190px)] w-[min(540px,calc(100vw-2rem))] min-w-[340px]">\n          <ReferencePanel\n            activeSubject={activeSubject}\n            activeReference={activeReference}\n            onActiveReferenceChange={onActiveReferenceChange}\n            onClose={() => setReferenceOpen(false)}\n          />\n        </div>\n      )}\n`;
  text = text.slice(0, endIndex) + drawer + text.slice(endIndex + "      </div>\n".length);

  text = `// ${MARKER}\n${text}`;
  write(file, text);
  return true;
}

function patchNotesServer() {
  const file = "server/notesServer.js";
  let text = read(file);
  if (text.includes(`// ${MARKER}`)) return false;

  text = insertAfter(
    text,
    'import { registerHybridRagRoutes, retrieveHybridRagContext } from "./hybridRagRoutes.js";\n',
    'import {\n    registerDocumentLibraryRoutes,\n    retrievePptxRagContext,\n    getActiveReferenceContext,\n} from "./documentLibraryRoutes.js";\n',
    "notesServer.js · import document library"
  );

  text = insertBefore(
    text,
    "registerHybridRagRoutes(app);\n",
    "registerDocumentLibraryRoutes(app);\n\n",
    "notesServer.js · register library routes"
  );

  text = replaceOnce(
    text,
    "            diaryNotes = [],\n            messages = [],",
    "            diaryNotes = [],\n            activeReference = null,\n            messages = [],",
    "notesServer.js · activeReference body"
  );

  text = insertAfter(
    text,
    "        const hybridRagContext = await retrieveHybridRagContext({\n            query: question,\n            subject,\n            selectedDateKey,\n            topK: 6,\n            maxChars: 7200,\n        });\n",
    "\n        const pptxRagContext = await retrievePptxRagContext({\n            query: question,\n            subject,\n            topK: 5,\n            maxChars: 4800,\n        }).catch(() => \"\");\n\n        const activeReferenceContext = await getActiveReferenceContext({\n            activeReference,\n            subject,\n        }).catch(() => \"\");\n",
    "notesServer.js · recuperar PPTX y referencia activa"
  );

  text = insertBefore(
    text,
    "        if (hybridRagContext) {\n",
    "        if (activeReferenceContext) {\n            systemPrompt += `\\n\\n${activeReferenceContext}`;\n        }\n\n",
    "notesServer.js · active reference context"
  );

  text = insertAfter(
    text,
    "        if (hybridRagContext) {\n            systemPrompt += `\\n\\n${hybridRagContext}`;\n        }\n",
    "\n        if (pptxRagContext) {\n            systemPrompt += `\\n\\n${pptxRagContext}`;\n        }\n",
    "notesServer.js · PPTX context"
  );

  text = `// ${MARKER}\n${text}`;
  write(file, text);
  return true;
}

function patchGitignore() {
  const file = ".gitignore";
  let text = read(file);
  if (!text.includes("library/presentations/")) {
    text += "\n# Lumina Bibliography · local/private presentations\nlibrary/presentations/\n";
  }
  write(file, text);
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

  const backupRoot = projectPath(
    `.lumina/backups/bibliography-v1-${new Date().toISOString().replace(/[:.]/g, "-")}`
  );
  fs.mkdirSync(backupRoot, { recursive: true });
  for (const relative of required.slice(1)) {
    const source = projectPath(relative);
    const target = path.join(backupRoot, ...relative.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }

  await copyPatchFiles();

  const changed = [];
  if (patchApp()) changed.push("src/App.jsx");
  if (patchChat()) changed.push("src/components/ChatAsignatura.jsx");
  if (patchLatexNotebook()) changed.push("src/components/LatexNotebook.jsx");
  if (patchNotesServer()) changed.push("server/notesServer.js");
  patchGitignore();

  console.log("\nLumina Bibliography V1 instalada.\n");
  console.log("Nuevos archivos:");
  console.log("- src/components/Bibliography.jsx");
  console.log("- src/components/ReferencePanel.jsx");
  console.log("- server/documentLibraryRoutes.js");
  console.log("- scientific/extractPptxLibrary.py");
  console.log("- scientific/convertPptxPreview.ps1");
  if (changed.length) {
    console.log("\nIntegrados:");
    changed.forEach((file) => console.log(`- ${file}`));
  } else {
    console.log("\nLos archivos principales ya contenían la marca de Bibliography V1; no se duplicaron parches.");
  }
  console.log(`\nBackup local: ${backupRoot}`);
  console.log("\nAhora ejecuta:");
  console.log("  node --check .\\server\\documentLibraryRoutes.js");
  console.log("  npm.cmd run build");
  console.log("\nDespués reinicia el backend:");
  console.log("  npm.cmd run notes");
}

main().catch((error) => {
  console.error("\nINSTALACIÓN CANCELADA:\n" + (error.message || error));
  console.error("\nNo sigas con npm run build hasta revisar el mensaje anterior. Se creó un backup en .lumina/backups cuando fue posible.");
  process.exit(1);
});
