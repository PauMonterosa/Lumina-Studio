LUMINA RAG LITE V1
==================

Objetivo
--------
Mejorar las respuestas de Qwen usando solo los fragmentos de apuntes realmente
relevantes para cada pregunta.

Por qué mejora Lumina
---------------------
Antes el chat podía recibir bloques grandes de apuntes aunque una parte pequeña
fuera la relevante.

RAG Lite:
1. escanea notes/**/*.tex;
2. divide los apuntes en fragmentos conservando secciones y ecuaciones;
3. crea un índice BM25 local;
4. busca los 6 fragmentos más relevantes;
5. solo esos fragmentos se pasan a Qwen.

Ventajas
--------
- mejor relevancia;
- menos ruido;
- menos tokens en el prompt;
- menor latencia;
- menor carga térmica;
- cero modelos adicionales;
- cero APIs;
- todo local.

El índice se reconstruye solo cuando cambian los .tex.

Qué indexa
----------
- notes/subjects/*.tex
- notes/daily/**/*.tex

No indexa
---------
- .build
- notes/media
- archivos ocultos

Endpoints
---------
GET  /api/rag/health
POST /api/rag/search

Ejemplo PowerShell
------------------
$body = @{
    query = "Qué representa físicamente el tensor de Cauchy-Green?"
    subject = "quantum"
    topK = 5
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri http://localhost:3001/api/rag/search `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

Instalación
-----------
1. Copia el ZIP en la raíz de Lumina y descomprímelo.
2. Ejecuta:

   node .\install-rag-lite.js

3. Comprueba:

   node --check .\server\ragRoutes.js
   node --check .\server\notesServer.js
   npm.cmd run build

4. Reinicia:

   npm.cmd run notes

Siguiente versión
-----------------
Una V2 puede añadir:
- PDFs/libros;
- búsqueda semántica opcional;
- embeddings incrementales;
- citas de página/fuente;
- buscador global dentro de Lumina.
