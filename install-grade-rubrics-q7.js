import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const SOURCE = path.join(
  ROOT,
  "grade_rubrics_update",
  "GradeTracker.jsx"
);
const TARGET = path.join(
  ROOT,
  "src",
  "components",
  "GradeTracker.jsx"
);
const BACKUP = path.join(
  ROOT,
  "src",
  "components",
  "GradeTracker.before-q7-rubrics.jsx"
);

function die(message) {
  console.error("\nERROR:", message);
  process.exit(1);
}

if (!fs.existsSync(SOURCE)) {
  die(
    "No encuentro grade_rubrics_update/GradeTracker.jsx. Descomprime todo el ZIP en la raíz de Lumina."
  );
}

if (!fs.existsSync(TARGET)) {
  die(
    "No encuentro src/components/GradeTracker.jsx."
  );
}

if (!fs.existsSync(BACKUP)) {
  fs.copyFileSync(TARGET, BACKUP);
  console.log(
    "✓ Backup creado: src/components/GradeTracker.before-q7-rubrics.jsx"
  );
}

fs.copyFileSync(SOURCE, TARGET);

console.log(`
====================================
 CALIFICACIONES Q7 · RÚBRICAS V1
====================================

GradeTracker actualizado.

Las rúbricas quedan precargadas automáticamente cuando una asignatura
todavía no tiene un gradeBook guardado.

Comprueba:
  npm.cmd run build

No se modifica ni borra ninguna nota que ya estuviera guardada.
`);
