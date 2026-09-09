LUMINA · BIBLIOGRAPHY WINDOW V1.2
=================================

Esta actualización SOLO modifica la ventana flotante de Referencia.
Requiere tener Bibliography + PPTX V1/V1.1 instalado.

NOVEDADES
---------
- Arrastrar la ventana desde la barra superior.
- Redimensionar desde la esquina inferior derecha.
- Doble clic en la barra superior para maximizar/restaurar.
- Botón Maximizar/Restaurar.
- Botón Acoplar a la derecha.
- La posición y el tamaño se recuerdan entre aperturas.
- La ventana se reajusta si cambia el tamaño de la pantalla.
- Evita dejar la ventana completamente fuera de la pantalla.
- Se elimina el wrapper invisible fijo de la V1.1 para que no bloquee clics.

INSTALACIÓN
-----------
1. Descomprime TODO el ZIP en la raíz de Lumina Studio.

2. En PowerShell, desde la raíz:

   node .\install-bibliography-v1-2-window.js

3. Comprueba:

   npm.cmd run build

4. Reinicia si el build termina bien:

   npm.cmd run notes
   npm.cmd run dev

USO
---
- Mover: arrastra desde la barra de título.
- Redimensionar: arrastra la esquina inferior derecha.
- Maximizar/restaurar: doble clic en la barra o usa el botón cuadrado.
- Acoplar: usa el botón de panel a la derecha.
- Cerrar: X.

El instalador crea un backup en:
.lumina/backups/bibliography-window-v1-2-...
