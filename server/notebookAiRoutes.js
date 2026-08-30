const OLLAMA_URL = "http://localhost:11434/api/chat";
const NOTEBOOK_AI_MODEL = process.env.NOTES_MODEL || "qwen3.5:4b";

const ALLOWED_ACTIONS = new Set([
  "complete",
  "improve",
  "equation",
  "tikz",
]);

function trimContext(value, maxChars) {
  if (typeof value !== "string") return "";
  if (value.length <= maxChars) return value;
  return value.slice(value.length - maxChars);
}

function cleanModelOutput(value) {
  return String(value || "")
    .replace(/^```(?:latex|tex)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function buildNotebookAiPrompt({
  action,
  subjectName,
  dateKey,
  selectedText,
  contextBefore,
  contextAfter,
  instruction,
}) {
  const common = `
Eres el asistente LaTeX de Lumina Studio para apuntes universitarios.

Asignatura: ${subjectName}
Fecha: ${dateKey}

Reglas:
- Devuelve SOLO el fragmento LaTeX que debe insertarse o sustituirse.
- No uses Markdown ni triple backticks.
- No incluyas \\documentclass, \\begin{document} ni \\end{document}.
- Mantén el idioma utilizado en los apuntes.
- Usa un estilo compacto, claro y universitario.
- Genera LaTeX válido.
- No inventes datos numéricos ni información específica que no esté respaldada por el contexto.
`.trim();

  if (action === "complete") {
    return `${common}

TAREA: continuar los apuntes desde el cursor.

Contexto anterior:
"""
${trimContext(contextBefore, 1800)}
"""

Contexto posterior:
"""
${String(contextAfter || "").slice(0, 700)}
"""

Genera una continuación útil y coherente con los apuntes. No repitas lo que ya está escrito.`;
  }

  if (action === "improve") {
    return `${common}

TAREA: reescribir únicamente la selección para hacerla más clara, correcta y adecuada como apuntes universitarios.

Selección:
"""
${String(selectedText || "").slice(0, 2600)}
"""

Contexto anterior:
"""
${trimContext(contextBefore, 900)}
"""

Devuelve únicamente el texto LaTeX que debe sustituir la selección. Conserva el significado.`;
  }

  if (action === "equation") {
    return `${common}

TAREA: generar la ecuación o conjunto de ecuaciones solicitado.

Petición:
"""
${String(instruction || "").slice(0, 900)}
"""

Contexto:
"""
${trimContext(contextBefore, 1400)}
"""

Usa notación matemática coherente con el contexto. Emplea normalmente \\begin{equation} ... \\end{equation} o \\begin{align} ... \\end{align} cuando corresponda.`;
  }

  return `${common}

TAREA: generar una figura TikZ para insertar directamente en los apuntes.

Petición:
"""
${String(instruction || "").slice(0, 1100)}
"""

Contexto:
"""
${trimContext(contextBefore, 1000)}
"""

Reglas TikZ:
- Devuelve un bloque completo \\begin{figure}[H] ... \\end{figure}.
- Incluye \\centering.
- Dentro usa \\begin{tikzpicture} ... \\end{tikzpicture}.
- Evita librerías exóticas y archivos externos.
- Incluye una \\caption{} breve.
- Prioriza una figura clara y compilable frente a una figura compleja.`;
}

async function askNotebookAi(payload) {
  const numPredict =
    payload.action === "tikz"
      ? 850
      : payload.action === "equation"
        ? 450
        : payload.action === "complete"
          ? 500
          : 350;

  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: NOTEBOOK_AI_MODEL,
      stream: false,
      think: false,
      keep_alive: "1m",
      options: {
        temperature: payload.action === "tikz" ? 0.18 : 0.12,
        top_p: 0.85,
        num_ctx: 4096,
        num_predict: numPredict,
      },
      messages: [
        {
          role: "user",
          content: buildNotebookAiPrompt(payload),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama respondió con HTTP ${response.status}`);
  }

  const data = await response.json();
  const content = cleanModelOutput(data?.message?.content);

  if (!content) {
    throw new Error("Qwen3.5 4B no devolvió ninguna propuesta.");
  }

  return content;
}

export function registerNotebookAiRoutes(app) {
  app.get("/api/notebook/ai/health", (req, res) => {
    res.json({
      ok: true,
      model: NOTEBOOK_AI_MODEL,
      automaticAutocomplete: false,
    });
  });

  app.post("/api/notebook/ai", async (req, res) => {
    try {
      const {
        action,
        subject,
        subjectName,
        dateKey,
        selectedText = "",
        contextBefore = "",
        contextAfter = "",
        instruction = "",
      } = req.body || {};

      if (!ALLOWED_ACTIONS.has(action)) {
        return res.status(400).json({
          ok: false,
          error: "Acción de IA no válida.",
        });
      }

      if (!subject || typeof subject !== "string") {
        return res.status(400).json({
          ok: false,
          error: "Asignatura no válida.",
        });
      }

      if (
        action === "improve" &&
        (!selectedText || !selectedText.trim())
      ) {
        return res.status(400).json({
          ok: false,
          error: "Selecciona texto antes de usar Mejorar.",
        });
      }

      if (
        (action === "equation" || action === "tikz") &&
        (!instruction || !instruction.trim())
      ) {
        return res.status(400).json({
          ok: false,
          error: "Falta la instrucción para generar el contenido.",
        });
      }

      const content = await askNotebookAi({
        action,
        subject,
        subjectName: subjectName || subject,
        dateKey: dateKey || "",
        selectedText,
        contextBefore,
        contextAfter,
        instruction,
      });

      res.json({
        ok: true,
        action,
        model: NOTEBOOK_AI_MODEL,
        content,
      });
    } catch (error) {
      console.error("Notebook AI:", error);

      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "No se pudo generar la propuesta de Lumina AI.",
      });
    }
  });
}
