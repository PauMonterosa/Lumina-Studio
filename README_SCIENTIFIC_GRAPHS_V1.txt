LUMINA NOTEBOOK SCIENTIFIC GRAPHS V1
======================================

Qué añade
---------
Añade al cuaderno LaTeX un botón "Gráfica" para generar figuras matemáticas
exactas a partir de un prompt en lenguaje natural.

Flujo:
- el usuario describe la figura;
- Ollama convierte el prompt a un spec JSON;
- Python genera la gráfica exacta (PNG + PDF);
- Lumina guarda la figura en notes/media/<asignatura>/<fecha>/;
- el cuaderno inserta automáticamente el bloque LaTeX.

Archivos de esta entrega
------------------------
- server/notebookScientificFigureRoutes.js
- scientific/notebook_plot.py
- LatexNotebook_scientific_graph_patch.md

Soporte V1
----------
- function_plot: una o varias funciones y(x)
- scatter_fit: datos experimentales + ajuste polinómico

Ejemplos de prompt
------------------
Representa y = sin(x) + 0.3*sin(5*x) entre -2*pi y 2*pi.
Pon título "Señal compuesta".
Etiqueta los ejes como x e y.
Añade rejilla y leyenda.

Representa y = exp(-x)*sin(4*x) entre 0 y 10.
Título: Respuesta amortiguada.
Eje x: tiempo (s). Eje y: amplitud.

Dibuja los puntos (0,1.0), (1,2.2), (2,3.9), (3,6.1) y ajusta un polinomio
de grado 2. Título: Ajuste experimental.

Importante
----------
Esta V1 está pensada para ser precisa. La gráfica no la "dibuja" la IA como
imagen creativa; la genera Python con SymPy/NumPy/Matplotlib.

Siguiente mejora recomendada
----------------------------
En una V2 convendría añadir:
- curvas paramétricas;
- polares;
- Bode;
- FFT;
- respuesta temporal;
- control del tamaño y ancho de figura;
- guardado también del spec JSON para regenerar la figura.
