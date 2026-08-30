import express from "express";
import cors from "cors";
import fs from "node:fs/promises";
import path from "node:path";
import { registerNotebookRoutes } from "./notebookRoutes.js";
import { registerNotebookAiRoutes } from "./notebookAiRoutes.js";
import { registerNotebookFigureRoutes } from "./notebookFigureRoutes.js";
import { registerGoogleCalendarBridgeRoutes } from "./googleCalendarBridgeRoutes.js";

const app = express();

const PORT = 3001;
const OLLAMA_URL = "http://localhost:11434/api/chat";
const NOTES_MODEL = process.env.NOTES_MODEL || "qwen3.5:4b";
const STUDY_MODEL = process.env.STUDY_MODEL || NOTES_MODEL;

const OLLAMA_NUM_CTX = 4096;
const OLLAMA_KEEP_ALIVE = "1m";

const SUBJECT_FILES = {
    electronics: "electronics.tex",
    quantum: "quantum.tex",
    control: "control.tex",
    photonics: "photonics.tex",
    solid_state: "solid_state.tex",
};

const SUBJECT_NAMES = {
    electronics: "Electrónica Física",
    quantum: "Mecánica Cuántica",
    control: "Teoría de Control",
    photonics: "Fotónica",
    solid_state: "Estado Sólido",
};

const STUDY_MODES = {
    mindmap: "Mindmap",
    podcast: "Podcast",
    flashcards: "Flashcards",
    exam: "Examen práctico",
};

const CHAT_MODES = {
    conceptual: "Conceptual",
    problems: "Problemas",
    exam: "Examen",
};

const NOTES_DIR = path.resolve(process.cwd(), "notes", "subjects");

app.use(cors());
app.use(express.json({ limit: "6mb" }));

registerNotebookRoutes(app);
registerNotebookAiRoutes(app);
registerNotebookFigureRoutes(app);
registerGoogleCalendarBridgeRoutes(app);

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
        return limitText(content, 18000);
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
- Mantén el contenido en el idioma de salida indicado por el usuario.
- Corrige la redacción oral, pero conserva el significado.
- No añadas conclusiones que no estén en la transcripción.
`.trim();
}

function buildUserPrompt({ subject, text, languageName = "castellano" }) {
    return `
Asignatura: ${subject}

Idioma de salida:
${languageName}

Transcripción oral:
"""
${text}
"""

Convierte esta transcripción en apuntes universitarios en LaTeX.
`.trim();
}

async function askOllama({
    model,
    systemPrompt,
    userPrompt,
    temperature = 0.2,
    numPredict = 1200,
}) {
    const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            stream: false,

            // En este portátil priorizamos velocidad y temperatura.
            think: false,

            // Descarga el modelo tras 1 minuto sin actividad.
            keep_alive: OLLAMA_KEEP_ALIVE,

            options: {
                temperature,
                top_p: 0.85,

                // Perfil conservador para nuestro hardware.
                num_ctx: OLLAMA_NUM_CTX,

                // Evita respuestas accidentalmente gigantes.
                num_predict: numPredict,
            },

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

async function convertTranscriptToLatex({
    subject,
    text,
    languageName = "castellano",
}) {
    const latex = await askOllama({
        model: NOTES_MODEL,
        systemPrompt: buildSystemPrompt(),
        userPrompt: buildUserPrompt({ subject, text, languageName }),
        temperature: 0.15,
    });

    return sanitizeLatexFragment(latex);
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
Idioma: ${note.languageName || "no indicado"}
${text}
`.trim();
        })
        .join("\n\n");

    return limitText(formatted, 12000);
}

function buildStudySystemPrompt(mode) {
    const commonRules = `
Eres un profesor universitario experto en Ingeniería Física.

Debes generar material de estudio de alta calidad usando únicamente el contexto proporcionado.

Reglas obligatorias:
- Responde en el idioma de salida indicado por el usuario.
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

function buildStudyUserPrompt({
    subjectName,
    mode,
    selectedDateKey,
    languageName = "castellano",
    latexContext,
    diaryNotes,
}) {
    return `
Asignatura activa:
${subjectName}

Idioma de salida:
${languageName}

Tipo de material solicitado:
${STUDY_MODES[mode] || mode}

Día seleccionado en el calendario:
${selectedDateKey || "ninguno"}

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

async function generateStudyMaterial({
    subject,
    subjectName,
    mode,
    selectedDateKey,
    languageName = "castellano",
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
            languageName,
            latexContext,
            diaryNotes,
        }),
        temperature: mode === "exam" ? 0.15 : 0.25,
    });

    return content;
}

function normalizeForDate(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

const MONTHS_BY_NAME = {
    enero: "01",
    gener: "01",
    january: "01",
    jan: "01",

    febrero: "02",
    febrer: "02",
    february: "02",
    feb: "02",

    marzo: "03",
    marc: "03",
    march: "03",
    mar: "03",

    abril: "04",
    april: "04",
    apr: "04",

    mayo: "05",
    maig: "05",
    may: "05",

    junio: "06",
    juny: "06",
    june: "06",
    jun: "06",

    julio: "07",
    juliol: "07",
    july: "07",
    jul: "07",

    agosto: "08",
    agost: "08",
    august: "08",
    aug: "08",

    septiembre: "09",
    setiembre: "09",
    setembre: "09",
    september: "09",
    sep: "09",

    octubre: "10",
    october: "10",
    oct: "10",

    noviembre: "11",
    novembre: "11",
    november: "11",
    nov: "11",

    diciembre: "12",
    desembre: "12",
    december: "12",
    dec: "12",
};

function getYearFromDateKey(dateKey) {
    if (!dateKey || typeof dateKey !== "string") {
        return new Date().getFullYear();
    }

    const year = Number(dateKey.slice(0, 4));

    return Number.isFinite(year) ? year : new Date().getFullYear();
}

function extractDateKeysFromText(text, fallbackYear) {
    if (!text || typeof text !== "string") return [];

    const found = new Set();

    const isoMatches = text.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
    isoMatches.forEach((dateKey) => found.add(dateKey));

    const lower = normalizeForDate(text);
    const monthNames = Object.keys(MONTHS_BY_NAME).join("|");

    const dayMonthRegex = new RegExp(
        `\\b(\\d{1,2})\\s*(?:de|of)?\\s*(${monthNames})(?:\\s*(?:de|of)?\\s*(\\d{4}))?\\b`,
        "g"
    );

    let match;

    while ((match = dayMonthRegex.exec(lower)) !== null) {
        const day = String(Number(match[1])).padStart(2, "0");
        const month = MONTHS_BY_NAME[match[2]];
        const year = match[3] || String(fallbackYear);

        if (month) {
            found.add(`${year}-${month}-${day}`);
        }
    }

    const monthDayRegex = new RegExp(
        `\\b(${monthNames})\\s*(\\d{1,2})(?:,)?\\s*(\\d{4})?\\b`,
        "g"
    );

    while ((match = monthDayRegex.exec(lower)) !== null) {
        const month = MONTHS_BY_NAME[match[1]];
        const day = String(Number(match[2])).padStart(2, "0");
        const year = match[3] || String(fallbackYear);

        if (month) {
            found.add(`${year}-${month}-${day}`);
        }
    }

    return [...found];
}

function getLastUserQuestion(messages = []) {
    if (!Array.isArray(messages)) return "";

    const lastUserMessage = [...messages]
        .reverse()
        .find((message) => message.role === "user");

    return lastUserMessage?.content || "";
}

function prioritizeDiaryNotes({
    diaryNotes = [],
    question = "",
    selectedDateKey = "",
}) {
    if (!Array.isArray(diaryNotes)) return [];

    const fallbackYear = getYearFromDateKey(selectedDateKey);
    const mentionedDateKeys = extractDateKeysFromText(question, fallbackYear);

    if (mentionedDateKeys.length > 0) {
        return diaryNotes.filter((note) =>
            mentionedDateKeys.includes(note.dateKey)
        );
    }

    return diaryNotes
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 40);
}

function formatDiaryNotesForChat(diaryNotes = []) {
    if (!Array.isArray(diaryNotes) || diaryNotes.length === 0) {
        return "No hay transcripciones guardadas relevantes para esta pregunta.";
    }

    const formatted = diaryNotes
        .slice(0, 50)
        .map((note, index) => {
            const text = typeof note.text === "string" ? note.text.trim() : "";

            return `
[Nota ${index + 1}]
Fecha clave: ${note.dateKey || "sin fecha"}
Creada: ${note.createdAt || "sin hora"}
Asignatura: ${note.subjectName || "sin asignatura"}
Idioma: ${note.languageName || "no indicado"}

Contenido:
${text}
`.trim();
        })
        .join("\n\n---\n\n");

    return limitText(formatted, 14000);
}

function buildChatSystemPrompt({
    subjectName,
    mode,
    selectedDateKey,
    languageCode = "es-ES",
    languageName = "castellano",
    latexContext,
    diaryNotes,
    question,
}) {
    const modeInstructions = {
        conceptual: `
Modo CONCEPTUAL:
- Explica con claridad, intuición física y rigor universitario.
- Prioriza entender el fenómeno antes que calcular.
- Usa ejemplos sencillos si ayudan.
- No alargues innecesariamente la respuesta.
`.trim(),

        problems: `
Modo PROBLEMAS:
- Resuelve paso a paso.
- Identifica datos, incógnitas, hipótesis y ecuaciones.
- Comprueba unidades cuando haya magnitudes físicas.
- No saltes pasos algebraicos importantes.
- Si falta un dato, dilo y plantea cómo se resolvería.
`.trim(),

        exam: `
Modo EXAMEN:
- Responde como una solución evaluable de examen.
- Sé más estricto, formal y completo.
- Justifica cada paso.
- Señala errores típicos.
- Incluye resultado final claramente.
- No des rodeos ni explicaciones vagas.
`.trim(),
    };

    return `
Eres el tutor local de Lumina Studio para la asignatura "${subjectName}".
El usuario estudia Ingeniería Física.

Debes responder usando prioritariamente el contexto proporcionado:
1. Apuntes LaTeX de la asignatura.
2. Transcripciones del diario.
3. Conversación actual.

Reglas obligatorias de veracidad:
- No inventes información.
- No uses placeholders tipo "[inserta aquí]".
- Si no tienes datos suficientes, dilo claramente.
- Si preguntan por una fecha concreta, busca en las notas por "Fecha clave".
- Si no hay transcripción para la fecha pedida, responde que no tienes ninguna transcripción guardada para esa fecha en esta asignatura.
- Si una transcripción es confusa, dilo.
- Responde siempre en ${languageName}, salvo que el usuario pida explícitamente otro idioma.
- El idioma esperado de la clase/transcripción es ${languageName} (${languageCode}).
- Mantén nivel universitario de Ingeniería Física.

Reglas obligatorias de formato:
- Usa Markdown real.
- Para negrita usa exactamente: **texto**
- Para listas usa guiones normales: - elemento
- Para fórmulas inline usa: $E = mc^2$
- Para fórmulas en bloque usa:

$$
E = h\\nu = \\hbar \\omega
$$

- No uses \\( ... \\) ni \\[ ... \\] para matemáticas.
- No escapes los asteriscos. Escribe **texto**, no \\*\\*texto\\*\\*.
- No metas toda la respuesta dentro de un bloque de código.
- Usa bloques de código solo si el usuario pide código.
- Si escribes código, usa triple backticks.
- Si escribes fórmulas, usa LaTeX limpio compatible con KaTeX.
- No escribas CSS, HTML ni instrucciones técnicas salvo que el usuario lo pida.

Modo activo:
${CHAT_MODES[mode] || CHAT_MODES.conceptual}

${modeInstructions[mode] || modeInstructions.conceptual}

Pregunta actual del usuario:
"""
${question}
"""

Día seleccionado en calendario:
${selectedDateKey || "ninguno"}

Idioma activo:
${languageName} (${languageCode})

Apuntes LaTeX de la asignatura:
"""
${latexContext || "El archivo LaTeX de esta asignatura está vacío."}
"""

Transcripciones del diario relevantes:
"""
${formatDiaryNotesForChat(diaryNotes)}
"""
`.trim();
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
        const {
            subject,
            text,
            languageName = "castellano",
        } = req.body;

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
            languageName,
        });

        const now = new Date();

        const block = `

% ---- Lumina Studio · ${now.toLocaleString("es-ES")} · ${languageName} ----

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
            languageName = "castellano",
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
            languageName,
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

app.post("/api/chat/contextual", async (req, res) => {
    try {
        const {
            model = STUDY_MODEL || NOTES_MODEL,
            subject,
            subjectName,
            selectedDateKey,
            mode = "conceptual",
            languageCode = "es-ES",
            languageName = "castellano",
            diaryNotes = [],
            messages = [],
            stream = true,
        } = req.body;

        if (!subject || !SUBJECT_FILES[subject]) {
            return res.status(400).json({
                ok: false,
                error: "Asignatura no válida.",
            });
        }

        if (!CHAT_MODES[mode]) {
            return res.status(400).json({
                ok: false,
                error: "Modo de chat no válido.",
            });
        }

        const finalSubjectName =
            subjectName || SUBJECT_NAMES[subject] || subject;

        const question = getLastUserQuestion(messages);

        const latexContext = await readSubjectLatex(subject);

        const relevantDiaryNotes = prioritizeDiaryNotes({
            diaryNotes,
            question,
            selectedDateKey,
        });

        const systemPrompt = buildChatSystemPrompt({
            subjectName: finalSubjectName,
            mode,
            selectedDateKey,
            languageCode,
            languageName,
            latexContext,
            diaryNotes: relevantDiaryNotes,
            question,
        });

        const ollamaResponse = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
    },
    body: JSON.stringify({
        model,
        stream,
        think: false,
        keep_alive: OLLAMA_KEEP_ALIVE,

        options: {
            temperature:
                mode === "exam"
                    ? 0.12
                    : mode === "problems"
                        ? 0.18
                        : 0.25,

            top_p: 0.85,
            num_ctx: OLLAMA_NUM_CTX,

            num_predict:
                mode === "exam"
                    ? 1200
                    : mode === "problems"
                        ? 900
                        : 600,
        },

        messages: [
            {
                role: "system",
                content: systemPrompt,
            },
            ...messages.map((message) => ({
                role: message.role,
                content: message.content,
            })),
        ],
    }),
});

            if(!ollamaResponse.ok) {
                return res.status(500).json({
                    ok: false,
                    error: `Ollama respondió con HTTP ${ollamaResponse.status}`,
                });
    }

        if (!stream) {
        const data = await ollamaResponse.json();
        return res.json(data);
    }

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    for await (const chunk of ollamaResponse.body) {
        res.write(Buffer.from(chunk));
    }

    res.end();
} catch (error) {
    console.error(error);

    if (!res.headersSent) {
        res.status(500).json({
            ok: false,
            error:
                error.message ||
                "No se pudo generar la respuesta contextual.",
        });
    } else {
        res.end();
    }
}
});

app.listen(PORT, async () => {
    await ensureNotesStructure();

    console.log(`Lumina Notes Server activo en http://localhost:${PORT}`);
    console.log(`Modelo de notas: ${NOTES_MODEL}`);
    console.log(`Modelo de estudio: ${STUDY_MODEL}`);
    console.log(`Carpeta de apuntes: ${NOTES_DIR}`);
});