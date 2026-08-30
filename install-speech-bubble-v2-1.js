import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const TARGET = path.join(ROOT, "desktop_pet", "lumina_llama.py");
const SOURCE = path.join(ROOT, "speech_bubble_update", "lumina_llama.py");
const BACKUP = path.join(ROOT, "desktop_pet", "lumina_llama_before_speech_bubble.py");

function die(message) {
  console.error("\nERROR:", message);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  die("No encuentro desktop_pet/lumina_llama.py. Instala primero la mascota Mini-Chat V2.");
}

if (!fs.existsSync(SOURCE)) {
  die("No encuentro speech_bubble_update/lumina_llama.py. Descomprime todo el ZIP en la raíz de Lumina.");
}

if (!fs.existsSync(BACKUP)) {
  fs.copyFileSync(TARGET, BACKUP);
  console.log("✓ Backup creado");
}

fs.copyFileSync(SOURCE, TARGET);
console.log("✓ Bocadillo compacto instalado");

console.log(`
====================================
 LUMINA SPEECH BUBBLE V2.1 INSTALADO
====================================

No se ha tocado el diseño de tu llama ni el backend.

Ahora:
1. Clic derecho en la mascota actual -> Salir.
2. Abre de nuevo Lumina Llama desde el Escritorio.
3. Haz clic sobre ella.

El chat aparecerá como un bocadillo compacto unido a la mascota.
`);
