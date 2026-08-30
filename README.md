# Lumina GradeTracker · Q7 Rubrics V1

Adapta la sección **Calificaciones** a las rúbricas de las cinco asignaturas
del nuevo cuadrimestre.

## Plantillas

### Nanotechnologies — oficial UPC
- Examen parcial: 35%
- Examen final: 35%
- Presentación del informe: 30%

### Quantum Technologies
- Exámenes escritos (bloque): 65%
- Problemas entregables: 20%
- Implementación práctica: 15%

### Microelectronics Design — referencia UPC provisional
- Examen final: 40%
- Laboratorios: 40%
- Evaluación continua: 20%

La fórmula procede de la guía UPC 230736 estrechamente relacionada. La interfaz
lo marca expresamente como referencia y recomienda sustituirla si Atenea publica
otra rúbrica para la asignatura concreta de grado.

### CPIA — oficial UPC
- Entregables de laboratorio: 25%
- Proyecto final: 75%

### Biophotonics — oficial UPC
- Cuestionarios semanales: 25%
- Examen Microscopy: 20%
- Examen Therapy: 20%
- Examen Diagnosis: 20%
- Presentación journal paper: 15%

## Instalación

Descomprime el ZIP completo en la raíz de Lumina y ejecuta:

```powershell
node .\install-grade-rubrics-q7.js
npm.cmd run build
```

El instalador guarda primero:

`src/components/GradeTracker.before-q7-rubrics.jsx`

## Comportamiento

- Las rúbricas aparecen precargadas automáticamente.
- Puedes introducir cada nota conforme la recibes.
- Lumina calcula:
  - nota media sobre lo ya evaluado;
  - contribución acumulada sobre 10;
  - máximo final todavía posible;
  - media necesaria en lo que falta para alcanzar tu objetivo.
- Los pesos siguen siendo editables.
- Puedes añadir actividades manuales.
- El botón `Restaurar rúbrica` devuelve la asignatura a su plantilla.
