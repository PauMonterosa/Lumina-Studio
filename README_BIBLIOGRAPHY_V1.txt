LUMINA STUDIO · BIBLIOGRAPHY + PPTX V1
======================================

QUÉ AÑADE
---------
1. Nuevo workspace "Bibliografía" dentro de Lumina.
2. Bibliografía separada por asignatura.
3. Soporte para:
   - PDF: libros, papers y apuntes.
   - PPTX: presentaciones / PowerPoints.
4. Los PDFs se guardan en la biblioteca PDF ya existente, por lo que mantienen
   el RAG actual de Lumina.
5. Los PPTX se guardan localmente en library/presentations/<asignatura>/ y se
   indexan por diapositiva usando un extractor Python sin dependencias nuevas.
6. El Tutor IA recibe fragmentos relevantes de las presentaciones y puede citar:
   [Fuente: Título, diap. N]
7. Si tienes una presentación abierta en el panel de Referencia, la diapositiva
   activa y las adyacentes se priorizan como contexto del Tutor.
8. En Apuntes aparece un botón "Referencia" que abre una ventana flotante para
   mantener un libro/PDF o una presentación junto al editor LaTeX.
9. Para PPTX:
   - siempre existe un visor textual por diapositivas;
   - si tienes Microsoft PowerPoint de escritorio en Windows, Lumina puede
     generar una vista previa PDF visual local del PowerPoint.
10. Se conservan las notas del profesor (speaker notes) cuando el PPTX las tiene.

PRIVACIDAD
----------
- Los documentos permanecen en tu ordenador.
- library/presentations/ se añade a .gitignore.
- Los PDFs continúan en library/pdfs/, que ya estaba ignorado por Git.
- Los índices y previews viven en .lumina/, también ignorado por Git.

INSTALACIÓN
-----------
1. DESCOMPRIME TODO el ZIP dentro de la raíz de Lumina Studio.
   Debes ver:

   Lumina-Studio/
     install-bibliography-v1.js
     patch/
     README_BIBLIOGRAPHY_V1.txt
     src/
     server/
     ...

2. Abre PowerShell en la raíz de Lumina Studio.

3. Ejecuta:

   node .\install-bibliography-v1.js

4. Comprueba el backend nuevo:

   node --check .\server\documentLibraryRoutes.js

5. Comprueba el frontend:

   npm.cmd run build

6. Reinicia Lumina:

   npm.cmd run notes

   y en otra consola:

   npm.cmd run dev

USO
---
A) Entra en "Bibliografía".
B) Selecciona una asignatura.
C) Añade PDF o PPTX.
D) Pulsa "Abrir junto a apuntes".
E) Lumina cambia a Apuntes y abre el panel flotante de Referencia.
F) Si es PPTX, navega con las flechas entre diapositivas.
G) Vuelve a Estudio/Tutor: la referencia activa sigue disponible para la IA.

PREVIEW VISUAL DE POWERPOINT
----------------------------
Lumina puede convertir el PPTX a un PDF local usando PowerPoint instalado en
Windows. Pulsa "Vista previa visual" o "Generar preview visual".

Si PowerPoint no está instalado o Windows bloquea la automatización COM:
- el PPTX NO se pierde;
- el RAG de IA sigue funcionando;
- el visor textual por diapositivas sigue funcionando.

NO SE INSTALAN PAQUETES NUEVOS
------------------------------
El extractor PPTX usa solamente zipfile + XML de la biblioteca estándar de
Python. No requiere python-pptx ni npm packages nuevos.

BACKUP
------
El instalador crea antes una copia de los archivos modificados en:

.lumina/backups/bibliography-v1-<fecha>/

ARCHIVOS NUEVOS
---------------
src/components/Bibliography.jsx
src/components/ReferencePanel.jsx
server/documentLibraryRoutes.js
scientific/extractPptxLibrary.py
scientific/convertPptxPreview.ps1

ARCHIVOS INTEGRADOS
-------------------
src/App.jsx
src/components/ChatAsignatura.jsx
src/components/LatexNotebook.jsx
server/notesServer.js
.gitignore

LIMITACIONES V1
---------------
- El visor textual de PPTX extrae texto y speaker notes, no recrea formas,
  gráficos o animaciones.
- La vista visual completa depende de Microsoft PowerPoint de escritorio.
- El RAG de PPTX V1 usa recuperación lexical antes de entrar al modelo. El RAG
  PDF existente sigue usando el pipeline actual de Lumina.
- DOCX todavía no está incluido en esta versión.
