import { useRef, useState } from "react";

export default function ChatAsignatura({
    model = "llama3",
    inputValue,
    onInputChange,
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
            const response = await fetch("http://localhost:11434/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                signal: controller.signal,
                body: JSON.stringify({
                    model,
                    stream: true,
                    messages: nextMessages.map((msg) => ({
                        role: msg.role,
                        content: msg.content,
                    })),
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

                    const parsed = JSON.parse(trimmed);
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
                "No he podido conectar con Ollama. Comprueba que Ollama esté ejecutándose en localhost:11434 y que el modelo esté descargado."
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
                        placeholder="Pregunta algo sobre la asignatura..."
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