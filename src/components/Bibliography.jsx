// LUMINA_BIBLIOGRAPHY_V1
import {
  BookOpen,
  ExternalLink,
  FileText,
  Loader2,
  Presentation,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = "http://localhost:3001";

const CATEGORY_LABELS = {
  book: "Libro",
  paper: "Paper",
  notes: "Apuntes",
  slides: "Diapositivas",
};

function bytesLabel(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Bibliography({
  subjects,
  activeSubject,
  onSubjectChange,
  onOpenInNotes,
}) {
  const fileInputRef = useRef(null);
  const [documents, setDocuments] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("book");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewingId, setPreviewingId] = useState("");

  const activeSubjectData =
    subjects.find((subject) => subject.id === activeSubject) || subjects[0];

  const refresh = async () => {
    setStatus("loading");
    setError("");
    try {
      const response = await fetch(
        `${API_BASE}/api/library/documents?subject=${encodeURIComponent(activeSubject)}`
      );
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo abrir la bibliografía.");
      }
      setDocuments(data.documents || []);
      setStatus("ready");
    } catch (err) {
      setError(err.message || "No se pudo conectar con la biblioteca de Lumina.");
      setStatus("error");
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubject]);

  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return documents;
    return documents.filter((doc) =>
      [doc.title, doc.author, doc.filename, CATEGORY_LABELS[doc.category]]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(clean)
    );
  }, [documents, query]);

  const grouped = useMemo(() => {
    const pdfs = filtered.filter((doc) => doc.kind === "pdf");
    const slides = filtered.filter((doc) => doc.kind === "pptx");
    return { pdfs, slides };
  }, [filtered]);

  const upload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file || uploading) return;

    const ext = file.name.toLowerCase().split(".").pop();
    if (!(["pdf", "pptx"].includes(ext))) {
      setError("Selecciona un PDF o un PowerPoint .pptx.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/library/upload`, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-Lumina-Filename": encodeURIComponent(file.name),
          "X-Lumina-Subject": activeSubject,
          "X-Lumina-Title": encodeURIComponent(title.trim()),
          "X-Lumina-Author": encodeURIComponent(author.trim()),
          "X-Lumina-Category": ext === "pptx" ? "slides" : category,
        },
        body: file,
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo añadir el documento.");
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTitle("");
      setAuthor("");
      await refresh();
    } catch (err) {
      setError(err.message || "Error subiendo el documento.");
    } finally {
      setUploading(false);
    }
  };

  const removeDocument = async (doc) => {
    if (!window.confirm(`¿Eliminar “${doc.title}” de la bibliografía local?`)) return;
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/library/document/${doc.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo eliminar.");
      }
      await refresh();
    } catch (err) {
      setError(err.message || "No se pudo eliminar el documento.");
    }
  };

  const generatePreview = async (doc) => {
    setPreviewingId(doc.id);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/library/preview/${doc.id}`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo generar la vista previa.");
      }
      await refresh();
    } catch (err) {
      setError(err.message || "No se pudo generar la vista previa.");
    } finally {
      setPreviewingId("");
    }
  };

  const DocumentCard = ({ doc }) => {
    const Icon = doc.kind === "pptx" ? Presentation : FileText;
    return (
      <article className="group rounded-2xl border border-white/10 bg-slate-950/55 p-4 transition hover:border-cyan-400/25 hover:bg-slate-950/80">
        <div className="flex items-start gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
            doc.kind === "pptx"
              ? "border-orange-400/20 bg-orange-400/10 text-orange-300"
              : "border-cyan-400/20 bg-cyan-400/10 text-cyan-300"
          }`}>
            <Icon size={20} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 truncate font-semibold text-white">{doc.title}</h3>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {doc.kind === "pptx" ? "PPTX" : "PDF"}
              </span>
              <span className="rounded-full border border-purple-400/15 bg-purple-400/[0.06] px-2 py-0.5 text-[10px] text-purple-200">
                {CATEGORY_LABELS[doc.category] || doc.category}
              </span>
            </div>

            <p className="mt-1 truncate text-xs text-slate-500">
              {doc.author ? `${doc.author} · ` : ""}{doc.filename}
            </p>

            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
              <span>{bytesLabel(doc.size)}</span>
              {doc.kind === "pptx" && <span>{doc.slideCount || 0} diapositivas</span>}
              <span className={doc.ragReady ? "text-emerald-300" : "text-amber-300"}>
                {doc.ragReady ? "IA lista" : "IA pendiente"}
              </span>
              {doc.kind === "pptx" && (
                <span className={doc.previewAvailable ? "text-cyan-300" : "text-slate-600"}>
                  {doc.previewAvailable ? "Preview visual" : "Preview textual"}
                </span>
              )}
            </div>

            {doc.warning && (
              <p className="mt-2 text-xs leading-5 text-amber-300">{doc.warning}</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenInNotes?.(doc)}
            className="flex items-center gap-2 rounded-xl bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300"
          >
            <BookOpen size={14} />
            Abrir junto a apuntes
          </button>

          <a
            href={`${API_BASE}/api/library/file/${doc.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.07] hover:text-white"
          >
            <ExternalLink size={14} />
            Original
          </a>

          {doc.kind === "pptx" && !doc.previewAvailable && (
            <button
              type="button"
              onClick={() => generatePreview(doc)}
              disabled={previewingId === doc.id}
              className="flex items-center gap-2 rounded-xl border border-orange-400/20 bg-orange-400/[0.07] px-3 py-2 text-xs font-semibold text-orange-200 transition hover:bg-orange-400/[0.12] disabled:opacity-50"
            >
              {previewingId === doc.id ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Presentation size={14} />
              )}
              Vista previa visual
            </button>
          )}

          <button
            type="button"
            onClick={() => removeDocument(doc)}
            className="ml-auto rounded-xl border border-rose-400/15 bg-rose-500/[0.05] p-2 text-rose-300 transition hover:bg-rose-500/10"
            title="Eliminar de la biblioteca local"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </article>
    );
  };

  return (
    <main className="w-full max-w-[1400px] mx-auto px-4 pb-8 z-10">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="glass-card h-fit border-white/5 p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-2 text-white">
            <BookOpen size={18} className="text-cyan-300" />
            <h2 className="font-semibold">Asignatura</h2>
          </div>
          <div className="flex flex-col gap-2">
            {subjects.map((subject) => {
              const Icon = subject.icon;
              const active = subject.id === activeSubject;
              return (
                <button
                  key={subject.id}
                  type="button"
                  onClick={() => onSubjectChange?.(subject.id)}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    active
                      ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                      : "border-transparent text-slate-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  <Icon size={16} />
                  <span>{subject.name}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          <div className="glass-card border-white/5 p-5 shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-purple-300" />
                  <h2 className="text-lg font-semibold text-white">
                    Bibliografía · {activeSubjectData?.name}
                  </h2>
                </div>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                  Guarda libros, papers y presentaciones. Los PDFs siguen usando el RAG actual y los PPTX se indexan por diapositiva para que Lumina pueda consultarlos.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-2 text-xs text-emerald-200">
                {documents.length} documentos locales
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_1fr_1fr_auto]">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx"
                className="input-dark min-w-0"
              />
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="input-dark"
              >
                <option value="book">Libro</option>
                <option value="paper">Paper</option>
                <option value="notes">Apuntes</option>
                <option value="slides">Diapositivas</option>
              </select>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Título opcional"
                className="input-dark min-w-0"
              />
              <input
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="Autor opcional"
                className="input-dark min-w-0"
              />
              <button
                type="button"
                onClick={upload}
                disabled={uploading}
                className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                Añadir
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-200">
                {error}
              </div>
            )}
          </div>

          <div className="glass-card border-white/5 p-5 shadow-2xl">
            <div className="relative mb-5">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por título, autor o archivo..."
                className="input-dark w-full pl-10"
              />
            </div>

            {status === "loading" ? (
              <div className="flex min-h-52 items-center justify-center text-sm text-slate-500">
                <Loader2 size={18} className="mr-2 animate-spin" />
                Abriendo biblioteca...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center">
                <BookOpen size={34} className="mb-3 text-slate-700" />
                <p className="font-medium text-slate-400">Todavía no hay documentos.</p>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                  Añade un PDF o PPTX. Se guardará localmente dentro de Lumina y quedará asociado a esta asignatura.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {grouped.pdfs.length > 0 && (
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <FileText size={16} className="text-cyan-300" />
                      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">PDFs</h3>
                    </div>
                    <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
                      {grouped.pdfs.map((doc) => <DocumentCard key={doc.id} doc={doc} />)}
                    </div>
                  </div>
                )}

                {grouped.slides.length > 0 && (
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <Presentation size={16} className="text-orange-300" />
                      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">Presentaciones</h3>
                    </div>
                    <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
                      {grouped.slides.map((doc) => <DocumentCard key={doc.id} doc={doc} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
