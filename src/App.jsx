import {
  Sparkles,
  Cpu,
  Atom,
  Activity,
  SunMedium,
  Boxes,
  MessageSquare,
  CalendarDays,
  Database,
  Wifi,
  Globe,
} from "lucide-react";

import { useEffect, useRef, useState } from "react";
import "./index.css";
import "katex/dist/katex.min.css";

import VisualizadorAudio from "./components/VisualizadorAudio";
import ChatAsignatura from "./components/ChatAsignatura";
import TranscriptionPanel from "./components/TranscriptionPanel";
import NotesCalendarDiary from "./components/NotesCalendarDiary";
import StudyActionsPanel from "./components/StudyActionsPanel";
import StudyResultModal from "./components/StudyResultModal";

const STORAGE_KEY = "lumina-studio-diary-notes-v5";

const ASIGNATURAS = [
  { id: "electronics", name: "Electrónica Física", icon: Cpu },
  { id: "quantum", name: "Mecánica Cuántica", icon: Atom },
  { id: "control", name: "Teoría de Control", icon: Activity },
  { id: "photonics", name: "Fotónica", icon: SunMedium },
  { id: "solid_state", name: "Estado Sólido", icon: Boxes },
];

const APP_LANGUAGES = {
  ca: {
    id: "ca",
    label: "Català",
    shortLabel: "CAT",
    speechCode: "ca-ES",
    promptName: "catalán",
  },
  es: {
    id: "es",
    label: "Castellano",
    shortLabel: "ESP",
    speechCode: "es-ES",
    promptName: "castellano",
  },
  en: {
    id: "en",
    label: "English",
    shortLabel: "ENG",
    speechCode: "en-US",
    promptName: "inglés",
  },
};

const CHAT_MODE_LABELS = {
  conceptual: {
    label: "Conceptual",
    color: "text-cyan-300",
    bg: "bg-cyan-400/10",
    border: "border-cyan-400/20",
  },
  problems: {
    label: "Problemas",
    color: "text-amber-300",
    bg: "bg-amber-400/10",
    border: "border-amber-400/20",
  },
  exam: {
    label: "Examen",
    color: "text-rose-300",
    bg: "bg-rose-500/10",
    border: "border-rose-400/20",
  },
};

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatHeaderDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function App() {
  const audioControlsRef = useRef(null);

  const [activeSubject, setActiveSubject] = useState(ASIGNATURAS[0].id);
  const [chatInput, setChatInput] = useState("");
  const [voiceActive, setVoiceActive] = useState(false);

  const [liveTranscript, setLiveTranscript] = useState("");
  const [transcriptResetSignal, setTranscriptResetSignal] = useState(0);

  const [selectedDateKey, setSelectedDateKey] = useState(getDateKey());
  const [notesStatus, setNotesStatus] = useState("");

  const [chatMode, setChatMode] = useState("conceptual");
  const [appLanguage, setAppLanguage] = useState("es");

  const [isGeneratingStudy, setIsGeneratingStudy] = useState(false);
  const [studyResult, setStudyResult] = useState(null);

  const [diaryNotes, setDiaryNotes] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : [];

      return parsed.map((note) => ({
        ...note,
        dateKey:
          note.dateKey ||
          getDateKey(note.createdAt ? new Date(note.createdAt) : new Date()),
      }));
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(diaryNotes));
  }, [diaryNotes]);

  const activeSubjectData = ASIGNATURAS.find(
    (subject) => subject.id === activeSubject
  );

  const activeLanguage = APP_LANGUAGES[appLanguage] || APP_LANGUAGES.es;

  const activeSubjectNotes = diaryNotes
    .filter((note) => note.subject === activeSubject)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((note) => ({
      text: note.text,
      dateKey: note.dateKey,
      createdAt: note.createdAt,
      subjectName: note.subjectName,
      languageCode: note.languageCode,
      languageName: note.languageName,
    }));

  const handleSubjectChange = (subjectId) => {
    audioControlsRef.current?.pause();

    setActiveSubject(subjectId);
    setChatInput("");
    setVoiceActive(false);
    setNotesStatus("");
    setStudyResult(null);
  };

  const handleLanguageChange = (languageId) => {
    audioControlsRef.current?.pause();

    setAppLanguage(languageId);
    setVoiceActive(false);
    setNotesStatus("");
  };

  const clearLiveTranscript = () => {
    audioControlsRef.current?.pause();

    setLiveTranscript("");
    setTranscriptResetSignal((prev) => prev + 1);
  };

  const saveLiveTranscriptToDiary = () => {
    audioControlsRef.current?.pause();

    const cleanText = liveTranscript.trim();

    if (!cleanText) {
      setNotesStatus("No hay transcripción para guardar");
      return;
    }

    const now = new Date();

    const newNote = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      subject: activeSubject,
      subjectName: activeSubjectData?.name || activeSubject,
      text: cleanText,
      createdAt: now.toISOString(),
      dateKey: selectedDateKey,
      languageCode: activeLanguage.speechCode,
      languageName: activeLanguage.promptName,
      latexStatus: "idle",
      latexPreview: "",
      error: "",
    };

    setDiaryNotes((prev) => [newNote, ...prev]);
    setNotesStatus("Grabación guardada en el día seleccionado");

    setLiveTranscript("");
    setTranscriptResetSignal((prev) => prev + 1);
  };

  const addNoteToLatex = async (noteId) => {
    const note = diaryNotes.find((item) => item.id === noteId);
    if (!note) return;

    try {
      setNotesStatus("Convirtiendo nota a LaTeX...");

      setDiaryNotes((prev) =>
        prev.map((item) =>
          item.id === noteId
            ? {
              ...item,
              latexStatus: "loading",
              error: "",
            }
            : item
        )
      );

      const response = await fetch(
        "http://localhost:3001/api/notes/append-latex",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subject: note.subject,
            text: note.text,
            languageCode: note.languageCode || activeLanguage.speechCode,
            languageName: note.languageName || activeLanguage.promptName,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo guardar en LaTeX.");
      }

      setDiaryNotes((prev) =>
        prev.map((item) =>
          item.id === noteId
            ? {
              ...item,
              latexStatus: "done",
              latexPreview: data.latex || "",
              error: "",
            }
            : item
        )
      );

      setNotesStatus("Apuntes añadidos al archivo LaTeX");
    } catch (error) {
      console.error(error);

      setDiaryNotes((prev) =>
        prev.map((item) =>
          item.id === noteId
            ? {
              ...item,
              latexStatus: "error",
              error: error.message || "Error guardando en LaTeX.",
            }
            : item
        )
      );

      setNotesStatus("Error al añadir apuntes al LaTeX");
    }
  };

  const deleteNote = (noteId) => {
    setDiaryNotes((prev) => prev.filter((item) => item.id !== noteId));
  };

  const generateStudyArtifact = async (mode) => {
    try {
      setIsGeneratingStudy(true);
      setNotesStatus("Generando material de estudio...");

      const subjectNotes = diaryNotes
        .filter((note) => note.subject === activeSubject)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map((note) => ({
          text: note.text,
          dateKey: note.dateKey,
          createdAt: note.createdAt,
          subjectName: note.subjectName,
          languageCode: note.languageCode,
          languageName: note.languageName,
        }));

      const response = await fetch("http://localhost:3001/api/study/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject: activeSubject,
          subjectName: activeSubjectData?.name || activeSubject,
          mode,
          selectedDateKey,
          languageCode: activeLanguage.speechCode,
          languageName: activeLanguage.promptName,
          diaryNotes: subjectNotes,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo generar el material.");
      }

      setStudyResult({
        mode,
        content: data.content,
      });

      setNotesStatus("Material de estudio generado");
    } catch (error) {
      console.error(error);
      setNotesStatus(error.message || "Error generando material de estudio");
    } finally {
      setIsGeneratingStudy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col font-sans relative overflow-x-hidden">
      <div className="fixed top-[-10%] right-[-5%] w-[600px] h-[600px] bg-primary/20 rounded-full blur-[140px] pointer-events-none -z-10"></div>
      <div className="fixed bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-[var(--color-accent)]/10 rounded-full blur-[120px] pointer-events-none -z-10"></div>

      <header className="w-full max-w-[1400px] mx-auto px-4 pt-6 pb-5 z-10">
        <div className="glass-modal flex items-center justify-between gap-5 rounded-3xl border border-white/10 px-5 py-4 shadow-2xl shadow-primary/5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.18)]">
              <Sparkles size={22} />
            </div>

            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold tracking-tight text-white">
                  Lumina Studio
                </h1>

                <span className="rounded-full border border-purple-400/20 bg-purple-500/10 px-3 py-1 text-xs font-mono tracking-wide text-purple-300">
                  V4
                </span>
              </div>

              <p className="mt-1 text-sm text-slate-400">
                Learning Canvas · Asistente local para Ingeniería Física
              </p>
            </div>
          </div>

          <div className="hidden min-w-0 flex-1 justify-center lg:flex">
            <div className="flex max-w-xl items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-cyan-300">
                <MessageSquare size={18} />
              </div>

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {activeSubjectData?.name || activeSubject}
                </p>

                <p className="mt-0.5 text-xs text-slate-500">
                  Tutor contextual con apuntes, diario y LaTeX
                </p>
              </div>

              <div
                className={`ml-2 rounded-full border px-3 py-1 text-xs font-semibold ${CHAT_MODE_LABELS[chatMode]?.bg
                  } ${CHAT_MODE_LABELS[chatMode]?.border} ${CHAT_MODE_LABELS[chatMode]?.color
                  }`}
              >
                {CHAT_MODE_LABELS[chatMode]?.label}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-200">
              <Globe size={14} />

              <select
                value={appLanguage}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="cursor-pointer bg-transparent font-semibold outline-none"
                title="Idioma activo"
              >
                {Object.values(APP_LANGUAGES).map((language) => (
                  <option
                    key={language.id}
                    value={language.id}
                    className="bg-slate-950 text-slate-100"
                  >
                    {language.shortLabel}
                  </option>
                ))}
              </select>
            </div>

            <div className="hidden rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 md:flex md:items-center md:gap-2">
              <Wifi size={14} />
              <span>Local</span>
            </div>

            <div className="hidden rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300 sm:flex sm:items-center sm:gap-2">
              <Database size={14} className="text-purple-300" />
              <span>{activeSubjectNotes.length} notas</span>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300 flex items-center gap-2">
              <CalendarDays size={14} className="text-cyan-300" />
              <span>{formatHeaderDate(selectedDateKey)}</span>
            </div>

            {voiceActive && (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300">
                Grabando
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="w-full max-w-[1400px] mx-auto px-4 pb-6 grid grid-cols-1 gap-5 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_390px] items-start z-10">
        <div className="flex flex-col gap-5 min-w-0">
          <aside className="glass-card p-5 flex flex-col gap-5 shadow-2xl border-white/5">
            <h2 className="text-body-lg font-semibold text-white px-2">
              Tus Asignaturas
            </h2>

            <nav className="flex flex-col gap-2">
              {ASIGNATURAS.map((subject) => {
                const Icon = subject.icon;
                const isActive = activeSubject === subject.id;

                return (
                  <button
                    key={subject.id}
                    onClick={() => handleSubjectChange(subject.id)}
                    className={`flex items-center gap-4 px-4 py-3 rounded-12 transition-all duration-300 text-left ${isActive
                        ? "bg-primary/10 border border-primary/30 text-primary shadow-[0_0_15px_rgba(56,189,248,0.15)]"
                        : "hover:bg-white/5 text-slate-400 border border-transparent"
                      }`}
                  >
                    <Icon
                      size={18}
                      className={isActive ? "text-primary" : "text-slate-500"}
                    />

                    <span className="font-medium">{subject.name}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <StudyActionsPanel
            activeSubjectName={activeSubjectData?.name || activeSubject}
            isGenerating={isGeneratingStudy}
            onGenerate={generateStudyArtifact}
          />
        </div>

        <div className="min-w-0">
          <div className="glass-card flex flex-col overflow-hidden shadow-2xl h-[660px] border-white/5">
            <div className="p-5 border-b border-white/5 bg-black/20 flex items-center gap-3">
              <MessageSquare size={20} className="text-primary" />
              <h2 className="font-semibold text-white">
                Tutor AI: {activeSubjectData?.name}
              </h2>
            </div>

            <div className="flex-1 p-2 flex flex-col overflow-hidden">
              <ChatAsignatura
                key={`${activeSubject}-${appLanguage}`}
                model="qwen2.5"
                inputValue={chatInput}
                onInputChange={setChatInput}
                activeSubject={activeSubject}
                activeSubjectName={activeSubjectData?.name || activeSubject}
                selectedDateKey={selectedDateKey}
                contextNotes={activeSubjectNotes}
                chatMode={chatMode}
                onChatModeChange={setChatMode}
                languageCode={activeLanguage.speechCode}
                languageName={activeLanguage.promptName}
              />
            </div>
          </div>
        </div>

        <div className="min-w-0 flex flex-col gap-4">
          <VisualizadorAudio
            ref={audioControlsRef}
            transcriptSeed={liveTranscript}
            resetSignal={transcriptResetSignal}
            onLiveTranscriptChange={setLiveTranscript}
            onListeningChange={setVoiceActive}
            language={activeLanguage.speechCode}
          />

          <TranscriptionPanel
            transcript={liveTranscript}
            isListening={voiceActive}
            selectedDateKey={selectedDateKey}
            onSave={saveLiveTranscriptToDiary}
            onClear={clearLiveTranscript}
            onResume={() => audioControlsRef.current?.start()}
            onPause={() => audioControlsRef.current?.pause()}
          />

          <NotesCalendarDiary
            notes={diaryNotes}
            status={notesStatus}
            selectedDateKey={selectedDateKey}
            onSelectedDateChange={setSelectedDateKey}
            onAddToLatex={addNoteToLatex}
            onDeleteNote={deleteNote}
          />
        </div>
      </main>

      <StudyResultModal
        result={studyResult}
        onClose={() => setStudyResult(null)}
      />
    </div>
  );
}

export default App;