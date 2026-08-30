LUMINA SCIENTIFIC ENGINE V1.3
===========================

Qué añade
---------
El tutor contextual de Lumina puede detectar preguntas de cálculo y consultar
un motor científico local antes de responder.

Motor:
- SymPy: álgebra simbólica
- NumPy: arrays y FFT
- SciPy: integración numérica, raíces y ODE
- Matplotlib: gráficas

Operaciones V1:
- simplify / expand / factor
- solve
- diff
- integrate
- limit
- series
- evaluate
- matrix
- linear_solve
- root
- numeric_integral
- ode
- fft
- polyfit
- plot

Seguridad
---------
Qwen NO recibe permiso para ejecutar Python arbitrario.

El modelo produce un plan JSON restringido y scientific/engine.py solo acepta
operaciones de una lista cerrada.

Instalación
-----------
1. Copia el contenido de este ZIP en la raíz de Lumina Studio.
2. Abre PowerShell en la raíz de Lumina.
3. Ejecuta:

   node .\install-scientific-engine.js

El instalador:
- integra server/scientificRoutes.js con server/notesServer.js;
- crea .venv;
- instala SymPy, NumPy, SciPy y Matplotlib;
- prueba el motor;
- añade .venv/ y .lumina/ a .gitignore.

Después:

   node --check .\server\scientificRoutes.js
   node --check .\server\notesServer.js
   npm.cmd run build

Reinicia backend:

   npm.cmd run notes

Pruebas recomendadas
--------------------
Resuelve x^2 - 5x + 6 = 0

Calcula la integral de sin(x)^2 entre 0 y pi

Calcula los autovalores de la matriz [[2,1],[1,2]]

Calcula el límite de sin(x)/x cuando x tiende a 0

Representa sin(x) + 0.3*sin(5*x) entre -6.28 y 6.28

Health endpoint
---------------
http://localhost:3001/api/scientific/health

Notas
-----
Las gráficas se guardan en:

.lumina/scientific/plots/

La carpeta .lumina/ está ignorada por Git.


V1.1
----
El instalador ya no depende del espaciado exacto de server/notesServer.js.
Localiza automáticamente la creación de systemPrompt en el chat contextual.


V1.2
----
Las gráficas ya no dependen de que Qwen escriba una imagen Markdown.
El backend emite un evento NDJSON estructurado `scientific_plot`, el frontend lo
guarda en el mensaje y ChatAsignatura renderiza directamente la imagen PNG.

Archivos modificados por el instalador:
- server/notesServer.js
- src/components/ChatAsignatura.jsx
- src/components/MessageContent.jsx
- .gitignore

Para probar:
Representa sin(x) + 0.3*sin(5*x) entre -2*pi y 2*pi


V1.2.1
------
Corrección del instalador:
- ya no busca un bloque exacto de cabeceras NDJSON;
- inserta `scientific_plot` justo antes del bucle de streaming de Ollama;
- tolera diferencias de espacios y formato en notesServer.js.


V1.2.2
------
Instalador del frontend más robusto:
- ya no busca replaceLastAssistantMessage;
- inserta el helper antes de sendMessage;
- localiza el parser por `parsed?.message?.content`;
- localiza MessageContent con una expresión regular;
- las gráficas científicas ya no dependen del render Markdown.


V1.3
----
Corrección definitiva del transporte de gráficas:
- el PNG ya no depende de /api/scientific/plots/...;
- Node lee el PNG y lo convierte a data:image/png;base64,...;
- el evento scientific_plot transporta directamente la imagen;
- Qwen ya no recibe plot_url ni plot_file, evitando imágenes Markdown duplicadas.

Para actualizar desde V1.2.2 solo es obligatorio sustituir:
server/scientificRoutes.js

Después reinicia el backend y el frontend.
