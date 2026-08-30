import { useRef, useState } from "react";
import MessageContent from "./MessageContent";

const MODE_CONFIG = {
    conceptual: {
        label: "Conceptual",
        description: "Explicación clara",
        mood: "calm",
        panelClass: "border-cyan-400/25 bg-slate-950 shadow-cyan-500/10",
        headerClass: "border-cyan-400/10 bg-cyan-400/[0.04]",
        activeButtonClass:
            "border-cyan-400/50 bg-cyan-400/15 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.18)]",
        inactiveButtonClass:
            "border-white/10 bg-white/[0.03] text-slate-400 hover:border-cyan-400/30 hover:text-cyan-200",
        userBubbleClass:
            "bg-cyan-500/20 text-cyan-50 ring-1 ring-cyan-400/30",
        assistantBubbleClass:
            "bg-slate-900 text-slate-200 ring-1 ring-cyan-400/15",
        sendButtonClass: "bg-cyan-400 text-slate-950 hover:bg-cyan-300",
        watermarkClass: "text-cyan-300",
        smallBadgeClass: "text-cyan-300",
    },
    problems: {
        label: "Problemas",
        description: "Paso a paso",
        mood: "focused",
        panelClass: "border-amber-400/25 bg-slate-950 shadow-amber-500/10",
        headerClass: "border-amber-400/10 bg-amber-400/[0.04]",
        activeButtonClass:
            "border-amber-400/50 bg-amber-400/15 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.18)]",
        inactiveButtonClass:
            "border-white/10 bg-white/[0.03] text-slate-400 hover:border-amber-400/30 hover:text-amber-200",
        userBubbleClass:
            "bg-amber-500/20 text-amber-50 ring-1 ring-amber-400/30",
        assistantBubbleClass:
            "bg-slate-900 text-slate-200 ring-1 ring-amber-400/15",
        sendButtonClass: "bg-amber-400 text-slate-950 hover:bg-amber-300",
        watermarkClass: "text-amber-300",
        smallBadgeClass: "text-amber-300",
    },
    exam: {
        label: "Examen",
        description: "Máximo rigor",
        mood: "angry",
        panelClass: "border-rose-400/30 bg-slate-950 shadow-rose-500/15",
        headerClass: "border-rose-400/10 bg-rose-500/[0.05]",
        activeButtonClass:
            "border-rose-400/60 bg-rose-500/20 text-rose-100 shadow-[0_0_22px_rgba(244,63,94,0.22)]",
        inactiveButtonClass:
            "border-white/10 bg-white/[0.03] text-slate-400 hover:border-rose-400/30 hover:text-rose-200",
        userBubbleClass:
            "bg-rose-500/20 text-rose-50 ring-1 ring-rose-400/35",
        assistantBubbleClass:
            "bg-slate-900 text-slate-200 ring-1 ring-rose-400/20",
        sendButtonClass: "bg-rose-500 text-white hover:bg-rose-400",
        watermarkClass: "text-rose-300",
        smallBadgeClass: "text-rose-300",
    },
};

function getWelcomeMessage(languageName) {
    if (languageName === "catalán") {
        return "Soc **Lumina**, el teu assistent virtual d'estudi. Soc aquí per ajudar-te a entendre teoria, resoldre problemes i preparar exàmens amb el màxim rigor possible.";
    }

    if (languageName === "inglés") {
        return "I am **Lumina**, your virtual study assistant. I am here to help you understand theory, solve problems and prepare for exams with the highest possible rigor.";
    }

    return "Soy **Lumina**, tu asistente virtual de estudio. Estoy aquí para ayudarte a entender teoría, resolver problemas y preparar exámenes con el máximo rigor posible.";
}

function LlamaLogo({ mood = "calm", className = "" }) {
    const isCalm = mood === "calm";
    const isFocused = mood === "focused";
    const isAngry = mood === "angry";

    return (
        <svg
            viewBox="0 0 260 240"
            className={className}
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <path
                d="M126 57L88 18H57L99 94L126 83Z"
                fill="currentColor"
                fillOpacity="0.72"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinejoin="round"
            />

            <path
                d="M151 60L144 2L182 12L207 72L184 93Z"
                fill="currentColor"
                fillOpacity="0.68"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinejoin="round"
            />

            <path
                d="M76 100L122 62H165L204 83L226 131L207 169L209 218H118L92 171L61 154L41 119Z"
                fill="currentColor"
                fillOpacity="0.72"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinejoin="round"
            />

            <path
                d="M41 119L13 135L31 160L80 172L92 171L82 126Z"
                fill="currentColor"
                fillOpacity="0.9"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinejoin="round"
            />

            <path
                d="M118 218L136 153L207 169L209 218Z"
                fill="currentColor"
                fillOpacity="0.55"
            />

            <path
                d="M18 139L35 157L82 169L76 145L36 133Z"
                fill="white"
                fillOpacity="0.72"
            />

            <path
                d="M80 100L126 66H159L174 92L119 111L82 126Z"
                fill="white"
                fillOpacity="0.26"
            />

            <path
                d="M103 36L124 59L117 75L76 25H90Z"
                fill="white"
                fillOpacity="0.28"
            />

            <path
                d="M155 12L177 19L194 67L181 78Z"
                fill="white"
                fillOpacity="0.25"
            />

            <path
                d="M76 100L121 112L133 169"
                stroke="#0f172a"
                strokeWidth="13"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.92"
            />

            <path
                d="M132 169L209 124"
                stroke="#0f172a"
                strokeWidth="13"
                strokeLinecap="round"
                opacity="0.92"
            />

            <ellipse
                cx="163"
                cy="110"
                rx={isAngry ? "16" : "15"}
                ry={isAngry ? "22" : "26"}
                fill="white"
            />

            <circle
                cx={isAngry ? "167" : "162"}
                cy={isAngry ? "112" : "111"}
                r={isAngry ? "6.5" : "6"}
                fill="#0f172a"
            />

            {isCalm && (
                <path
                    d="M147 86C155 80 166 78 176 82"
                    stroke="#0f172a"
                    strokeWidth="6"
                    strokeLinecap="round"
                    opacity="0.75"
                />
            )}

            {isFocused && (
                <path
                    d="M146 84L176 92"
                    stroke="#0f172a"
                    strokeWidth="7"
                    strokeLinecap="round"
                />
            )}

            {isAngry && (
                <path
                    d="M144 82L181 96"
                    stroke="#0f172a"
                    strokeWidth="8"
                    strokeLinecap="round"
                />
            )}

            <path
                d="M39 130L33 148"
                stroke="#0f172a"
                strokeWidth="6"
                strokeLinecap="round"
                opacity="0.5"
            />

            <path
                d="M56 136L49 155"
                stroke="#0f172a"
                strokeWidth="6"
                strokeLinecap="round"
                opacity="0.5"
            />

            {isCalm && (
                <>
                    <path
                        d="M12 159L31 184L79 192L103 178L82 169L31 160Z"
                        fill="currentColor"
                        fillOpacity="0.68"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeLinejoin="round"
                    />

                    <path
                        d="M29 162L79 173"
                        stroke="#0f172a"
                        strokeWidth="8"
                        strokeLinecap="round"
                        opacity="0.85"
                    />
                </>
            )}

            {isFocused && (
                <>
                    <path
                        d="M10 165L33 199L86 211L112 189L82 169L31 160Z"
                        fill="currentColor"
                        fillOpacity="0.72"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeLinejoin="round"
                    />

                    <path
                        d="M29 162L86 177"
                        stroke="#0f172a"
                        strokeWidth="9"
                        strokeLinecap="round"
                        opacity="0.9"
                    />

                    <path
                        d="M34 184L83 195"
                        stroke="white"
                        strokeWidth="8"
                        strokeLinecap="round"
                        opacity="0.62"
                    />
                </>
            )}

            {isAngry && (
                <>
                    <path
                        d="M5 171L37 220L96 232L127 197L82 169L31 160Z"
                        fill="currentColor"
                        fillOpacity="0.78"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeLinejoin="round"
                    />

                    <path
                        d="M25 163L92 183"
                        stroke="#0f172a"
                        strokeWidth="11"
                        strokeLinecap="round"
                        opacity="0.95"
                    />

                    <path
                        d="M36 199L91 213"
                        stroke="white"
                        strokeWidth="10"
                        strokeLinecap="round"
                        opacity="0.7"
                    />

                    <path
                        d="M18 180L36 191"
                        stroke="#0f172a"
                        strokeWidth="5"
                        strokeLinecap="round"
                        opacity="0.35"
                    />
                </>
            )}

            <circle
                cx="102"
                cy="169"
                r="14"
                fill="white"
                fillOpacity="0.22"
            />

            <circle
                cx="111"
                cy="169"
                r="15"
                fill="#94a3b8"
                fillOpacity="0.55"
            />

            <path
                d="M154 218L157 185"
                stroke="#0f172a"
                strokeWidth="7"
                strokeLinecap="round"
                opacity="0.22"
            />

            <path
                d="M178 218L183 173"
                stroke="#0f172a"
                strokeWidth="7"
                strokeLinecap="round"
                opacity="0.22"
            />
        </svg>
    );
}

export default function ChatAsignatura({
    model = "qwen3.5:4b",
    inputValue,
    onInputChange,
    activeSubject = "electronics",
    activeSubjectName = "Asignatura",
    selectedDateKey = "",
    contextNotes = [],
    chatMode = "conceptual",
    onChatModeChange,
    languageCode = "es-ES",
    languageName = "castellano",
}) {
    const mode = MODE_CONFIG[chatMode] || MODE_CONFIG.conceptual;

    const [messages, setMessages] = useState([
        {
            role: "assistant",
            content: getWelcomeMessage(languageName),
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
            const recentMessages = nextMessages.slice(-12);

            const response = await fetch("http://localhost:3001/api/chat/contextual", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                signal: controller.signal,
                body: JSON.stringify({
                    model,
                    stream: true,
                    subject: activeSubject,
                    subjectName: activeSubjectName,
                    selectedDateKey,
                    mode: chatMode,
                    languageCode,
                    languageName,
                    diaryNotes: contextNotes,
                    messages: recentMessages.map((msg) => ({
                        role: msg.role,
                        content: msg.content,
                    })),
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.error || `Error HTTP ${response.status}`);
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
                err.message ||
                "No he podido conectar con el backend contextual. Comprueba que npm run notes esté activo y que Ollama esté ejecutándose."
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
        <section
            className={`relative flex h-full w-full flex-col overflow-hidden rounded-2xl border shadow-2xl transition-all duration-300 ${mode.panelClass}`}
        >
            <LlamaLogo
                mood={mode.mood}
                className={`pointer-events-none absolute left-1/2 top-1/2 z-0 h-[410px] w-[410px] -translate-x-1/2 -translate-y-1/2 opacity-[0.07] ${mode.watermarkClass}`}
            />

            <header
                className={`relative z-10 border-b px-5 py-4 transition-all duration-300 ${mode.headerClass}`}
            >
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-100">
                            Lumina Tutor
                        </h2>

                        <p className="text-sm text-slate-400">
                            Modelo local:{" "}
                            <span className={mode.smallBadgeClass}>{model}</span>
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                            Contexto activo: {contextNotes.length} notas de{" "}
                            {activeSubjectName} · Idioma: {languageName}
                        </p>
                    </div>

                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                        <LlamaLogo
                            mood={mode.mood}
                            className={`h-11 w-11 ${mode.watermarkClass}`}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    {Object.entries(MODE_CONFIG).map(([key, item]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onChatModeChange?.(key)}
                            className={`rounded-xl border px-3 py-2 text-left transition ${chatMode === key
                                    ? item.activeButtonClass
                                    : item.inactiveButtonClass
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <LlamaLogo mood={item.mood} className="h-5 w-5" />
                                <span className="text-xs font-semibold">
                                    {item.label}
                                </span>
                            </div>

                            <p className="mt-1 text-[10px] leading-snug opacity-70">
                                {item.description}
                            </p>
                        </button>
                    ))}
                </div>
            </header>

            <main className="relative z-10 flex-1 space-y-5 overflow-y-auto px-5 py-5">
                {messages.map((message, index) => (
                    <div
                        key={index}
                        className={`flex ${message.role === "user"
                                ? "justify-end"
                                : "justify-start"
                            }`}
                    >
                        <article
                            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === "user"
                                    ? mode.userBubbleClass
                                    : mode.assistantBubbleClass
                                }`}
                        >
                            <MessageContent content={message.content} />
                        </article>
                    </div>
                ))}

                {isLoading && (
                    <p className="text-sm text-slate-500">
                        Generando respuesta en modo {mode.label.toLowerCase()}...
                    </p>
                )}
            </main>

            <form
                onSubmit={handleSubmit}
                className="relative z-10 border-t border-white/10 bg-black/20 p-4"
            >
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
                        placeholder={
                            chatMode === "conceptual"
                                ? "Pregunta una duda conceptual..."
                                : chatMode === "problems"
                                    ? "Pega un problema o enunciado..."
                                    : "Pregunta como si estuvieras preparando un examen..."
                        }
                        rows={2}
                        className="input-dark min-h-[52px] flex-1 resize-none"
                    />

                    {isLoading ? (
                        <button
                            type="button"
                            onClick={stopGeneration}
                            className="btn-secondary border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                        >
                            Parar
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${mode.sendButtonClass}`}
                        >
                            Enviar
                        </button>
                    )}
                </div>
            </form>
        </section>
    );
}