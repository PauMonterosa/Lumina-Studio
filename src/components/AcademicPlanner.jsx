import {
  AlertTriangle,
  BookOpen,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Edit3,
  FileText,
  GraduationCap,
  MapPin,
  Mic,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(dateKey) {
  const [year, month, day] = String(dateKey || "")
    .split("-")
    .map(Number);

  return new Date(year, month - 1, day);
}

function getMonthLabel(date) {
  return new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatLongDate(dateKey) {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dateFromKey(dateKey));
}

function formatShortDate(dateKey) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
  }).format(dateFromKey(dateKey));
}

function formatTime(isoDate) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
}

function buildCalendarDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const mondayBasedStart = (firstDay.getDay() + 6) % 7;
  const days = [];

  for (let i = 0; i < mondayBasedStart; i += 1) {
    days.push(null);
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    days.push(new Date(year, month, day));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

const EVENT_TYPES = {
  class: {
    label: "Clase",
    icon: BookOpen,
    badge: "border-sky-400/25 bg-sky-400/10 text-sky-200",
  },
  study: {
    label: "Estudio",
    icon: BookOpen,
    badge: "border-purple-400/25 bg-purple-400/10 text-purple-200",
  },
  task: {
    label: "Tarea",
    icon: CheckCircle2,
    badge: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  },
  assignment: {
    label: "Entrega",
    icon: Briefcase,
    badge: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  },
  exam: {
    label: "Examen",
    icon: GraduationCap,
    badge: "border-rose-400/25 bg-rose-400/10 text-rose-200",
  },
  personal: {
    label: "Personal",
    icon: UserRound,
    badge: "border-pink-400/25 bg-pink-400/10 text-pink-200",
  },
  event: {
    label: "Evento",
    icon: CalendarDays,
    badge: "border-cyan-400/25 bg-cyan-400/10 text-cyan-200",
  },
};

const PRIORITY_CONFIG = {
  low: {
    label: "Baja",
    dot: "bg-slate-400",
    border: "border-l-slate-500/70",
    chip: "border-slate-400/20 bg-slate-400/5 text-slate-400",
  },
  normal: {
    label: "Normal",
    dot: "bg-amber-300",
    border: "border-l-amber-300/70",
    chip: "border-amber-300/20 bg-amber-300/5 text-amber-200",
  },
  high: {
    label: "Alta",
    dot: "bg-rose-400",
    border: "border-l-rose-400",
    chip: "border-rose-400/25 bg-rose-400/10 text-rose-200",
  },
};

const SUBJECT_STYLES = {
  electronics: {
    dot: "bg-cyan-300",
    text: "text-cyan-200",
    soft: "bg-cyan-400/[0.08]",
  },
  quantum: {
    dot: "bg-violet-300",
    text: "text-violet-200",
    soft: "bg-violet-400/[0.08]",
  },
  control: {
    dot: "bg-emerald-300",
    text: "text-emerald-200",
    soft: "bg-emerald-400/[0.08]",
  },
  photonics: {
    dot: "bg-amber-300",
    text: "text-amber-200",
    soft: "bg-amber-400/[0.08]",
  },
  solid_state: {
    dot: "bg-sky-300",
    text: "text-sky-200",
    soft: "bg-sky-400/[0.08]",
  },
  default: {
    dot: "bg-slate-300",
    text: "text-slate-300",
    soft: "bg-white/[0.05]",
  },
};

const COMPLETABLE_TYPES = new Set(["task", "assignment", "study"]);
const GOOGLE_CALENDAR_STORAGE_KEY = "lumina-google-calendar-id-v2";

function getSubjectStyle(subjectId) {
  return SUBJECT_STYLES[subjectId] || SUBJECT_STYLES.default;
}

function getPriorityConfig(priority) {
  return PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.normal;
}

function getDefaultDraft(subjects, selectedDateKey) {
  return {
    title: "",
    subject: subjects[0]?.id || "",
    type: "task",
    dateKey: selectedDateKey,
    time: "",
    endTime: "",
    priority: "normal",
    location: "",
    description: "",
  };
}

function getRelativeDateLabel(dateKey, todayKey) {
  const target = dateFromKey(dateKey);
  const today = dateFromKey(todayKey);
  const diff = Math.round((target - today) / 86400000);

  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff > 1 && diff <= 7) return `En ${diff} días`;

  return formatShortDate(dateKey);
}

function getLatexSubjectsForDate(index, dateKey) {
  if (!index) return [];

  const found = new Set();

  const addSubject = (subjectId) => {
    if (subjectId) found.add(subjectId);
  };

  if (Array.isArray(index)) {
    index.forEach((item) => {
      if (typeof item === "string") return;

      if (
        item?.dateKey === dateKey ||
        item?.date === dateKey ||
        item?.day === dateKey
      ) {
        addSubject(item.subject || item.subjectId);
      }
    });

    return [...found];
  }

  if (typeof index !== "object") return [];

  Object.entries(index).forEach(([key, value]) => {
    if (key === dateKey) {
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (typeof item === "string") addSubject(item);
          else addSubject(item?.subject || item?.subjectId);
        });
      } else if (value && typeof value === "object") {
        Object.keys(value).forEach(addSubject);
      }
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item === dateKey) addSubject(key);

        if (
          item?.dateKey === dateKey ||
          item?.date === dateKey ||
          item?.day === dateKey
        ) {
          addSubject(item.subject || item.subjectId || key);
        }
      });
    } else if (value && typeof value === "object") {
      if (value[dateKey]) addSubject(key);

      if (Array.isArray(value.dates) && value.dates.includes(dateKey)) {
        addSubject(key);
      }
    }
  });

  return [...found];
}

export default function AcademicPlanner({
  subjects = [],
  selectedDateKey,
  onSelectedDateChange,
  diaryNotes = [],
  events = [],
  onEventsChange,
  latexNoteIndex = null,
  onOpenNotebook,
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [draft, setDraft] = useState(() =>
    getDefaultDraft(subjects, selectedDateKey)
  );
  const [deletedEvent, setDeletedEvent] = useState(null);

  const [googleStatus, setGoogleStatus] = useState({
    configured: false,
    connected: false,
    calendarName: "",
  });
  const [googleCalendars, setGoogleCalendars] = useState([]);
  const [googleCalendarId, setGoogleCalendarId] = useState(() => {
    try {
      return localStorage.getItem(GOOGLE_CALENDAR_STORAGE_KEY) || "primary";
    } catch {
      return "primary";
    }
  });
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleMessage, setGoogleMessage] = useState("");

  useEffect(() => {
    if (!deletedEvent) return undefined;

    const timer = window.setTimeout(() => {
      setDeletedEvent(null);
    }, 6000);

    return () => window.clearTimeout(timer);
  }, [deletedEvent]);

  useEffect(() => {
    refreshGoogleStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        GOOGLE_CALENDAR_STORAGE_KEY,
        googleCalendarId || "primary"
      );
    } catch {
      // Lumina puede funcionar aunque localStorage no esté disponible.
    }
  }, [googleCalendarId]);

  const selectedDate = dateFromKey(selectedDateKey);
  const monthDate = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    1
  );

  const calendarDays = buildCalendarDays(monthDate);
  const todayKey = getDateKey();

  const eventsByDate = useMemo(() => {
    return events.reduce((acc, event) => {
      const dateKey = event.dateKey || todayKey;
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(event);
      return acc;
    }, {});
  }, [events, todayKey]);

  const notesByDate = useMemo(() => {
    return diaryNotes.reduce((acc, note) => {
      const key =
        note.dateKey ||
        getDateKey(note.createdAt ? new Date(note.createdAt) : new Date());

      if (!acc[key]) acc[key] = [];
      acc[key].push(note);
      return acc;
    }, {});
  }, [diaryNotes]);

  const selectedEvents = useMemo(() => {
    return [...(eventsByDate[selectedDateKey] || [])].sort((a, b) => {
      const timeA = a.time || "99:99";
      const timeB = b.time || "99:99";
      return timeA.localeCompare(timeB);
    });
  }, [eventsByDate, selectedDateKey]);

  const selectedNotes = useMemo(() => {
    return [...(notesByDate[selectedDateKey] || [])].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );
  }, [notesByDate, selectedDateKey]);

  const selectedLatexSubjects = useMemo(
    () => getLatexSubjectsForDate(latexNoteIndex, selectedDateKey),
    [latexNoteIndex, selectedDateKey]
  );

  const upcomingEvents = useMemo(() => {
    return events
      .filter((event) => {
        const isFuture = (event.dateKey || todayKey) >= todayKey;
        const isDone =
          COMPLETABLE_TYPES.has(event.type) && Boolean(event.completed);

        return isFuture && !isDone;
      })
      .sort((a, b) => {
        const byDate = (a.dateKey || todayKey).localeCompare(
          b.dateKey || todayKey
        );

        if (byDate !== 0) return byDate;

        const priorityWeight = {
          high: 0,
          normal: 1,
          low: 2,
        };

        const byPriority =
          (priorityWeight[a.priority] ?? 1) -
          (priorityWeight[b.priority] ?? 1);

        if (byPriority !== 0) return byPriority;

        return (a.time || "99:99").localeCompare(b.time || "99:99");
      })
      .slice(0, 10);
  }, [events, todayKey]);

  const subjectName = (subjectId) =>
    subjects.find((subject) => subject.id === subjectId)?.name || "General";

  async function readGoogleApiResponse(response, routeName) {
    const text = await response.text();
    let data = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(
        `${routeName} no devolvió JSON. Reinicia el backend de Lumina.`
      );
    }

    return data;
  }

  const loadGoogleCalendars = async () => {
    try {
      const response = await fetch(
        "http://localhost:3001/api/calendar/google/calendars"
      );
      const data = await readGoogleApiResponse(
        response,
        "/api/calendar/google/calendars"
      );

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.error || "No se pudieron cargar tus calendarios."
        );
      }

      const calendars = data.calendars || [];
      setGoogleCalendars(calendars);

      if (calendars.length > 0) {
        const selectedExists = calendars.some(
          (calendar) =>
            calendar.id === googleCalendarId ||
            (googleCalendarId === "primary" && calendar.primary)
        );

        if (!selectedExists) {
          const primary =
            calendars.find((calendar) => calendar.primary) || calendars[0];

          setGoogleCalendarId(primary.id);
        }
      }
    } catch (error) {
      setGoogleMessage(
        error.message || "No se pudieron cargar tus calendarios."
      );
    }
  };

  const refreshGoogleStatus = async () => {
    try {
      const response = await fetch(
        "http://localhost:3001/api/calendar/google/status"
      );
      const data = await readGoogleApiResponse(
        response,
        "/api/calendar/google/status"
      );

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.error || "No se pudo comprobar Google Calendar."
        );
      }

      const next = {
        configured: Boolean(data.configured),
        connected: Boolean(data.connected),
        calendarName: data.calendarName || "",
      };

      setGoogleStatus(next);

      if (next.connected) {
        await loadGoogleCalendars();
      }

      return next;
    } catch (error) {
      setGoogleStatus({
        configured: false,
        connected: false,
        calendarName: "",
      });
      setGoogleMessage(
        error.message || "No se pudo comprobar Google Calendar."
      );

      return {
        configured: false,
        connected: false,
        calendarName: "",
      };
    }
  };

  const syncGoogleMonth = async () => {
    if (!googleStatus.connected || !googleCalendarId) return;

    setGoogleLoading(true);
    setGoogleMessage("Sincronizando el mes visible...");

    try {
      const monthStart = new Date(
        monthDate.getFullYear(),
        monthDate.getMonth(),
        1
      );
      const monthEnd = new Date(
        monthDate.getFullYear(),
        monthDate.getMonth() + 1,
        1
      );

      const monthStartKey = getDateKey(monthStart);
      const monthEndKey = getDateKey(monthEnd);

      const monthEvents = events.filter(
        (event) =>
          event.dateKey >= monthStartKey &&
          event.dateKey < monthEndKey
      );

      const response = await fetch(
        "http://localhost:3001/api/calendar/google/sync",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            calendarId: googleCalendarId,
            monthStart: monthStartKey,
            monthEnd: monthEndKey,
            events: monthEvents,
          }),
        }
      );

      const data = await readGoogleApiResponse(
        response,
        "/api/calendar/google/sync"
      );

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.error || "No se pudo sincronizar Google Calendar."
        );
      }

      const syncedEvents = data.events || [];

      onEventsChange((previous) => {
        const outsideMonth = previous.filter(
          (event) =>
            event.dateKey < monthStartKey ||
            event.dateKey >= monthEndKey
        );

        return [...outsideMonth, ...syncedEvents];
      });

      const stats = data.stats || {};

      setGoogleMessage(
        `Sincronizado: ${stats.imported || 0} importados · ${
          stats.created || 0
        } enviados · ${stats.updated || 0} actualizados`
      );
    } catch (error) {
      setGoogleMessage(
        error.message || "No se pudo sincronizar Google Calendar."
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  const deleteExternalGoogleEvent = async (event) => {
    if (
      event?.source === "google" ||
      !event?.externalEventId ||
      !event?.externalCalendarId ||
      !googleStatus.connected
    ) {
      return;
    }

    try {
      await fetch("http://localhost:3001/api/calendar/google/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          calendarId: event.externalCalendarId,
          eventId: event.externalEventId,
        }),
      });
    } catch {
      // El borrado local no debe bloquearse si Apps Script no responde.
    }
  };

  const changeMonth = (offset) => {
    const next = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth() + offset,
      1
    );

    onSelectedDateChange(getDateKey(next));
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingEventId(null);
    setDraft(getDefaultDraft(subjects, selectedDateKey));
  };

  const openCreateForm = () => {
    setEditingEventId(null);
    setDraft(getDefaultDraft(subjects, selectedDateKey));
    setShowForm(true);
  };

  const openEditForm = (event) => {
    setEditingEventId(event.id);
    setDraft({
      title: event.title || "",
      subject: event.subject || subjects[0]?.id || "",
      type: event.type || "event",
      dateKey: event.dateKey || selectedDateKey,
      time: event.time || "",
      endTime: event.endTime || "",
      priority: event.priority || "normal",
      location: event.location || "",
      description: event.description || "",
    });
    setShowForm(true);
  };

  const saveEvent = (submitEvent) => {
    submitEvent.preventDefault();

    const title = draft.title.trim();
    if (!title) return;

    if (editingEventId) {
      onEventsChange((previous) =>
        previous.map((event) =>
          event.id === editingEventId
            ? {
                ...event,
                title,
                subject: draft.subject,
                type: draft.type,
                dateKey: draft.dateKey || selectedDateKey,
                time: draft.time,
                endTime: draft.endTime,
                priority: draft.priority,
                location: draft.location.trim(),
                description: draft.description.trim(),
                updatedAt: new Date().toISOString(),
              }
            : event
        )
      );

      if (draft.dateKey && draft.dateKey !== selectedDateKey) {
        onSelectedDateChange(draft.dateKey);
      }
    } else {
      const newEvent = {
        id: makeId(),
        title,
        subject: draft.subject,
        type: draft.type,
        dateKey: draft.dateKey || selectedDateKey,
        time: draft.time,
        endTime: draft.endTime,
        priority: draft.priority,
        location: draft.location.trim(),
        description: draft.description.trim(),
        completed: false,
        source: "lumina",
        externalCalendarId: null,
        externalEventId: null,
        createdAt: new Date().toISOString(),
      };

      onEventsChange((previous) => [...previous, newEvent]);

      if (newEvent.dateKey !== selectedDateKey) {
        onSelectedDateChange(newEvent.dateKey);
      }
    }

    closeForm();
  };

  const toggleEvent = (eventId) => {
    onEventsChange((previous) =>
      previous.map((event) =>
        event.id === eventId
          ? {
              ...event,
              completed: !event.completed,
              completedAt: !event.completed ? new Date().toISOString() : null,
            }
          : event
      )
    );
  };

  const deleteEvent = (eventId) => {
    const target = events.find((event) => event.id === eventId);
    if (!target) return;

    setDeletedEvent(target);
    deleteExternalGoogleEvent(target);

    onEventsChange((previous) =>
      previous.filter((event) => event.id !== eventId)
    );

    if (editingEventId === eventId) {
      closeForm();
    }
  };

  const undoDelete = () => {
    if (!deletedEvent) return;

    onEventsChange((previous) => {
      if (previous.some((event) => event.id === deletedEvent.id)) {
        return previous;
      }

      return [...previous, deletedEvent];
    });

    setDeletedEvent(null);
  };

  const duplicateEvent = (event) => {
    const copy = {
      ...event,
      id: makeId(),
      title: `${event.title} (copia)`,
      completed: false,
      completedAt: null,
      source: "lumina",
      externalCalendarId: null,
      externalEventId: null,
      externalUpdatedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: undefined,
    };

    onEventsChange((previous) => [...previous, copy]);
    openEditForm(copy);
  };

  const openLatexNotebook = (subjectId, dateKey) => {
    if (typeof onOpenNotebook === "function") {
      onOpenNotebook(subjectId, dateKey);
    }
  };

  return (
    <main className="w-full max-w-[1450px] mx-auto px-4 pb-8 z-10">
      {deletedEvent && (
        <div className="fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/95 px-4 py-3 shadow-2xl backdrop-blur-xl">
          <Trash2 size={16} className="shrink-0 text-rose-300" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {deletedEvent.title}
            </p>
            <p className="text-xs text-slate-500">Evento eliminado</p>
          </div>
          <button
            type="button"
            onClick={undoDelete}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/15"
          >
            <RotateCcw size={13} />
            Deshacer
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_410px]">
        <section className="glass-card border-white/5 p-5 shadow-2xl">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                <CalendarDays size={21} />
              </div>

              <div>
                <h2 className="text-xl font-semibold text-white">
                  Agenda académica
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Planificación, tareas, entregas, exámenes y apuntes.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={openCreateForm}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={16} />
              Nuevo
            </button>
          </div>

          <div className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-4 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                className="rounded-full border border-white/10 bg-white/5 p-2.5 text-slate-400 transition hover:border-cyan-400/30 hover:text-cyan-200"
                aria-label="Mes anterior"
              >
                <ChevronLeft size={17} />
              </button>

              <button
                type="button"
                onClick={() => onSelectedDateChange(todayKey)}
                className="text-center"
              >
                <p className="text-lg font-semibold capitalize text-white">
                  {getMonthLabel(monthDate)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">Ir a hoy</p>
              </button>

              <button
                type="button"
                onClick={() => changeMonth(1)}
                className="rounded-full border border-white/10 bg-white/5 p-2.5 text-slate-400 transition hover:border-cyan-400/30 hover:text-cyan-200"
                aria-label="Mes siguiente"
              >
                <ChevronRight size={17} />
              </button>
            </div>

            <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
              <span>L</span>
              <span>M</span>
              <span>X</span>
              <span>J</span>
              <span>V</span>
              <span>S</span>
              <span>D</span>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((day, index) => {
                if (!day) {
                  return (
                    <div
                      key={`empty-${index}`}
                      className="min-h-[104px] rounded-xl"
                    />
                  );
                }

                const key = getDateKey(day);
                const isSelected = key === selectedDateKey;
                const isToday = key === todayKey;
                const dayEvents = [...(eventsByDate[key] || [])].sort(
                  (a, b) => (a.time || "99:99").localeCompare(b.time || "99:99")
                );
                const dayNotes = notesByDate[key] || [];
                const dayLatexSubjects = getLatexSubjectsForDate(
                  latexNoteIndex,
                  key
                );

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onSelectedDateChange(key)}
                    className={`group min-h-[104px] rounded-xl border p-2 text-left transition ${
                      isSelected
                        ? "border-cyan-400/50 bg-cyan-400/12 shadow-[0_0_18px_rgba(34,211,238,0.12)]"
                        : isToday
                          ? "border-cyan-400/25 bg-cyan-400/[0.05]"
                          : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-1">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                          isSelected
                            ? "bg-cyan-400 text-slate-950"
                            : isToday
                              ? "text-cyan-200"
                              : "text-slate-300"
                        }`}
                      >
                        {day.getDate()}
                      </span>

                      <div className="flex items-center gap-1">
                        {dayLatexSubjects.length > 0 && (
                          <FileText size={12} className="text-cyan-300" />
                        )}
                        {dayNotes.length > 0 && (
                          <Mic size={12} className="text-purple-300" />
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((event) => {
                        const subjectStyle = getSubjectStyle(event.subject);
                        const priority = getPriorityConfig(event.priority);

                        return (
                          <div
                            key={event.id}
                            className={`truncate rounded-md border-l-2 px-1.5 py-1 text-[10px] ${priority.border} ${
                              event.completed
                                ? "bg-white/5 text-slate-600 line-through"
                                : `${subjectStyle.soft} text-slate-300`
                            }`}
                          >
                            <span
                              className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${subjectStyle.dot}`}
                            />
                            {event.title}
                          </div>
                        );
                      })}

                      {dayEvents.length > 3 && (
                        <p className="px-1 text-[10px] text-slate-500">
                          +{dayEvents.length - 3} más
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/5 pt-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                prioridad alta
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-300" />
                normal
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                baja
              </span>
              <span className="flex items-center gap-1.5">
                <FileText size={11} className="text-cyan-300" />
                apuntes
              </span>
              <span className="flex items-center gap-1.5">
                <Mic size={11} className="text-purple-300" />
                grabación
              </span>
            </div>
          </div>

          {showForm && (
            <form
              onSubmit={saveEvent}
              className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-white">
                    {editingEventId ? "Editar evento" : "Nuevo evento"}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Puedes cambiar fecha, tipo y prioridad sin eliminarlo.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-white"
                  aria-label="Cerrar formulario"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="md:col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-400">
                    Título
                  </span>
                  <input
                    value={draft.title}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        title: event.target.value,
                      }))
                    }
                    className="input-dark"
                    placeholder="Ej. Entrega práctica 2"
                    autoFocus
                  />
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-400">
                    Fecha
                  </span>
                  <input
                    type="date"
                    value={draft.dateKey}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        dateKey: event.target.value,
                      }))
                    }
                    className="input-dark"
                  />
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-400">
                    Asignatura
                  </span>
                  <select
                    value={draft.subject}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        subject: event.target.value,
                      }))
                    }
                    className="input-dark"
                  >
                    {subjects.map((subject) => (
                      <option
                        key={subject.id}
                        value={subject.id}
                        className="bg-slate-950"
                      >
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-400">
                    Tipo
                  </span>
                  <select
                    value={draft.type}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        type: event.target.value,
                      }))
                    }
                    className="input-dark"
                  >
                    {Object.entries(EVENT_TYPES).map(([key, item]) => (
                      <option key={key} value={key} className="bg-slate-950">
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-400">
                    Prioridad
                  </span>
                  <select
                    value={draft.priority}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        priority: event.target.value,
                      }))
                    }
                    className="input-dark"
                  >
                    <option value="low" className="bg-slate-950">
                      Baja
                    </option>
                    <option value="normal" className="bg-slate-950">
                      Normal
                    </option>
                    <option value="high" className="bg-slate-950">
                      Alta
                    </option>
                  </select>
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-400">
                    Hora inicio
                  </span>
                  <input
                    type="time"
                    value={draft.time}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        time: event.target.value,
                      }))
                    }
                    className="input-dark"
                  />
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-400">
                    Hora fin
                  </span>
                  <input
                    type="time"
                    value={draft.endTime}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        endTime: event.target.value,
                      }))
                    }
                    className="input-dark"
                  />
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-400">
                    Ubicación
                  </span>
                  <input
                    value={draft.location}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        location: event.target.value,
                      }))
                    }
                    className="input-dark"
                    placeholder="Ej. A4-101"
                  />
                </label>

                <label className="md:col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-400">
                    Descripción
                  </span>
                  <textarea
                    value={draft.description}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        description: event.target.value,
                      }))
                    }
                    className="input-dark min-h-24 resize-y"
                    placeholder="Detalles, contenido, requisitos..."
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="submit" className="btn-primary">
                  {editingEventId ? "Guardar cambios" : "Guardar en agenda"}
                </button>

                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-5">
          <section className="glass-card border-white/5 p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                  Día seleccionado
                </p>
                <h3 className="mt-2 text-lg font-semibold capitalize text-white">
                  {formatLongDate(selectedDateKey)}
                </h3>
              </div>

              <button
                type="button"
                onClick={openCreateForm}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:border-cyan-400/30 hover:text-cyan-200"
                title="Nuevo evento"
              >
                <Plus size={16} />
              </button>
            </div>

            <div className="space-y-3">
              {selectedEvents.length === 0 &&
                selectedNotes.length === 0 &&
                selectedLatexSubjects.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-center">
                    <CalendarDays
                      size={24}
                      className="mx-auto mb-2 text-slate-600"
                    />
                    <p className="text-sm text-slate-400">
                      No hay actividad en este día.
                    </p>
                  </div>
                )}

              {selectedEvents.map((event) => {
                const config = EVENT_TYPES[event.type] || EVENT_TYPES.event;
                const Icon = config.icon;
                const priority = getPriorityConfig(event.priority);
                const subjectStyle = getSubjectStyle(event.subject);
                const isCompletable = COMPLETABLE_TYPES.has(event.type);

                return (
                  <article
                    key={event.id}
                    className={`rounded-2xl border border-l-4 p-3 transition ${
                      priority.border
                    } ${
                      event.completed
                        ? "border-white/5 bg-white/[0.02] opacity-60"
                        : "border-white/10 bg-black/25"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {isCompletable ? (
                        <button
                          type="button"
                          onClick={() => toggleEvent(event.id)}
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${config.badge}`}
                          title={
                            event.completed
                              ? "Marcar como pendiente"
                              : "Marcar como completado"
                          }
                        >
                          {event.completed ? (
                            <CheckCircle2 size={16} />
                          ) : (
                            <Icon size={16} />
                          )}
                        </button>
                      ) : (
                        <div
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${config.badge}`}
                        >
                          <Icon size={16} />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p
                              className={`truncate text-sm font-semibold ${
                                event.completed
                                  ? "text-slate-500 line-through"
                                  : "text-white"
                              }`}
                            >
                              {event.title}
                            </p>

                            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                              <span className={subjectStyle.text}>
                                {subjectName(event.subject)}
                              </span>
                              <span>·</span>
                              <span>{config.label}</span>
                              {event.source === "google" && (
                                <>
                                  <span>·</span>
                                  <span className="text-blue-300">Google</span>
                                </>
                              )}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            {event.source !== "google" && (
                              <button
                                type="button"
                                onClick={() => openEditForm(event)}
                                className="rounded-lg p-1.5 text-slate-600 transition hover:bg-cyan-500/10 hover:text-cyan-300"
                                title="Editar"
                              >
                                <Edit3 size={14} />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => duplicateEvent(event)}
                              className="rounded-lg p-1.5 text-slate-600 transition hover:bg-purple-500/10 hover:text-purple-300"
                              title={
                                event.source === "google"
                                  ? "Crear una copia editable en Lumina"
                                  : "Duplicar"
                              }
                            >
                              <Copy size={14} />
                            </button>

                            {event.source !== "google" && (
                              <button
                                type="button"
                                onClick={() => deleteEvent(event.id)}
                                className="rounded-lg p-1.5 text-slate-600 transition hover:bg-rose-500/10 hover:text-rose-300"
                                title="Eliminar"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {(event.time || event.endTime) && (
                            <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-400">
                              <Clock size={11} />
                              {event.time || "—"}
                              {event.endTime ? `–${event.endTime}` : ""}
                            </span>
                          )}

                          {event.location && (
                            <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-400">
                              <MapPin size={11} />
                              {event.location}
                            </span>
                          )}

                          <span
                            className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] ${priority.chip}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${priority.dot}`}
                            />
                            {priority.label}
                          </span>
                        </div>

                        {event.description && (
                          <p className="mt-2 text-xs leading-relaxed text-slate-400">
                            {event.description}
                          </p>
                        )}

                        {event.source === "google" && (
                          <p className="mt-2 text-[10px] leading-relaxed text-blue-200/60">
                            Evento importado de Google. Edítalo o elimínalo en
                            Google Calendar y vuelve a sincronizar; puedes
                            duplicarlo para crear una copia editable en Lumina.
                          </p>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}

              {selectedLatexSubjects.map((subjectId) => {
                const subjectStyle = getSubjectStyle(subjectId);
                const content = (
                  <>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-300">
                      <FileText size={15} />
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-sm font-semibold text-white">
                        Apuntes LaTeX
                      </p>
                      <p className={`mt-1 text-xs ${subjectStyle.text}`}>
                        {subjectName(subjectId)}
                      </p>
                    </div>
                  </>
                );

                return typeof onOpenNotebook === "function" ? (
                  <button
                    key={`latex-${subjectId}`}
                    type="button"
                    onClick={() =>
                      openLatexNotebook(subjectId, selectedDateKey)
                    }
                    className="flex w-full items-center gap-3 rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.04] p-3 transition hover:border-cyan-400/30 hover:bg-cyan-500/[0.07]"
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    key={`latex-${subjectId}`}
                    className="flex items-center gap-3 rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.04] p-3"
                  >
                    {content}
                  </div>
                );
              })}

              {selectedNotes.map((note) => (
                <article
                  key={note.id}
                  className="rounded-2xl border border-purple-400/20 bg-purple-500/[0.06] p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-purple-400/20 bg-purple-500/10 text-purple-300">
                      <Mic size={15} />
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">
                        Grabación · {note.subjectName}
                      </p>
                      <p className="mt-1 text-xs text-purple-200/70">
                        {formatTime(note.createdAt)}
                      </p>
                      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-400">
                        {note.text}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="glass-card border-white/5 p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <CalendarDays size={17} className="text-blue-300" />
                  <h3 className="font-semibold text-white">
                    Google Calendar
                  </h3>
                </div>

                <p className="mt-1 text-xs text-slate-500">
                  {googleStatus.connected
                    ? googleStatus.calendarName || "Apps Script conectado"
                    : googleStatus.configured
                      ? "Puente configurado, pero no responde"
                      : "Falta configurar el secreto local"}
                </p>
              </div>

              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  googleStatus.connected
                    ? "bg-emerald-400"
                    : googleStatus.configured
                      ? "bg-amber-300"
                      : "bg-slate-600"
                }`}
              />
            </div>

            {!googleStatus.configured && (
              <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.05] p-3">
                <p className="text-xs leading-5 text-amber-100/80">
                  Abre
                  <span className="mx-1 font-mono text-amber-200">
                    google-calendar.bridge.json
                  </span>
                  en la raíz de Lumina y pega tu LUMINA_SECRET.
                </p>
              </div>
            )}

            {googleStatus.configured && !googleStatus.connected && (
              <button
                type="button"
                onClick={refreshGoogleStatus}
                disabled={googleLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-400/20 bg-blue-400/10 px-3 py-2.5 text-sm font-semibold text-blue-100 transition hover:bg-blue-400/15 disabled:opacity-50"
              >
                <RefreshCw
                  size={15}
                  className={googleLoading ? "animate-spin" : ""}
                />
                Comprobar conexión
              </button>
            )}

            {googleStatus.connected && (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                    Calendario de sincronización
                  </span>

                  <select
                    value={googleCalendarId}
                    onChange={(event) =>
                      setGoogleCalendarId(event.target.value)
                    }
                    className="input-dark"
                  >
                    {googleCalendars.map((calendar) => (
                      <option
                        key={calendar.id}
                        value={calendar.id}
                        className="bg-slate-950"
                      >
                        {calendar.primary ? "★ " : ""}
                        {calendar.name}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={syncGoogleMonth}
                  disabled={googleLoading || !googleCalendarId}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/15 disabled:opacity-50"
                >
                  <RefreshCw
                    size={15}
                    className={googleLoading ? "animate-spin" : ""}
                  />
                  Sincronizar {getMonthLabel(monthDate)}
                </button>
              </div>
            )}

            {googleMessage && (
              <p className="mt-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-[11px] leading-5 text-slate-400">
                {googleMessage}
              </p>
            )}
          </section>

          <section className="glass-card border-white/5 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BookOpen size={17} className="text-amber-300" />
                <h3 className="font-semibold text-white">Próximos</h3>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                {upcomingEvents.length} visibles
              </span>
            </div>

            <div className="space-y-2">
              {upcomingEvents.length === 0 && (
                <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-500">
                  No tienes próximos eventos.
                </p>
              )}

              {upcomingEvents.map((event) => {
                const config = EVENT_TYPES[event.type] || EVENT_TYPES.event;
                const priority = getPriorityConfig(event.priority);
                const subjectStyle = getSubjectStyle(event.subject);

                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onSelectedDateChange(event.dateKey)}
                    className={`flex w-full items-center gap-3 rounded-xl border border-l-4 p-3 text-left transition hover:border-white/20 hover:bg-white/[0.04] ${priority.border} ${
                      subjectStyle.soft
                    }`}
                  >
                    <div className="min-w-[62px]">
                      <p className="text-xs font-semibold text-cyan-200">
                        {getRelativeDateLabel(event.dateKey, todayKey)}
                      </p>

                      {event.time && (
                        <p className="mt-1 text-[10px] text-slate-600">
                          {event.time}
                        </p>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-200">
                        {event.title}
                      </p>

                      <p className="mt-1 truncate text-xs text-slate-500">
                        <span className={subjectStyle.text}>
                          {subjectName(event.subject)}
                        </span>
                        {" · "}
                        {config.label}
                      </p>
                    </div>

                    {event.priority === "high" && (
                      <AlertTriangle
                        size={15}
                        className="shrink-0 text-rose-300"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
