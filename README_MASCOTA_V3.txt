LUMINA LLAMA · NUEVO DISEÑO V3
================================

Este paquete cambia únicamente el aspecto de la mascota.
No modifica el mini-chat V2 ni el backend.

INSTALACIÓN
-----------
1. Descomprime todo en la raíz de Lumina Studio.
2. Ejecuta:

   node .\install-new-mascot.js

3. En la mascota actual:
   clic derecho -> Salir

4. Abre otra vez:
   Lumina Llama

ARCHIVOS
--------
La nueva mascota se instala en:

desktop_pet/assets/llama_idle_0.png
desktop_pet/assets/llama_idle_1.png
desktop_pet/assets/lumina_llama.ico

También se conserva el master en:

desktop_pet/assets/lumina_llama_master_v3.png

BACKUP
------
El instalador guarda la mascota anterior en:

desktop_pet/assets_backup_before_v3/

NOTA
----
Por ahora idle_0 e idle_1 usan el mismo diseño para que la animación actual
siga funcionando sin deformar el personaje. Después podemos crear frames
coherentes de parpadeo, reacción al clic y "pensando".
