import {
  Sparkles,
  BookOpen,
  Calculator,
  Atom,
  Code,
  Globe,
  MessageSquare,
} from "lucide-react";

import { useEffect, useRef, useState } from "react";
import "./index.css";

import VisualizadorAudio from "./components/VisualizadorAudio";
import ChatAsignatura from "./components/ChatAsignatura";
import TranscriptionPanel from "./components/TranscriptionPanel";
import NotesCalendarDiary from "./components/NotesCalendarDiary";
import StudyActionsPanel from "./components/StudyActionsPanel";
import StudyResultModal from "./components/StudyResultModal";

const STORAGE_KEY = "lumina-studio-diary-notes-v5";

const ASIGNATURAS = [
  { id: "math", name: "Matemáticas Avanzadas", icon: Calculator },
  { id: "physics", name: "Física Cuántica", icon: Atom },
  { id: "programming", name: "Algoritmia y Datos", icon: Code },
  { id: "history", name: "Historia Universal", icon: Globe },
  { id: "literature", name: "Literatura Contemporánea", icon: BookOpen },
];

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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

  const handleSubjectChange = (subjectId) => {
    audioControlsRef.current?.pause();

    setActiveSubject(subjectId);
    setChatInput("");
    setVoiceActive(false);
    setNotesStatus("");
    setStudyResult(null);
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

      <header className="flex justify-center pt-6 pb-5 z-10">
        <div className="glass-modal px-7 py-3 flex items-center gap-4 rounded-full border border-white/10 shadow-2xl shadow-primary/5">
          <div className="chip-ai bg-white/5">
            <Sparkles size={14} />
            <span>Lumina Studio V4</span>
          </div>

          <h1 className="text-headline-md font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
            Learning Canvas
          </h1>
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

            <div className="flex-1 p-2 flex flex-col overflow-hidden [&>section]:h-full [&>section]:border-none [&>section]:shadow-none [&>section]:bg-transparent">
              <ChatAsignatura
                key={activeSubject}
                model="llama3"
                inputValue={chatInput}
                onInputChange={setChatInput}
                activeSubjectName={activeSubjectData?.name || activeSubject}
                selectedDateKey={selectedDateKey}
                contextNotes={diaryNotes
                  .filter((note) => note.subject === activeSubject)
                  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                  .map((note) => ({
                    text: note.text,
                    dateKey: note.dateKey,
                    createdAt: note.createdAt,
                    subjectName: note.subjectName,
                  }))}
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
            language="es-ES"
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