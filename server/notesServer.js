import express from "express";
import cors from "cors";
import fs from "node:fs/promises";
import path from "node:path";

const app = express();

const PORT = 3001;
const OLLAMA_URL = "http://localhost:11434/api/chat";
const NOTES_MODEL = process.env.NOTES_MODEL || "qwen2.5";
const STUDY_MODEL = process.env.STUDY_MODEL || NOTES_MODEL;

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

const STUDY_MODES = {
    mindmap: "Mindmap",
    podcast: "Podcast",
    flashcards: "Flashcards",
    exam: "Examen práctico",
};

const NOTES_DIR = path.resolve(process.cwd(), "notes", "subjects");

app.use(cors());
app.use(express.json({ limit: "4mb" }));

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

function limitText(text, maxChars) {
    if (!text) return "";

    if (text.length <= maxChars) return text;

    return text.slice(text.length - maxChars);
}

async function readSubjectLatex(subject) {
    if (!subject || !SUBJECT_FILES[subject]) {
        throw new Error("Asignatura no válida.");
    }

    await ensureNotesStructure();

    const filePath = path.join(NOTES_DIR, SUBJECT_FILES[subject]);

    try {
        const content = await fs.readFile(filePath, "utf8");
        return limitText(content, 35000);
    } catch {
        return "";
    }
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

function buildStudySystemPrompt(mode) {
    const commonRules = `
Eres un profesor universitario experto en Ingeniería Física.

Debes generar material de estudio de alta calidad usando únicamente el contexto proporcionado.

Reglas obligatorias:
- Responde en español.
- No inventes información que no esté apoyada por el contexto.
- Si falta información, indícalo claramente.
- Prioriza claridad, rigor, estructura y utilidad para estudiar.
- Adapta el nivel a un estudiante universitario de Ingeniería Física.
- Usa notación matemática cuando sea útil.
- Explica los conceptos con precisión.
- No devuelvas JSON.
- No uses triple backticks.
`.trim();

    const modePrompts = {
        mindmap: `
Genera un mapa mental textual de alta calidad.

Formato:
# Mindmap de estudio

1. Idea central
2. Bloques principales
3. Subconceptos
4. Relaciones entre conceptos
5. Dependencias previas necesarias
6. Conexiones con problemas típicos de examen

Debe parecer un esquema útil para estudiar, no un resumen plano.
`.trim(),

        podcast: `
Genera un guion de podcast educativo.

Formato:
# Guion de podcast

Incluye:
1. Título del episodio
2. Introducción breve y atractiva
3. Explicación progresiva de los conceptos
4. Analogías útiles pero rigurosas
5. Ejemplos aplicados a Ingeniería Física
6. Pausas o preguntas retóricas para mantener atención
7. Cierre con recapitulación

No generes audio. Solo el guion.
`.trim(),

        flashcards: `
Genera flashcards de estudio activo.

Formato:
# Flashcards

Para cada tarjeta usa:
## Tarjeta N
Pregunta:
Respuesta:
Explicación:
Dificultad: Básica / Media / Avanzada

Incluye tarjetas conceptuales, matemáticas y de razonamiento.
Evita preguntas triviales.
`.trim(),

        exam: `
Genera un examen práctico de alta calidad.

Formato:
# Examen práctico

Incluye:
1. Instrucciones breves
2. Entre 4 y 6 ejercicios
3. Dificultad progresiva
4. Problemas conceptuales y problemas de cálculo
5. Solución completa paso a paso
6. Comentarios sobre errores típicos

Cada ejercicio debe parecer realista para una asignatura de Ingeniería Física.
Si el contexto no contiene suficientes datos para ejercicios numéricos, crea ejercicios simbólicos basados en los conceptos disponibles.
`.trim(),
    };

    return `
${commonRules}

Tipo de material solicitado: ${STUDY_MODES[mode] || mode}

${modePrompts[mode] || modePrompts.exam}
`.trim();
}

function formatDiaryNotesForPrompt(diaryNotes = []) {
    if (!Array.isArray(diaryNotes) || diaryNotes.length === 0) {
        return "No hay transcripciones del diario disponibles.";
    }

    const formatted = diaryNotes
        .slice(0, 40)
        .map((note, index) => {
            const dateLabel = note.dateKey || "sin fecha";
            const text = typeof note.text === "string" ? note.text.trim() : "";

            return `
[Nota ${index + 1} · ${dateLabel}]
${text}
`.trim();
        })
        .join("\n\n");

    return limitText(formatted, 25000);
}

function buildStudyUserPrompt({
    subjectName,
    mode,
    selectedDateKey,
    latexContext,
    diaryNotes,
}) {
    return `
Asignatura activa:
${subjectName}

Tipo de material solicitado:
${STUDY_MODES[mode] || mode}

Día seleccionado en el calendario:
${selectedDateKey}

Contexto 1: apuntes LaTeX de la asignatura
"""
${latexContext || "El archivo LaTeX de esta asignatura está vacío."}
"""

Contexto 2: transcripciones guardadas en el diario
"""
${formatDiaryNotesForPrompt(diaryNotes)}
"""

Genera ahora el material solicitado usando el contexto anterior.
`.trim();
}

async function askOllama({ model, systemPrompt, userPrompt }) {
    const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            stream: false,
            messages: [
                {
                    role: "system",
                    content: systemPrompt,
                },
                {
                    role: "user",
                    content: userPrompt,
                },
            ],
        }),
    });

    if (!response.ok) {
        throw new Error(`Ollama respondió con HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = data?.message?.content;

    if (!content) {
        throw new Error("Ollama no devolvió contenido.");
    }

    return content.trim();
}

async function convertTranscriptToLatex({ subject, text }) {
    const latex = await askOllama({
        model: NOTES_MODEL,
        systemPrompt: buildSystemPrompt(),
        userPrompt: buildUserPrompt({ subject, text }),
    });

    return sanitizeLatexFragment(latex);
}

async function generateStudyMaterial({
    subject,
    subjectName,
    mode,
    selectedDateKey,
    diaryNotes,
}) {
    if (!STUDY_MODES[mode]) {
        throw new Error("Modo de estudio no válido.");
    }

    const latexContext = await readSubjectLatex(subject);

    const content = await askOllama({
        model: STUDY_MODEL,
        systemPrompt: buildStudySystemPrompt(mode),
        userPrompt: buildStudyUserPrompt({
            subjectName,
            mode,
            selectedDateKey,
            latexContext,
            diaryNotes,
        }),
    });

    return content;
}

app.get("/api/notes/health", (req, res) => {
    res.json({
        ok: true,
        notesModel: NOTES_MODEL,
        studyModel: STUDY_MODEL,
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

app.post("/api/study/generate", async (req, res) => {
    try {
        const {
            subject,
            subjectName,
            mode,
            selectedDateKey,
            diaryNotes = [],
        } = req.body;

        if (!subject || !SUBJECT_FILES[subject]) {
            return res.status(400).json({
                ok: false,
                error: "Asignatura no válida.",
            });
        }

        if (!mode || !STUDY_MODES[mode]) {
            return res.status(400).json({
                ok: false,
                error: "Modo de estudio no válido.",
            });
        }

        const finalSubjectName =
            subjectName || SUBJECT_NAMES[subject] || subject;

        const content = await generateStudyMaterial({
            subject,
            subjectName: finalSubjectName,
            mode,
            selectedDateKey,
            diaryNotes,
        });

        res.json({
            ok: true,
            mode,
            subject,
            content,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            ok: false,
            error:
                error.message ||
                "No se pudo generar el material de estudio.",
        });
    }
});

app.listen(PORT, async () => {
    await ensureNotesStructure();

    console.log(`Lumina Notes Server activo en http://localhost:${PORT}`);
    console.log(`Modelo de notas: ${NOTES_MODEL}`);
    console.log(`Modelo de estudio: ${STUDY_MODEL}`);
    console.log(`Carpeta de apuntes: ${NOTES_DIR}`);
});