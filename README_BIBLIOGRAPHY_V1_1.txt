LUMINA STUDIO · BIBLIOGRAPHY + PPTX V1.1
=========================================

Esta versión corrige el instalador V1 cuando se detuvo con:

  ChatAsignatura.jsx · prop activeReference

V1.1 es idempotente y admite una instalación V1 parcialmente aplicada.
No necesitas restaurar el backup anterior antes de usarla.

INSTALACIÓN / REPARACIÓN
------------------------
1. Copia/descomprime TODO el contenido de este ZIP en la raíz actual de
   Lumina Studio. Debes ver junto a package.json:

   install-bibliography-v1-1.js
   patch/

2. Abre PowerShell en la raíz de Lumina.

3. Ejecuta SOLO el instalador nuevo:

   node .\install-bibliography-v1-1.js

   No vuelvas a ejecutar install-bibliography-v1.js.

4. Si termina con:

   Lumina Bibliography + PPTX V1.1 instalada/reparada.

   comprueba:

   node --check .\server\documentLibraryRoutes.js
   node --check .\server\notesServer.js
   python .\scientific\extractPptxLibrary.py --help
   npm.cmd run build

5. Si el build termina bien, reinicia servicios:

   npm.cmd run notes
   npm.cmd run dev

QUÉ HACE V1.1
-------------
- Reutiliza cualquier parte de V1 que ya se instaló correctamente.
- Completa solo los puntos de integración que falten.
- Tolera cambios locales y finales de línea Windows CRLF.
- Calcula las modificaciones antes de escribir los archivos principales.
- Crea un nuevo backup en:

  .lumina/backups/bibliography-v1-1-...

FUNCIONES DE LA ACTUALIZACIÓN
-----------------------------
- Nuevo workspace Bibliografía.
- PDFs y PPTX por asignatura.
- Extracción de texto de PPTX por diapositiva.
- Extracción de speaker notes cuando existen.
- RAG de presentaciones para Lumina AI.
- Contexto prioritario de la referencia que el usuario tiene abierta.
- Panel Referencia dentro del cuaderno LaTeX.
- Vista de la presentación mientras se toman apuntes.
- Preview visual opcional de PPTX mediante Microsoft PowerPoint en Windows.

PRIVACIDAD
----------
La biblioteca académica es local. Los PPTX quedan bajo library/presentations/
y esa ruta se añade a .gitignore. Los PDFs siguen usando la biblioteca local
existente.
