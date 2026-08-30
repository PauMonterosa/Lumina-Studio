LUMINA PDF RAG V2
=================

Qué añade
---------
Lumina puede usar libros, manuales y PDFs locales como contexto para Qwen.

Flujo:
1. añades un PDF;
2. PyMuPDF extrae el texto una sola vez;
3. Lumina divide el libro por páginas y fragmentos;
4. se guarda una caché local;
5. al preguntar, BM25 busca solo los 4 fragmentos más relevantes;
6. Qwen recibe esos fragmentos con título y página;
7. Qwen puede citar [Fuente: Título, p. N].

Rendimiento
-----------
No usa embeddings ni un segundo modelo.
El trabajo pesado de PDF ocurre al indexarlo, no en cada pregunta.
La búsqueda posterior es local y ligera.

Privacidad
----------
Los PDFs quedan en:

library/pdfs/

y están ignorados por Git.

La caché queda en:

.lumina/rag-pdf/

y también está ignorada por Git.

Biblioteca
----------
Después de iniciar el backend abre:

http://localhost:3001/rag-library

Desde ahí puedes subir PDFs y asignarlos a una asignatura.

También puedes copiar manualmente archivos a:

library/pdfs/quantum/
library/pdfs/control/
library/pdfs/electronics/
...

La carpeta se usa como asignatura.

PDFs escaneados
---------------
V2 NO usa OCR. Esto es intencional para mantener el sistema rápido y ligero.
Si un PDF contiene solo imágenes escaneadas, Lumina lo indicará y no indexará
esas páginas.

Instalación
-----------
1. Descomprime el ZIP en la raíz de Lumina.
2. Ejecuta:

   node .\install-rag-pdf-v2.js

3. Comprueba:

   node --check .\server\pdfRagRoutes.js
   node --check .\server\notesServer.js
   npm.cmd run build

4. Reinicia:

   npm.cmd run notes

5. Abre:

   http://localhost:3001/rag-library

Pruebas
-------
Una vez añadido un libro, pregunta en el chat:

Explícame la aproximación WKB usando mis apuntes y el Griffiths.

o:

Según el libro, ¿cómo se interpreta físicamente la densidad de estados?

Lumina debería usar los fragmentos relevantes y citar las páginas cuando
dependa del PDF.
