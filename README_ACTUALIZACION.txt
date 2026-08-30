LUMINA NOTEBOOK · GRÁFICAS EXACTAS V1.1 OPTIMIZADA
==================================================

Qué corrige
-----------
- Soporte numérico real para funciones especiales con SciPy:
  besselj, bessely, besseli, besselk, hankel1, hankel2, erf, erfc, gamma.
- Si una expresión deja parámetros simbólicos sin valor (por ejemplo besselj(n,x)),
  ya no da "Cannot convert expression to float": explica qué parámetro falta.

Optimización
------------
- Bessel, Legendre, Hermite y Laguerre usan presets locales y NO llaman a Qwen.
- Prompts explícitos del tipo "y = ... entre ... y ..." también evitan Qwen.
- Cachea especificaciones repetidas durante la sesión.
- El planificador general de Qwen baja de 4096 ctx / 900 predict a
  2048 ctx / 460 predict.
- keep_alive del planificador: 15 s en vez de 1 min.
- Curvas 2D normales usan aprox. 650-900 muestras y preview de 130-140 dpi.
- El PDF sigue siendo vectorial, así que esta reducción no empeora la calidad
  de los apuntes.

Instalación sobre V1
--------------------
1. Copia/sobrescribe:
   server/notebookScientificPlotRoutes.js
   scientific/notebookScientificPlot.py
   install-notebook-scientific-plots.js

2. Ejecuta desde la raíz de Lumina:
   node .\install-notebook-scientific-plots.js

3. Comprueba:
   node --check .\server\notebookScientificPlotRoutes.js
   node --check .\server\notesServer.js
   npm.cmd run build

4. Reinicia:
   npm.cmd run notes
   npm.cmd run dev

Prueba Bessel
-------------
Dibuja las diferentes representaciones de las funciones de Bessel

La ruta rápida genera J0, J1, J2, J3 y J4 sin usar Qwen.

También puedes pedir:
- Dibuja funciones de Bessel de segunda especie
- Dibuja funciones de Bessel de primera y segunda especie
- Dibuja las funciones de Bessel modificadas

Prueba rápida sin Qwen
----------------------
Representa y = exp(-x)*sin(4*x) entre 0 y 10. Título: Respuesta amortiguada.
