import {
    AlertTriangle,
    CalendarDays,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    FileText,
    Loader2,
    Plus,
    Trash2,
} from "lucide-react";

function getDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function dateFromKey(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function formatTime(isoDate) {
    const date = new Date(isoDate);

    return new Intl.DateTimeFormat("es-ES", {
        timeStyle: "short",
    }).format(date);
}

function getMonthLabel(date) {
    return new Intl.DateTimeFormat("es-ES", {
        month: "long",
        year: "numeric",
    }).format(date);
}

function buildCalendarDays(monthDate) {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const mondayBasedStart = (firstDay.getDay() + 6) % 7;
    const days = [];

    for (let i = 0; i < mondayBasedStart; i++) {
        days.push(null);
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
        days.push(new Date(year, month, day));
    }

    while (days.length % 7 !== 0) {
        days.push(null);
    }

    return days;
}

export default function NotesCalendarDiary({
    notes,
    status,
    selectedDateKey,
    onSelectedDateChange,
    onAddToLatex,
    onDeleteNote,
}) {
    const selectedDate = dateFromKey(selectedDateKey);
    const todayKey = getDateKey();

    const monthDate = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        1
    );

    const calendarDays = buildCalendarDays(monthDate);

    const notesByDate = notes.reduce((acc, note) => {
        const key = note.dateKey || getDateKey(new Date(note.createdAt));

        if (!acc[key]) acc[key] = [];
        acc[key].push(note);

        return acc;
    }, {});

    const selectedNotes = [...(notesByDate[selectedDateKey] || [])].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    const goToPreviousMonth = () => {
        const previous = new Date(
            selectedDate.getFullYear(),
            selectedDate.getMonth() - 1,
            1
        );

        onSelectedDateChange(getDateKey(previous));
    };

    const goToNextMonth = () => {
        const next = new Date(
            selectedDate.getFullYear(),
            selectedDate.getMonth() + 1,
            1
        );

        onSelectedDateChange(getDateKey(next));
    };

    const goToToday = () => {
        onSelectedDateChange(todayKey);
    };

    return (
        <section className="relative overflow-hidden rounded-2xl border border-purple-400/20 bg-slate-950/80 p-4 shadow-xl shadow-purple-500/10">
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.16),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.10),transparent_35%)]"></div>

            <div className="relative mb-3 flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <CalendarDays size={17} className="text-purple-300" />
                        <h3 className="text-base font-semibold text-white">
                            Diario
                        </h3>
                    </div>

                    <p className="mt-1 text-xs text-slate-400">
                        Calendario mensual de grabaciones
                    </p>
                </div>

                <div className="chip-ai bg-purple-500/10 text-purple-200">
                    <span>{notes.length} notas</span>
                </div>
            </div>

            <div className="relative mb-3 rounded-2xl border border-white/10 bg-black/25 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={goToPreviousMonth}
                        className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:border-cyan-400/30 hover:text-cyan-200"
                    >
                        <ChevronLeft size={15} />
                    </button>

                    <button type="button" onClick={goToToday} className="text-center">
                        <p className="text-sm font-semibold capitalize text-white">
                            {getMonthLabel(monthDate)}
                        </p>
                        <p className="text-xs text-slate-500">Ir a hoy</p>
                    </button>

                    <button
                        type="button"
                        onClick={goToNextMonth}
                        className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:border-cyan-400/30 hover:text-cyan-200"
                    >
                        <ChevronRight size={15} />
                    </button>
                </div>

                <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <span>L</span>
                    <span>M</span>
                    <span>X</span>
                    <span>J</span>
                    <span>V</span>
                    <span>S</span>
                    <span>D</span>
                </div>

                <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((day, index) => {
                        if (!day) {
                            return <div key={`empty-${index}`} className="h-9"></div>;
                        }

                        const key = getDateKey(day);
                        const isToday = key === todayKey;
                        const isSelected = key === selectedDateKey;
                        const dayNotes = notesByDate[key] || [];
                        const hasNotes = dayNotes.length > 0;

                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => onSelectedDateChange(key)}
                                className={`relative flex h-9 flex-col items-center justify-center rounded-lg text-sm transition ${isSelected
                                    ? "bg-cyan-400 text-slate-950 shadow-[0_0_14px_rgba(34,211,238,0.32)]"
                                    : isToday
                                        ? "border border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
                                        : "text-slate-300 hover:bg-white/10"
                                    }`}
                            >
                                <span>{day.getDate()}</span>

                                {(hasNotes || isToday) && (
                                    <span
                                        className={`absolute bottom-0.5 h-1 w-1 rounded-full ${hasNotes
                                            ? isSelected
                                                ? "bg-slate-950"
                                                : "bg-purple-300"
                                            : isSelected
                                                ? "bg-slate-950"
                                                : "bg-cyan-300"
                                            }`}
                                    ></span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {status && (
                <p className="relative mb-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                    {status}
                </p>
            )}

            <div className="relative mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">
                    Notas del día
                </p>

                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">
                    {selectedNotes.length}
                </span>
            </div>

            <div className="relative flex max-h-[180px] flex-col gap-3 overflow-y-auto pr-1">
                {selectedNotes.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-center">
                        <FileText size={22} className="mx-auto mb-2 text-slate-600" />
                        <p className="text-sm text-slate-400">
                            No hay grabaciones en este día.
                        </p>
                    </div>
                )}

                {selectedNotes.map((note) => (
                    <article
                        key={note.id}
                        className="group rounded-2xl border border-white/10 bg-black/25 p-3 transition hover:border-cyan-400/30 hover:bg-white/[0.04]"
                    >
                        <div className="mb-2 flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-white">
                                    {note.subjectName}
                                </p>

                                <p className="mt-1 text-xs text-slate-500">
                                    {formatTime(note.createdAt)}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => onDeleteNote(note.id)}
                                className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-500 opacity-70 transition hover:border-rose-400/30 hover:text-rose-300 group-hover:opacity-100"
                                title="Eliminar nota"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>

                        <p className="mb-3 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/5 bg-slate-950/70 p-3 text-xs leading-relaxed text-slate-300">
                            {note.text}
                        </p>

                        {note.latexStatus === "done" && (
                            <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                                <CheckCircle2 size={14} />
                                Añadido al LaTeX
                            </div>
                        )}

                        {note.latexStatus === "error" && (
                            <div className="mb-3 flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                                <AlertTriangle size={14} />
                                {note.error || "Error al añadir al LaTeX"}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => onAddToLatex(note.id)}
                            disabled={note.latexStatus === "loading"}
                            className="btn-primary flex w-full items-center justify-center gap-2 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {note.latexStatus === "loading" ? (
                                <>
                                    <Loader2 size={15} className="animate-spin" />
                                    Convirtiendo...
                                </>
                            ) : (
                                <>
                                    <Plus size={15} />
                                    Añadir al LaTeX
                                </>
                            )}
                        </button>
                    </article>
                ))}
            </div>
        </section>
    );
}