import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const TARGET = path.join(ROOT, "desktop_pet", "assets");
const SOURCE = path.join(ROOT, "mascot_update", "assets");
const BACKUP = path.join(ROOT, "desktop_pet", "assets_backup_before_v3");

function die(message) {
  console.error("\nERROR:", message);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  die("No encuentro desktop_pet/assets. Instala primero Lumina Llama Mini-Chat V2.");
}

if (!fs.existsSync(SOURCE)) {
  die("No encuentro mascot_update/assets. Descomprime todo el ZIP en la raíz de Lumina.");
}

fs.mkdirSync(BACKUP, { recursive: true });

const files = [
  "llama_idle_0.png",
  "llama_idle_1.png",
  "lumina_llama.ico",
];

for (const file of files) {
  const current = path.join(TARGET, file);
  const backup = path.join(BACKUP, file);
  const incoming = path.join(SOURCE, file);

  if (fs.existsSync(current) && !fs.existsSync(backup)) {
    fs.copyFileSync(current, backup);
  }

  fs.copyFileSync(incoming, current);
  console.log(`✓ ${file}`);
}

const master = path.join(SOURCE, "lumina_llama_master.png");
if (fs.existsSync(master)) {
  fs.copyFileSync(
    master,
    path.join(TARGET, "lumina_llama_master_v3.png")
  );
}

console.log(`
================================
 NUEVA MASCOTA LUMINA INSTALADA
================================

Se ha sustituido únicamente el aspecto visual.
El mini-chat V2, menús y comportamiento siguen intactos.

Backup del diseño anterior:
desktop_pet/assets_backup_before_v3/

Ahora:
1. Clic derecho en la mascota actual → Salir.
2. Abre de nuevo "Lumina Llama" desde el Escritorio.

Si Windows sigue mostrando el icono anterior en el acceso directo,
normalmente se actualiza al reiniciar Explorer o volver a iniciar sesión.
`);
