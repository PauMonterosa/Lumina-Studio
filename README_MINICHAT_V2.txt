LUMINA LLAMA MINI-CHAT V2
=========================

Qué cambia
----------
Clic sobre la llama:
- ya NO abre el navegador;
- abre un mini-chat flotante encima/junto a la mascota.

Desde el mini-chat:
- selecciona asignatura;
- selecciona Conceptual / Problemas / Examen;
- escribe una pregunta;
- Enter;
- Qwen responde por streaming;
- mantiene un historial corto de conversación;
- puede mostrar gráficas del Scientific Engine si llegan como PNG embebido.

Rendimiento
-----------
El mini-chat NO arranca Vite ni el frontend completo.

Solo necesita:
- Ollama
- npm.cmd run notes

Esto reduce bastante el coste frente a abrir Lumina entero.

El navegador/frontend solo se inicia al pulsar:
- el botón ↗ del mini-chat;
- "Abrir Lumina" en el menú derecho.

Asignaturas
-----------
- Nanotechnologies
- Quantum Technologies
- Microelectronics Design
- CPIA
- Biophotonics

Instalación
-----------
1. Descomprime el ZIP en la raíz de Lumina.
2. Sobrescribe desktop_pet/lumina_llama.py y los archivos incluidos.
3. Ejecuta:

   node .\install-llama-mini-chat-v2.js

4. Comprueba:

   node --check .\server\notesServer.js
   npm.cmd run build

5. Si la llama anterior está abierta:
   clic derecho > Salir
   y abre de nuevo "Lumina Llama" desde el Escritorio.

Uso
---
Clic izquierdo:
mini-chat.

Arrastrar:
mover la mascota.

Clic derecho:
Abrir Lumina / Apuntes / Agenda / Calificaciones / Biblioteca PDF / etc.

Escape:
oculta el mini-chat.

Nueva conversación:
borra el historial del mini-chat.
