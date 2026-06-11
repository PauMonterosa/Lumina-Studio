import {
    Sparkles,
    BookOpen,
    FileText,
    CalendarDays,
} from "lucide-react";

const ACTIONS = [
    {
        id: "mindmap",
        title: "Mindmap",
        description: "Mapa conceptual",
        icon: Sparkles,
        cardClass:
            "border-cyan-400/20 bg-cyan-400/5 hover:border-cyan-400/50 hover:bg-cyan-400/10",
        iconClass: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
        titleClass: "text-cyan-100",
    },
    {
        id: "podcast",
        title: "Podcast",
        description: "Guion explicativo",
        icon: CalendarDays,
        cardClass:
            "border-violet-400/20 bg-violet-400/5 hover:border-violet-400/50 hover:bg-violet-400/10",
        iconClass: "border-violet-400/30 bg-violet-400/10 text-violet-200",
        titleClass: "text-violet-100",
    },
    {
        id: "flashcards",
        title: "Flashcards",
        description: "Repaso activo",
        icon: BookOpen,
        cardClass:
            "border-emerald-400/20 bg-emerald-400/5 hover:border-emerald-400/50 hover:bg-emerald-400/10",
        iconClass:
            "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
        titleClass: "text-emerald-100",
    },
    {
        id: "exam",
        title: "Examen",
        description: "Problemas prácticos",
        icon: FileText,
        cardClass:
            "border-amber-400/20 bg-amber-400/5 hover:border-amber-400/50 hover:bg-amber-400/10",
        iconClass: "border-amber-400/30 bg-amber-400/10 text-amber-200",
        titleClass: "text-amber-100",
    },
];

export default function StudyActionsPanel({
    activeSubjectName,
    onGenerate,
    isGenerating,
}) {
    return (
        <section className="glass-modal p-5 flex flex-col gap-4 shadow-xl border-white/5">
            <div>
                <h3 className="text-body-md font-semibold text-white">
                    Herramientas de estudio
                </h3>

                <p className="mt-1 text-sm leading-relaxed text-slate-400">
                    Genera material desde tus apuntes de{" "}
                    <strong className="text-slate-300">
                        {activeSubjectName}
                    </strong>
                    .
                </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {ACTIONS.map((action) => {
                    const Icon = action.icon;

                    return (
                        <button
                            key={action.id}
                            type="button"
                            disabled={isGenerating}
                            onClick={() => onGenerate(action.id)}
                            className={`group rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${action.cardClass}`}
                        >
                            <div
                                className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl border transition group-hover:scale-105 ${action.iconClass}`}
                            >
                                <Icon size={18} />
                            </div>

                            <p className={`text-sm font-semibold ${action.titleClass}`}>
                                {action.title}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                                {action.description}
                            </p>
                        </button>
                    );
                })}
            </div>

            {isGenerating && (
                <p className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
                    Generando material de estudio...
                </p>
            )}
        </section>
    );
}