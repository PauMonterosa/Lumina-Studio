import { Pause, Play, Radio, Save, Trash2, X } from "lucide-react";

function formatDateLabel(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    return new Intl.DateTimeFormat("es-ES", {
        dateStyle: "medium",
    }).format(date);
}

export default function TranscriptionPanel({
    transcript,
    isListening,
    selectedDateKey,
    onSave,
    onClear,
    onResume,
    onPause,
}) {
    const hasTranscript = transcript.trim().length > 0;

    return (
        <section className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-4 shadow-xl shadow-cyan-500/10">
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.14),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.12),transparent_35%)]"></div>

            <div className="relative mb-3 flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <Radio
                            size={16}
                            className={isListening ? "text-cyan-300" : "text-slate-500"}
                        />
                        <h3 className="text-base font-semibold text-white">
                            Transcripción
                        </h3>
                    </div>

                    <p className="mt-1 text-xs text-slate-400">
                        Día:{" "}
                        <span className="text-cyan-200">
                            {formatDateLabel(selectedDateKey)}
                        </span>
                    </p>
                </div>

                {hasTranscript && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:border-rose-400/30 hover:text-rose-300"
                        title="Descartar transcripción"
                    >
                        <X size={15} />
                    </button>
                )}
            </div>

            <div
                className={`relative rounded-2xl border border-white/10 bg-black/25 p-4 shadow-inner shadow-black/40 transition-all duration-300 ${hasTranscript ? "min-h-[150px]" : "min-h-[58px]"
                    }`}
            >
                <div className="flex items-center gap-2">
                    <span
                        className={`h-2 w-2 rounded-full ${isListening
                            ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]"
                            : "bg-slate-600"
                            }`}
                    ></span>

                    <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                        {isListening ? "Escuchando" : hasTranscript ? "Pausada" : "En espera"}
                    </span>
                </div>

                {hasTranscript && (
                    <p className="mt-4 max-h-[480px] overflow-y-auto whitespace-pre-wrap pr-1 text-sm leading-relaxed text-slate-100">
                        {transcript}
                    </p>
                )}
            </div>

            <div className="relative mt-3 grid grid-cols-2 gap-2">
                {isListening ? (
                    <button
                        type="button"
                        onClick={onPause}
                        className="btn-secondary flex items-center justify-center gap-2 py-2 text-sm"
                    >
                        <Pause size={15} />
                        Pausar
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={onResume}
                        className="btn-secondary flex items-center justify-center gap-2 py-2 text-sm"
                    >
                        <Play size={15} />
                        {hasTranscript ? "Reanudar" : "Empezar"}
                    </button>
                )}

                <button
                    type="button"
                    onClick={onSave}
                    disabled={!hasTranscript}
                    className="btn-primary flex items-center justify-center gap-2 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Save size={15} />
                    Finalizar
                </button>

                <button
                    type="button"
                    onClick={onClear}
                    disabled={!hasTranscript && !isListening}
                    className="col-span-2 flex items-center justify-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <Trash2 size={15} />
                    Descartar grabación
                </button>
            </div>
        </section>
    );
}