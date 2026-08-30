LUMINA HYBRID RAG V3
====================

Objetivo
--------
Mejorar la búsqueda en apuntes + PDFs cuando la pregunta no usa las mismas
palabras que la fuente.

Arquitectura
------------
1. RAG Lite (BM25) busca candidatos entre .tex.
2. PDF RAG busca candidatos entre libros.
3. Se conservan como máximo 14 fragmentos.
4. EmbeddingGemma calcula similitud semántica solo para esos candidatos.
5. Se combina:
   - 44% coincidencia lexical
   - 56% similitud semántica
6. Qwen recibe solo los 6 mejores.

Esto evita generar embeddings de toda la biblioteca en cada pregunta.

Modelo
------
embeddinggemma:300m-qat-q4_0

Según Ollama:
- 300M parámetros
- cuantizado Q4
- ~239 MB
- multilingüe
- pensado para retrieval

Modo ECO
--------
El request usa:

keep_alive: 0

por lo que el modelo se descarga de memoria justo después del reranking.

Si EmbeddingGemma falla o no está instalado, Lumina vuelve automáticamente a
BM25 y el chat sigue funcionando.

Ventaja principal
-----------------
Ejemplo:

Fuente:
"El coeficiente de amortiguamiento reduce el sobreimpulso."

Pregunta:
"¿Por qué al aumentar las pérdidas el sistema oscila menos?"

BM25 puede tener pocas palabras en común.
La búsqueda semántica sí puede detectar que ambos textos hablan del mismo
fenómeno.

Instalación
-----------
1. Descomprime en la raíz de Lumina.
2. Ejecuta:

   node .\install-hybrid-rag-v3.js

3. Comprueba:

   node --check .\server\hybridRagRoutes.js
   node --check .\server\notesServer.js
   npm.cmd run build

4. Reinicia:

   npm.cmd run notes

5. Abre:

   http://localhost:3001/api/rag/hybrid/health

El instalador intenta descargar automáticamente el modelo embedding ligero.
Si no puede, el sistema queda en fallback BM25.
