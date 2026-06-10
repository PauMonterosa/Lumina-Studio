import { useRef, useState } from "react";

const MAX_CONTEXT_CHARS = 30000;

function limitText(text, maxChars = MAX_CONTEXT_CHARS) {
    if (!text) return "";
    if (text.length <= maxChars) return text;

    return text.slice(text.length - maxChars);
}

function formatDateLabel(dateKey) {
    if (!dateKey) return "sin fecha";

    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    return new Intl.DateTimeFormat("es-ES", {
        dateStyle: "full",
    }).format(date);
}

function buildContextBlock({
    activeSubjectName,
    selectedDateKey,
    contextNotes = [],
}) {
    const notesBlock =
        contextNotes.length > 0
            ? contextNotes
                .map((note, index) => {
                    const dateKey = note.dateKey || "sin fecha";
                    const dateLabel = formatDateLabel(dateKey);
                    const createdAt = note.createdAt
                        ? new Date(note.createdAt).toLocaleString("es-ES")
                        : "sin hora";

                    return `
[NOTA ${index + 1}]
Fecha clave: ${dateKey}
Fecha en lenguaje natural: ${dateLabel}
Creada: ${createdAt}
Asignatura: ${note.subjectName || activeSubjectName}

Contenido:
${note.text}
`.trim();
                })
                .join("\n\n---\n\n")
            : "No hay notas guardadas para esta asignatura.";

    return limitText(`
ASIGNATURA ACTIVA:
${activeSubjectName}

DÍA SELECCIONADO EN EL CALENDARIO:
${selectedDateKey}
${formatDateLabel(selectedDateKey)}

NOTAS Y TRANSCRIPCIONES DISPONIBLES:
${notesBlock}
`.trim());
}

function buildSystemPrompt({
    activeSubjectName,
    selectedDateKey,
    contextNotes,
}) {
    const contextBlock = buildContextBlock({
        activeSubjectName,
        selectedDateKey,
        contextNotes,
    });

    return `
Eres el tutor local de Lumina Studio para la asignatura "${activeSubjectName}".

Tu fuente principal de verdad es el CONTEXTO DE APUNTES que aparece más abajo.
Debes responder usando SOLO información apoyada por ese contexto y por la conversación actual.

REGLAS OBLIGATORIAS:
- No inventes clases, profesores, tareas, fechas, temas ni explicaciones.
- No uses frases tipo "[inserta aquí]" ni placeholders.
- Si el usuario pregunta por una fecha concreta, busca en las notas por "Fecha clave" y por "Fecha en lenguaje natural".
- Si no hay información suficiente sobre esa fecha o tema, dilo claramente.
- Si no hay notas del día pedido, responde: "No tengo ninguna transcripción guardada para esa fecha en esta asignatura."
- Si hay notas relevantes, resume lo que se hizo de forma concreta.
- Cuando uses información de una nota, menciona la fecha de esa nota.
- Si el usuario pregunta algo de física, matemáticas o ingeniería, explica con rigor universitario.
- Si una transcripción es confusa, dilo y no completes huecos inventando.
- Responde en español salvo que el usuario pida otro idioma.

CONTEXTO DE APUNTES:
${contextBlock}
`.trim();
}

export default function ChatAsignatura({
    model = "llama3",
    inputValue,
    onInputChange,
    activeSubjectName = "Asignatura",
    selectedDateKey = "",
    contextNotes = [],
}) {
    const [messages, setMessages] = useState([
        {
            role: "assistant",
            content:
                "Hola. Soy tu asistente local para esta asignatura. Pregúntame lo que necesites.",
        },
    ]);

    const [localInput, setLocalInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const abortRef = useRef(null);

    const input = inputValue ?? localInput;
    const setInput = onInputChange ?? setLocalInput;

    const updateLastAssistantMessage = (chunk) => {
        setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;

            updated[lastIndex] = {
                ...updated[lastIndex],
                content: updated[lastIndex].content + chunk,
            };

            return updated;
        });
    };

    const replaceLastAssistantMessage = (text) => {
        setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;

            updated[lastIndex] = {
                ...updated[lastIndex],
                content: text,
            };

            return updated;
        });
    };

    const sendMessage = async () => {
        const cleanInput = input.trim();
        if (!cleanInput || isLoading) return;

        const userMessage = {
            role: "user",
            content: cleanInput,
        };

        const nextMessages = [...messages, userMessage];

        setMessages([
            ...nextMessages,
            {
                role: "assistant",
                content: "",
            },
        ]);

        setInput("");
        setIsLoading(true);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const systemPrompt = buildSystemPrompt({
                activeSubjectName,
                selectedDateKey,
                contextNotes,
            });

            const recentMessages = nextMessages.slice(-12);

            const response = await fetch("http://localhost:11434/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                signal: controller.signal,
                body: JSON.stringify({
                    model,
                    stream: true,
                    options: {
                        temperature: 0.2,
                        top_p: 0.85,
                    },
                    messages: [
                        {
                            role: "system",
                            content: systemPrompt,
                        },
                        ...recentMessages.map((msg) => ({
                            role: msg.role,
                            content: msg.content,
                        })),
                    ],
                }),
            });

            if (!response.ok) {
                throw new Error(`Error HTTP ${response.status}`);
            }

            if (!response.body) {
                const data = await response.json();
                replaceLastAssistantMessage(
                    data?.message?.content || "No se recibió respuesta del modelo."
                );
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");

            let buffer = "";

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;

                    let parsed;

                    try {
                        parsed = JSON.parse(trimmed);
                    } catch {
                        continue;
                    }

                    const chunk = parsed?.message?.content || "";

                    if (chunk) {
                        updateLastAssistantMessage(chunk);
                    }

                    if (parsed.done) break;
                }
            }
        } catch (err) {
            if (err.name === "AbortError") return;

            console.error(err);

            replaceLastAssistantMessage(
                "No he podido conectar con Ollama o generar una respuesta contextual. Comprueba que Ollama esté ejecutándose en localhost:11434 y que el modelo esté descargado."
            );
        } finally {
            setIsLoading(false);
            abortRef.current = null;
        }
    };

    const stopGeneration = () => {
        abortRef.current?.abort();
        setIsLoading(false);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        sendMessage();
    };

    return (
        <section className="flex h-[600px] w-full flex-col rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black/30">
            <header className="border-b border-slate-800 px-5 py-4">
                <h2 className="text-lg font-semibold text-slate-100">
                    Chat de Asignatura
                </h2>

                <p className="text-sm text-slate-400">
                    Modelo local: <span className="text-cyan-300">{model}</span>
                </p>

                <p className="mt-1 text-xs text-slate-500">
                    Contexto activo: {contextNotes.length} notas de{" "}
                    {activeSubjectName}
                </p>
            </header>

            <main className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
                {messages.map((message, index) => (
                    <div
                        key={index}
                        className={`flex ${message.role === "user" ? "justify-end" : "justify-start"
                            }`}
                    >
                        <article
                            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === "user"
                                    ? "bg-cyan-500/20 text-cyan-50 ring-1 ring-cyan-400/30"
                                    : "bg-slate-900 text-slate-200 ring-1 ring-slate-700"
                                }`}
                        >
                            <p className="whitespace-pre-wrap">{message.content}</p>
                        </article>
                    </div>
                ))}

                {isLoading && (
                    <p className="text-sm text-slate-500">Generando respuesta...</p>
                )}
            </main>

            <form onSubmit={handleSubmit} className="border-t border-slate-800 p-4">
                <div className="flex gap-3">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage();
                            }
                        }}
                        placeholder="Pregunta algo sobre la asignatura o tus clases guardadas..."
                        rows={2}
                        className="input-dark min-h-[52px] flex-1 resize-none"
                    />

                    {isLoading ? (
                        <button
                            type="button"
                            onClick={stopGeneration}
                            className="btn-secondary text-rose-300 border-rose-500/30 hover:bg-rose-500/10"
                        >
                            Parar
                        </button>
                    ) : (
                        <button type="submit" className="btn-primary">
                            Enviar
                        </button>
                    )}
                </div>
            </form>
        </section>
    );
}