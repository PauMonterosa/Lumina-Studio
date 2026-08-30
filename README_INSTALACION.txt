LUMINA · NUEVO CUADRIMESTRE + DESKTOP LLAMA V1
================================================

1. Descomprime este ZIP dentro de la raíz de Lumina Studio.

2. Ejecuta:

   node .\install-semester-and-llama.js

El instalador:
- cambia las asignaturas;
- usa nuevas claves localStorage para empezar el cuadrimestre limpio;
- NO borra los datos del cuadrimestre anterior;
- crea las nuevas carpetas notes/daily;
- crea las nuevas carpetas library/pdfs;
- añade deep links ?workspace=...;
- instala Lumina Llama en el inicio de Windows;
- crea un acceso directo en el Escritorio;
- lanza la mascota.

3. Comprueba:

   npm.cmd run build

4. Inicia Lumina normalmente si quieres:

   npm.cmd run notes
   npm.cmd run dev

Aunque Lumina esté apagado, al pulsar la mascota intentará arrancar:
- Ollama
- backend de Lumina
- frontend Vite

ASIGNATURAS NUEVAS
------------------
nanotechnologies       → Nanotechnologies
quantum_technologies   → Quantum Technologies
microelectronics_design → Microelectronics Design
cpia                   → CPIA
biophotonics           → Biophotonics

MASCOTA
-------
Clic izquierdo:
abre Lumina / Estudio.

Arrastrar:
mueve la llama.

Clic derecho:
- Chat / Estudio
- Apuntes
- Agenda
- Calificaciones
- Biblioteca PDF
- Reiniciar servicios
- Salir

Indicador:
verde = frontend + backend
ámbar = uno de los dos
gris = Lumina apagado

HEDRA
-----
La V1 usa el icono actual de la llama de Lumina para probar toda la
infraestructura sin depender de servicios externos.

Abre:
desktop_pet/HEDRA_ASSET_GUIDE.txt

Ahí está el prompt/especificación para generar el personaje final con Hedra.
Después sustituiremos los frames sin rehacer la app de escritorio.
