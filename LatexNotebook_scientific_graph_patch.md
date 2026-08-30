# Cambios en `server/notesServer.js`

Añade este import arriba del todo, junto con los otros imports:

```js
import { registerNotebookScientificFigureRoutes } from "./notebookScientificFigureRoutes.js";
```

Y después del registro de las demás rutas, añade:

```js
registerNotebookScientificFigureRoutes(app, {
    model: STUDY_MODEL,
    ollamaUrl: OLLAMA_URL,
});
```

---

# Cambios en `src/components/LatexNotebook.jsx`

## 1) Estado nuevo

Añade estos estados dentro del componente:

```jsx
const [figureModalOpen, setFigureModalOpen] = useState(false);
const [figurePrompt, setFigurePrompt] = useState("");
const [figureLoading, setFigureLoading] = useState(false);
const [figurePreviewUrl, setFigurePreviewUrl] = useState("");
const [figureError, setFigureError] = useState("");
```

## 2) Función para insertar texto en el cursor

Si no la tienes ya, añade esta función:

```jsx
const insertAtCursor = (snippet) => {
    const textarea = editorRef?.current;
    if (!textarea) {
        setContent((prev) => `${prev}\n\n${snippet}\n`);
        return;
    }

    const start = textarea.selectionStart ?? content.length;
    const end = textarea.selectionEnd ?? content.length;

    const next =
        content.slice(0, start) +
        snippet +
        content.slice(end);

    setContent(next);

    requestAnimationFrame(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + snippet.length;
    });
};
```

> Si tu ref no se llama `editorRef`, cambia el nombre por el que uses tú.

## 3) Función para generar la gráfica e insertar LaTeX

Añade esta función dentro del componente:

```jsx
const handleGenerateScientificFigure = async () => {
    try {
        setFigureLoading(true);
        setFigureError("");

        const response = await fetch("/api/notebook/figure-plot/generate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                prompt: figurePrompt,
                subjectName: selectedSubject?.name || subjectName || "General",
                noteDate: selectedDateKey || new Date().toISOString().slice(0, 10),
            }),
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.error || "No se pudo generar la gráfica.");
        }

        const snippet = `\n\n${data.latexBlock}\n\n`;
        insertAtCursor(snippet);

        setFigurePreviewUrl(data.previewUrl || "");
        setFigureModalOpen(false);
        setFigurePrompt("");
    } catch (error) {
        setFigureError(error.message || "Error generando la gráfica.");
    } finally {
        setFigureLoading(false);
    }
};
```

## 4) Botón en la barra de herramientas

Añade un botón más junto a "Sección", "Ecuación", etc.:

```jsx
<button
    type="button"
    onClick={() => setFigureModalOpen(true)}
    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
>
    Gráfica
</button>
```

## 5) Modal

Añade este bloque JSX cerca del final del `return`, pero dentro del componente:

```jsx
{figureModalOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-2xl">
            <div className="mb-4">
                <h3 className="text-lg font-semibold text-white">
                    Insertar gráfica científica exacta
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                    Describe la figura en lenguaje natural. Lumina la convertirá
                    en una gráfica exacta y la insertará en LaTeX.
                </p>
            </div>

            <textarea
                value={figurePrompt}
                onChange={(event) => setFigurePrompt(event.target.value)}
                placeholder={`Ejemplo:\nRepresenta y = sin(x) + 0.3*sin(5*x) entre -2*pi y 2*pi.\nPon título "Señal compuesta".\nEtiqueta los ejes como x e y.\nAñade rejilla y leyenda.`}
                className="min-h-[180px] w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />

            {figureError && (
                <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {figureError}
                </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-3">
                <button
                    type="button"
                    onClick={() => {
                        setFigureModalOpen(false);
                        setFigureError("");
                    }}
                    className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
                >
                    Cancelar
                </button>

                <button
                    type="button"
                    onClick={handleGenerateScientificFigure}
                    disabled={figureLoading || !figurePrompt.trim()}
                    className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {figureLoading ? "Generando..." : "Generar e insertar"}
                </button>
            </div>
        </div>
    </div>
)}
```

## 6) Preview opcional

Si quieres enseñar la última figura generada, puedes añadir debajo del editor:

```jsx
{figurePreviewUrl && (
    <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
        <div className="border-b border-white/10 px-4 py-3 text-sm text-slate-300">
            Última gráfica insertada
        </div>
        <img
            src={figurePreviewUrl}
            alt="Última gráfica generada"
            className="block h-auto w-full bg-white"
        />
    </div>
)}
```

---

# Instalación Python

Como ya tienes `.venv` por el Scientific Engine, normalmente bastará con:

```powershell
.\.venv\Scripts\python.exe -m pip install matplotlib sympy numpy
```

Si no usas `.venv`, usa tu Python normal.

---

# Prueba rápida

En el cuaderno, pulsa **Gráfica** y pega:

```text
Representa y = sin(x) + 0.3*sin(5*x) entre -2*pi y 2*pi.
Pon título "Señal compuesta".
Etiqueta los ejes como x e y.
Añade rejilla y leyenda.
```

Debería:

1. generar PNG + PDF en `notes/media/...`
2. insertar un bloque `figure` en la nota
3. dejar la figura lista para compilar en LaTeX
