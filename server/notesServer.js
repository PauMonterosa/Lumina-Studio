import express from "express";
import cors from "cors";
import fs from "node:fs/promises";
import path from "node:path";

const app = express();

const PORT = 3001;
const OLLAMA_URL = "http://localhost:11434/api/chat";
const NOTES_MODEL = process.env.NOTES_MODEL || "qwen2.5";

const SUBJECT_FILES = {
    math: "math.tex",
    physics: "physics.tex",
    programming: "programming.tex",
    history: "history.tex",
    literature: "literature.tex",
};

const SUBJECT_NAMES = {
    math: "Matemáticas Avanzadas",
    physics: "Física Cuántica",
    programming: "Algoritmia y Datos",
    history: "Historia Universal",
    literature: "Literatura Contemporánea",
};

const NOTES_DIR = path.resolve(process.cwd(), "notes", "subjects");

app.use(cors());
app.use(express.json({ limit: "2mb" }));

async function ensureNotesStructure() {
    await fs.mkdir(NOTES_DIR, { recursive: true });

    for (const fileName of Object.values(SUBJECT_FILES)) {
        const filePath = path.join(NOTES_DIR, fileName);

        try {
            await fs.access(filePath);
        } catch {
            await fs.writeFile(filePath, "", "utf8");
        }
    }
}

function removeLatexFences(text) {
    return text
        .replace(/^```latex\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();
}

function sanitizeLatexFragment(text) {
    return removeLatexFences(text)
        .replace(/\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/g, "")
        .replace(/\\begin\{document\}/g, "")
        .replace(/\\end\{document\}/g, "")
        .trim();
}

function buildSystemPrompt() {
    return `
Eres un asistente experto en tomar apuntes universitarios en LaTeX.

Tu tarea es convertir transcripciones orales en apuntes limpios, claros y útiles.

Reglas obligatorias:
- Devuelve SOLO código LaTeX válido.
- No uses markdown.
- No uses triple backticks.
- No incluyas \\documentclass, \\begin{document} ni \\end{document}.
- No inventes información que no esté en la transcripción.
- Si una parte no se entiende, escribe: \\textbf{TODO: revisar esta parte}.
- Ordena la explicación en párrafos claros.
- Usa \\subsection*{} o \\paragraph{} si ayuda.
- Usa ecuaciones LaTeX cuando haya fórmulas.
- Mantén el contenido en español.
- Corrige la redacción oral, pero conserva el significado.
- No añadas conclusiones que no estén en la transcripción.
`.trim();
}

function buildUserPrompt({ subject, text }) {
    return `
Asignatura: ${subject}

Transcripción oral:
"""
${text}
"""

Convierte esta transcripción en apuntes universitarios en LaTeX.
`.trim();
}

async function convertTranscriptToLatex({ subject, text }) {
    const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: NOTES_MODEL,
            stream: false,
            messages: [
                {
                    role: "system",
                    content: buildSystemPrompt(),
                },
                {
                    role: "user",
                    content: buildUserPrompt({ subject, text }),
                },
            ],
        }),
    });

    if (!response.ok) {
        throw new Error(`Ollama respondió con HTTP ${response.status}`);
    }

    const data = await response.json();
    const latex = data?.message?.content;

    if (!latex) {
        throw new Error("Ollama no devolvió contenido LaTeX.");
    }

    return sanitizeLatexFragment(latex);
}

app.get("/api/notes/health", (req, res) => {
    res.json({
        ok: true,
        model: NOTES_MODEL,
        notesDir: NOTES_DIR,
    });
});

app.post("/api/notes/append-latex", async (req, res) => {
    try {
        const { subject, text } = req.body;

        if (!subject || !SUBJECT_FILES[subject]) {
            return res.status(400).json({
                ok: false,
                error: "Asignatura no válida.",
            });
        }

        if (!text || typeof text !== "string" || text.trim().length < 3) {
            return res.status(400).json({
                ok: false,
                error: "Texto de transcripción vacío o demasiado corto.",
            });
        }

        await ensureNotesStructure();

        const subjectName = SUBJECT_NAMES[subject];
        const fileName = SUBJECT_FILES[subject];
        const filePath = path.join(NOTES_DIR, fileName);

        const latex = await convertTranscriptToLatex({
            subject: subjectName,
            text: text.trim(),
        });

        const now = new Date();

        const block = `

% ---- Lumina Studio · ${now.toLocaleString("es-ES")} ----

${latex}

`;

        await fs.appendFile(filePath, block, "utf8");

        res.json({
            ok: true,
            file: filePath,
            latex,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            ok: false,
            error:
                error.message ||
                "No se pudo convertir la transcripción a LaTeX.",
        });
    }
});

app.listen(PORT, async () => {
    await ensureNotesStructure();

    console.log(`Lumina Notes Server activo en http://localhost:${PORT}`);
    console.log(`Modelo de notas: ${NOTES_MODEL}`);
    console.log(`Carpeta de apuntes: ${NOTES_DIR}`);
});