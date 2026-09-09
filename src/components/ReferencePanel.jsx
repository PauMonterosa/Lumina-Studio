// LUMINA_BIBLIOGRAPHY_V1_2_DRAGGABLE
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Move,
  PanelRight,
  Presentation,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = "http://localhost:3001";
const WINDOW_STORAGE_KEY = "lumina-reference-window-v1";
const MIN_WIDTH = 360;
const MIN_HEIGHT = 360;
const EDGE_GAP = 12;
const HEADER_VISIBLE = 120;

function viewportSize() {
  if (typeof window === "undefined") {
    return { width: 1440, height: 900 };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function defaultBounds() {
  const viewport = viewportSize();
  const width = Math.min(560, Math.max(MIN_WIDTH, viewport.width - 32));
  const height = Math.min(720, Math.max(MIN_HEIGHT, viewport.height - 190));

  return {
    x: Math.max(EDGE_GAP, viewport.width - width - 16),
    y: Math.min(170, Math.max(EDGE_GAP, viewport.height - HEADER_VISIBLE)),
    width,
    height,
  };
}

function clampBounds(bounds) {
  const viewport = viewportSize();
  const width = Math.max(
    MIN_WIDTH,
    Math.min(Number(bounds?.width) || MIN_WIDTH, Math.max(MIN_WIDTH, viewport.width - EDGE_GAP * 2))
  );
  const height = Math.max(
    MIN_HEIGHT,
    Math.min(Number(bounds?.height) || MIN_HEIGHT, Math.max(MIN_HEIGHT, viewport.height - EDGE_GAP * 2))
  );

  const minX = -width + HEADER_VISIBLE;
  const maxX = viewport.width - HEADER_VISIBLE;
  const minY = EDGE_GAP;
  const maxY = viewport.height - 72;

  return {
    x: Math.max(minX, Math.min(Number(bounds?.x) || 0, maxX)),
    y: Math.max(minY, Math.min(Number(bounds?.y) || 0, maxY)),
    width,
    height,
  };
}

function readStoredBounds() {
  try {
    const raw = window.localStorage.getItem(WINDOW_STORAGE_KEY);
    if (!raw) return defaultBounds();
    return clampBounds(JSON.parse(raw));
  } catch {
    return defaultBounds();
  }
}

function saveStoredBounds(bounds) {
  try {
    window.localStorage.setItem(WINDOW_STORAGE_KEY, JSON.stringify(bounds));
  } catch {
    // El panel sigue funcionando aunque localStorage esté bloqueado.
  }
}

export default function ReferencePanel({
  activeSubject,
  activeReference,
  onActiveReferenceChange,
  onClose,
}) {
  const [documents, setDocuments] = useState([]);
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState(false);

  const [bounds, setBounds] = useState(() =>
    typeof window === "undefined" ? defaultBounds() : readStoredBounds()
  );
  const [maximized, setMaximized] = useState(false);

  const interactionRef = useRef(null);
  const restoreBoundsRef = useRef(null);

  const selected = useMemo(
    () => documents.find((doc) => doc.id === activeReference?.id) || activeReference || null,
    [documents, activeReference]
  );

  const slideNumber = Math.max(1, Number(activeReference?.slide || 1));
  const currentSlide = slides.find((slide) => slide.number === slideNumber) || slides[0] || null;

  useEffect(() => {
    if (!maximized) {
      saveStoredBounds(bounds);
    }
  }, [bounds, maximized]);

  useEffect(() => {
    const handleResize = () => {
      if (maximized) {
        const viewport = viewportSize();
        setBounds({
          x: EDGE_GAP,
          y: EDGE_GAP,
          width: Math.max(MIN_WIDTH, viewport.width - EDGE_GAP * 2),
          height: Math.max(MIN_HEIGHT, viewport.height - EDGE_GAP * 2),
        });
      } else {
        setBounds((current) => clampBounds(current));
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [maximized]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const interaction = interactionRef.current;
      if (!interaction) return;

      const dx = event.clientX - interaction.startX;
      const dy = event.clientY - interaction.startY;

      if (interaction.type === "drag") {
        setBounds(
          clampBounds({
            ...interaction.startBounds,
            x: interaction.startBounds.x + dx,
            y: interaction.startBounds.y + dy,
          })
        );
        return;
      }

      if (interaction.type === "resize") {
        const viewport = viewportSize();
        const maxWidth = Math.max(MIN_WIDTH, viewport.width - interaction.startBounds.x - EDGE_GAP);
        const maxHeight = Math.max(MIN_HEIGHT, viewport.height - interaction.startBounds.y - EDGE_GAP);

        setBounds({
          ...interaction.startBounds,
          width: Math.max(MIN_WIDTH, Math.min(interaction.startBounds.width + dx, maxWidth)),
          height: Math.max(MIN_HEIGHT, Math.min(interaction.startBounds.height + dy, maxHeight)),
        });
      }
    };

    const stopInteraction = () => {
      interactionRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopInteraction);
    window.addEventListener("pointercancel", stopInteraction);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopInteraction);
      window.removeEventListener("pointercancel", stopInteraction);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, []);

  const beginDrag = (event) => {
    if (maximized || event.button !== 0) return;

    if (event.target.closest("button,select,input,a,textarea")) {
      return;
    }

    interactionRef.current = {
      type: "drag",
      startX: event.clientX,
      startY: event.clientY,
      startBounds: { ...bounds },
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    event.preventDefault();
  };

  const beginResize = (event) => {
    if (maximized || event.button !== 0) return;

    interactionRef.current = {
      type: "resize",
      startX: event.clientX,
      startY: event.clientY,
      startBounds: { ...bounds },
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "nwse-resize";
    event.preventDefault();
    event.stopPropagation();
  };

  const toggleMaximize = () => {
    if (maximized) {
      const restored = clampBounds(restoreBoundsRef.current || readStoredBounds());
      setBounds(restored);
      setMaximized(false);
      return;
    }

    restoreBoundsRef.current = { ...bounds };
    const viewport = viewportSize();
    setBounds({
      x: EDGE_GAP,
      y: EDGE_GAP,
      width: Math.max(MIN_WIDTH, viewport.width - EDGE_GAP * 2),
      height: Math.max(MIN_HEIGHT, viewport.height - EDGE_GAP * 2),
    });
    setMaximized(true);
  };

  const dockRight = () => {
    const viewport = viewportSize();
    const width = Math.max(MIN_WIDTH, Math.min(620, Math.round(viewport.width * 0.42)));
    const y = Math.min(150, Math.max(EDGE_GAP, Math.round(viewport.height * 0.12)));
    const height = Math.max(MIN_HEIGHT, viewport.height - y - EDGE_GAP);

    setMaximized(false);
    setBounds({
      x: Math.max(EDGE_GAP, viewport.width - width - EDGE_GAP),
      y,
      width,
      height,
    });
  };

  const loadDocuments = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `${API_BASE}/api/library/documents?subject=${encodeURIComponent(activeSubject)}`
      );
      const raw = await response.text();
      let data;

      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(
          "La API de Bibliografía no está disponible en el backend. Reinicia npm.cmd run notes."
        );
      }

      if (!response.ok || !data.ok) throw new Error(data?.error || "No se pudo abrir la bibliografía.");
      setDocuments(data.documents || []);
    } catch (err) {
      setError(err.message || "No se pudo cargar la bibliografía.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubject]);

  useEffect(() => {
    if (!selected || selected.kind !== "pptx") {
      setSlides([]);
      return;
    }
    let cancelled = false;
    const loadSlides = async () => {
      setError("");
      try {
        const response = await fetch(`${API_BASE}/api/library/pptx/${selected.id}/slides`);
        const raw = await response.text();
        let data;

        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          throw new Error("El backend no devolvió datos válidos para esta presentación.");
        }

        if (!response.ok || !data.ok) throw new Error(data?.error || "No se pudo leer el PowerPoint.");
        if (cancelled) return;
        setSlides(data.slides || []);
        if (data.previewAvailable && !selected.previewAvailable) {
          onActiveReferenceChange?.({ ...selected, previewAvailable: true, slide: slideNumber });
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "No se pudo leer la presentación.");
      }
    };
    loadSlides();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const chooseDocument = (id) => {
    const doc = documents.find((item) => item.id === id) || null;
    if (!doc) {
      onActiveReferenceChange?.(null);
      return;
    }
    onActiveReferenceChange?.({ ...doc, slide: doc.kind === "pptx" ? 1 : undefined });
  };

  const goToSlide = (next) => {
    if (!selected || selected.kind !== "pptx") return;
    const max = Math.max(1, slides.length || selected.slideCount || 1);
    const value = Math.max(1, Math.min(next, max));
    onActiveReferenceChange?.({ ...selected, slide: value });
  };

  const generatePreview = async () => {
    if (!selected || selected.kind !== "pptx") return;
    setPreviewing(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/library/preview/${selected.id}`, { method: "POST" });
      const raw = await response.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error("El backend no devolvió una respuesta válida al crear la vista previa.");
      }
      if (!response.ok || !data.ok) throw new Error(data?.error || "No se pudo crear la vista previa.");
      onActiveReferenceChange?.({ ...selected, previewAvailable: true, slide: slideNumber });
    } catch (err) {
      setError(err.message || "No se pudo crear la vista previa.");
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <section
      className="pointer-events-auto fixed z-[80] flex min-h-0 flex-col overflow-hidden rounded-2xl border border-cyan-400/20 bg-slate-950/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
      style={{
        left: `${bounds.x}px`,
        top: `${bounds.y}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
      }}
    >
      <header
        onPointerDown={beginDrag}
        onDoubleClick={toggleMaximize}
        className={`border-b border-white/10 bg-black/25 p-3 ${maximized ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
        title={maximized ? "Doble clic para restaurar" : "Arrastra para mover · doble clic para maximizar"}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
            <BookOpen size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Move size={12} className="text-slate-600" />
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300">
                Referencia activa
              </p>
            </div>
            <p className="truncate text-sm font-semibold text-white">{selected?.title || "Bibliografía"}</p>
          </div>

          <button
            type="button"
            onClick={dockRight}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-cyan-200"
            title="Acoplar a la derecha"
          >
            <PanelRight size={16} />
          </button>

          <button
            type="button"
            onClick={toggleMaximize}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-white"
            title={maximized ? "Restaurar ventana" : "Maximizar ventana"}
          >
            {maximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-white"
            title="Cerrar panel"
          >
            <X size={16} />
          </button>
        </div>

        <select
          value={selected?.id || ""}
          onChange={(event) => chooseDocument(event.target.value)}
          className="input-dark mt-3 w-full"
        >
          <option value="">Seleccionar documento...</option>
          {documents.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.kind === "pptx" ? "PPTX" : "PDF"} · {doc.title}
            </option>
          ))}
        </select>
      </header>

      {error && (
        <div className="m-3 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-xs leading-5 text-rose-200">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden p-3">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            <Loader2 size={17} className="mr-2 animate-spin" />
            Cargando bibliografía...
          </div>
        ) : !selected ? (
          <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 p-6 text-center">
            <BookOpen size={30} className="mb-3 text-slate-700" />
            <p className="font-medium text-slate-400">Elige una referencia.</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Puedes mantener un libro o PowerPoint abierto mientras escribes LaTeX.
            </p>
          </div>
        ) : selected.kind === "pdf" ? (
          <iframe
            src={`${API_BASE}/api/library/file/${selected.id}`}
            title={selected.title}
            className="h-full w-full rounded-xl border border-white/10 bg-white"
          />
        ) : selected.previewAvailable ? (
          <iframe
            key={`${selected.id}-${slideNumber}`}
            src={`${API_BASE}/api/library/preview/${selected.id}#page=${slideNumber}`}
            title={`${selected.title} · diapositiva ${slideNumber}`}
            className="h-full w-full rounded-xl border border-white/10 bg-white"
          />
        ) : (
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-900/70">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-orange-200">
                <Presentation size={14} />
                Vista textual · diap. {currentSlide?.number || slideNumber}/{slides.length || selected.slideCount || "?"}
              </div>
              <button
                type="button"
                onClick={generatePreview}
                disabled={previewing}
                className="flex items-center gap-1.5 rounded-lg border border-orange-400/20 bg-orange-400/[0.08] px-2.5 py-1.5 text-[11px] font-semibold text-orange-200 transition hover:bg-orange-400/[0.14] disabled:opacity-50"
                title="Usa Microsoft PowerPoint instalado en Windows para crear un PDF local"
              >
                {previewing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Generar preview visual
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-300">
                Diapositiva {currentSlide?.number || slideNumber}
              </p>
              <h3 className="mt-2 text-lg font-semibold text-white">
                {currentSlide?.title || selected.title}
              </h3>
              <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-300">
                {currentSlide?.text || "Esta diapositiva no contiene texto extraíble."}
              </div>
              {currentSlide?.notes && (
                <div className="mt-5 rounded-xl border border-purple-400/15 bg-purple-400/[0.05] p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-purple-200">
                    <Sparkles size={13} />
                    Notas del profesor
                  </div>
                  <p className="whitespace-pre-wrap text-xs leading-6 text-slate-400">{currentSlide.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {selected && (
        <footer className="border-t border-white/10 bg-black/20 p-3">
          {selected.kind === "pptx" && (
            <div className="mb-3 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => goToSlide(slideNumber - 1)}
                disabled={slideNumber <= 1}
                className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-slate-400 transition hover:text-white disabled:opacity-30"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="min-w-28 text-center text-xs text-slate-400">
                Diap. {slideNumber} / {slides.length || selected.slideCount || "?"}
              </span>
              <button
                type="button"
                onClick={() => goToSlide(slideNumber + 1)}
                disabled={slideNumber >= Math.max(1, slides.length || selected.slideCount || 1)}
                className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-slate-400 transition hover:text-white disabled:opacity-30"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-emerald-300">
              <Sparkles size={12} />
              <span className="truncate">
                {selected.kind === "pptx"
                  ? "La IA puede consultar esta presentación por diapositivas."
                  : "La IA puede consultar este PDF mediante el RAG existente."}
              </span>
            </div>
            <a
              href={`${API_BASE}/api/library/file/${selected.id}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-slate-400 transition hover:text-white"
              title="Abrir original"
            >
              {selected.kind === "pptx" ? <Presentation size={14} /> : <FileText size={14} />}
              <ExternalLink size={10} className="-ml-1 -mt-3 inline" />
            </a>
          </div>
        </footer>
      )}

      {!maximized && (
        <div
          onPointerDown={beginResize}
          className="absolute bottom-0 right-0 z-20 h-6 w-6 cursor-nwse-resize"
          title="Arrastra para redimensionar"
          aria-label="Redimensionar ventana de referencia"
        >
          <div className="absolute bottom-1.5 right-1.5 h-2.5 w-2.5 border-b-2 border-r-2 border-cyan-300/45" />
        </div>
      )}
    </section>
  );
}
