import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const patchRoot = path.join(root, "patch");
const referencePath = path.join(root, "src", "components", "ReferencePanel.jsx");
const notebookPath = path.join(root, "src", "components", "LatexNotebook.jsx");
const patchReferencePath = path.join(patchRoot, "src", "components", "ReferencePanel.jsx");

function fail(message) {
  console.error(`\nINSTALACIÓN CANCELADA:\n${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(referencePath)) {
  fail("No existe src/components/ReferencePanel.jsx. Instala primero Bibliography + PPTX V1.1.");
}

if (!fs.existsSync(notebookPath)) {
  fail("No existe src/components/LatexNotebook.jsx.");
}

if (!fs.existsSync(patchReferencePath)) {
  fail("Falta patch/src/components/ReferencePanel.jsx en este paquete.");
}

const currentReference = fs.readFileSync(referencePath, "utf8");
if (!currentReference.includes("LUMINA_BIBLIOGRAPHY_V1")) {
  fail("ReferencePanel.jsx no parece pertenecer a Lumina Bibliography V1/V1.1. No se ha sobrescrito.");
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(root, ".lumina", "backups", `bibliography-window-v1-2-${stamp}`);
fs.mkdirSync(path.join(backupDir, "src", "components"), { recursive: true });
fs.copyFileSync(referencePath, path.join(backupDir, "src", "components", "ReferencePanel.jsx"));
fs.copyFileSync(notebookPath, path.join(backupDir, "src", "components", "LatexNotebook.jsx"));

let notebook = fs.readFileSync(notebookPath, "utf8");

// La V1.1 envolvía ReferencePanel en un div fixed. V1.2 hace que la propia ventana
// gestione su posición, por lo que eliminamos la caja invisible del wrapper.
if (!notebook.includes('className="contents"')) {
  const wrapperPattern = /<div\s+className="fixed right-4 top-\[170px\][^"]*">\s*(?=<ReferencePanel\b)/m;
  if (wrapperPattern.test(notebook)) {
    notebook = notebook.replace(wrapperPattern, '<div className="contents">\n          ');
  } else {
    const fallbackPattern = /<div\s+className="[^"]*fixed[^"]*"\s*>\s*(?=<ReferencePanel\b)/m;
    if (fallbackPattern.test(notebook)) {
      notebook = notebook.replace(fallbackPattern, '<div className="contents">\n          ');
    } else {
      console.warn("AVISO: no se encontró el wrapper fixed de ReferencePanel. Se actualizará igualmente el panel; revisa si queda una zona transparente bloqueando clics.");
    }
  }
}

const nextReference = fs.readFileSync(patchReferencePath, "utf8");

fs.writeFileSync(referencePath, nextReference, "utf8");
fs.writeFileSync(notebookPath, notebook, "utf8");

console.log("\nLumina Bibliography Window V1.2 instalada.\n");
console.log("Añadido:");
console.log("- Arrastrar la ventana desde la barra superior");
console.log("- Redimensionar desde la esquina inferior derecha");
console.log("- Maximizar/restaurar");
console.log("- Acoplar a la derecha");
console.log("- Recordar posición y tamaño en localStorage");
console.log("- Mantener parte de la ventana visible si se arrastra hacia fuera");
console.log(`\nBackup: ${path.relative(root, backupDir)}`);
console.log("\nAhora ejecuta: npm.cmd run build\n");
