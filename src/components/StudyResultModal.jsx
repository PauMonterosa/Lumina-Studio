import { Clipboard, X } from "lucide-react";

const MODE_LABELS = {
    mindmap: "Mindmap",
    podcast: "Podcast",
    flashcards: "Flashcards",
    exam: "Examen práctico",
};

export default function StudyResultModal({ result, onClose }) {
    if (!result) return null;

    const content = result.content || "";

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(content);
        } catch (error) {
            console.error("No se pudo copiar el resultado:", error);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
            <section className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl shadow-cyan-500/10">
                <header className="flex items-center justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-4">
                    <div>
                        <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300">
                            Material generado
                        </p>

                        <h2 className="mt-1 text-xl font-semibold text-white">
                            {MODE_LABELS[result.mode] || "Resultado"}
                        </h2>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={copyToClipboard}
                            className="btn-secondary flex items-center gap-2 text-sm"
                        >
                            <Clipboard size={15} />
                            Copiar
                        </button>

                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:border-rose-400/30 hover:text-rose-300"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </header>

                <main className="overflow-y-auto p-5">
                    <pre className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/30 p-5 text-sm leading-relaxed text-slate-100">
                        {content}
                    </pre>
                </main>
            </section>
        </div>
    );
}