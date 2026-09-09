// LUMINA_BIBLIOGRAPHY_V1
import {
  Braces,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code2,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Search,
  Sigma,
  Sparkles,
  WandSparkles,
  X,
  Library,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReferencePanel from "./ReferencePanel";

const API_BASE = "http://localhost:3001";
const AUTOSAVE_DELAY_MS = 350;
const AUTOCOMPILE_DELAY_MS = 550;

function dateFromKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLongDate(dateKey) {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dateFromKey(dateKey));
}

function shiftDate(dateKey, offset) {
  const date = dateFromKey(dateKey);
  date.setDate(date.getDate() + offset);
  return getDateKey(date);
}

function insertAtSelection(textarea, value, selectionStart, selectionEnd) {
  const before = textarea.value.slice(0, selectionStart);
  const selected = textarea.value.slice(selectionStart, selectionEnd);
  const after = textarea.value.slice(selectionEnd);

  const replacement = value.replace("{{selection}}", selected);
  return {
    value: `${before}${replacement}${after}`,
    cursor: before.length + replacement.length,
  };
}

const ENVIRONMENT_BODY_TEMPLATES = {
  itemize: "\n    \\item {{cursor}}\n",
  enumerate: "\n    \\item {{cursor}}\n",
  description: "\n    \\item[] {{cursor}}\n",

  equation: "\n    {{cursor}}\n",
  "equation*": "\n    {{cursor}}\n",
  align: "\n    {{cursor}}\n",
  "align*": "\n    {{cursor}}\n",
  aligned: "\n    {{cursor}}\n",
  gather: "\n    {{cursor}}\n",
  "gather*": "\n    {{cursor}}\n",
  multline: "\n    {{cursor}}\n",
  "multline*": "\n    {{cursor}}\n",
  split: "\n    {{cursor}}\n",

  matrix: "\n    {{cursor}}\n",
  pmatrix: "\n    {{cursor}}\n",
  bmatrix: "\n    {{cursor}}\n",
  Bmatrix: "\n    {{cursor}}\n",
  vmatrix: "\n    {{cursor}}\n",
  Vmatrix: "\n    {{cursor}}\n",
  smallmatrix: "\n    {{cursor}}\n",
  cases: "\n    {{cursor}}\n",

  figure: "\n    \\centering\n    {{cursor}}\n",
  table: "\n    \\centering\n    {{cursor}}\n",
  center: "\n    {{cursor}}\n",
  flushleft: "\n    {{cursor}}\n",
  flushright: "\n    {{cursor}}\n",
  quote: "\n    {{cursor}}\n",
  quotation: "\n    {{cursor}}\n",
  verse: "\n    {{cursor}}\n",

  theorem: "\n    {{cursor}}\n",
  lemma: "\n    {{cursor}}\n",
  proposition: "\n    {{cursor}}\n",
  corollary: "\n    {{cursor}}\n",
  definition: "\n    {{cursor}}\n",
  example: "\n    {{cursor}}\n",
  proof: "\n    {{cursor}}\n",

  tikzpicture: "\n    {{cursor}}\n",
};

const COMMAND_COMPLETIONS = [
  ["\\sec", "tion{{cursor}}"],
  ["\\subsec", "tion{{cursor}}"],
  ["\\subsubsec", "tion{{cursor}}"],
  ["\\parag", "raph{{cursor}}"],
  ["\\textb", "f{{cursor}}"],
  ["\\texti", "t{{cursor}}"],
  ["\\em", "ph{{cursor}}"],
  ["\\lab", "el{{cursor}}"],
  ["\\re", "f{{cursor}}"],
  ["\\eqre", "f{{cursor}}"],
  ["\\ci", "te{{cursor}}"],
  ["\\incl", "udegraphics[width=0.8\\textwidth]{{cursor}}"],
  ["\\cap", "tion{{cursor}}"],
  ["\\frac", "{{cursor}}{}{}"],
  ["\\sqrt", "{{cursor}}{}"],
  ["\\vec", "{{cursor}}{}"],
  ["\\hat", "{{cursor}}{}"],
  ["\\bar", "{{cursor}}{}"],
  ["\\dot", "{{cursor}}{}"],
  ["\\ddot", "{{cursor}}{}"],
  ["\\mathbf", "{{cursor}}{}"],
  ["\\mathrm", "{{cursor}}{}"],
  ["\\mathbb", "{{cursor}}{}"],
  ["\\mathcal", "{{cursor}}{}"],
  ["\\begin", "{{cursor}}{}"],
  ["\\end", "{{cursor}}{}"],
];

const OPENING_DELIMITERS = [
  ["\\left(", "\\right)"],
  ["\\left[", "\\right]"],
  ["\\left\\{", "\\right\\}"],
  ["\\left|", "\\right|"],
  ["\\left\\|", "\\right\\|"],
];

function replaceCursorMarker(value) {
  const marker = "{{cursor}}";
  const markerIndex = value.indexOf(marker);

  if (markerIndex < 0) {
    return {
      text: value,
      cursorDelta: value.length,
    };
  }

  return {
    text: value.replace(marker, ""),
    cursorDelta: markerIndex,
  };
}

function getEnvironmentCompletion(value, cursorPosition) {
  const before = value.slice(0, cursorPosition);
  const after = value.slice(cursorPosition);

  const match = before.match(/\\begin\{([^{}\n]+)\}$/);
  if (!match) return null;

  const environment = match[1].trim();
  if (!environment) return null;

  const closing = `\\end{${environment}}`;

  // Si el cierre ya está inmediatamente después, no sugerimos otro.
  if (after.trimStart().startsWith(closing)) {
    return null;
  }

  const body =
    ENVIRONMENT_BODY_TEMPLATES[environment] ??
    "\n    {{cursor}}\n";

  return `${body}${closing}`;
}

function getDisplayMathCompletion(value, cursorPosition) {
  const before = value.slice(0, cursorPosition);
  const after = value.slice(cursorPosition);

  if (before.endsWith("\\[") && !after.trimStart().startsWith("\\]")) {
    return "\n    {{cursor}}\n\\]";
  }

  if (before.endsWith("\\(") && !after.startsWith("\\)")) {
    return "{{cursor}}\\)";
  }

  // Solo cuando acabamos de abrir $$ y no parece que sea un cierre.
  if (before.endsWith("$$")) {
    const beforeWithoutLast = before.slice(0, -2);
    const dollarPairs = (beforeWithoutLast.match(/\$\$/g) || []).length;

    if (dollarPairs % 2 === 0 && !after.startsWith("$$")) {
      return "\n    {{cursor}}\n$$";
    }
  }

  return null;
}

function getDelimiterCompletion(value, cursorPosition) {
  const before = value.slice(0, cursorPosition);
  const after = value.slice(cursorPosition);

  for (const [opening, closing] of OPENING_DELIMITERS) {
    if (before.endsWith(opening) && !after.startsWith(closing)) {
      return `{{cursor}}${closing}`;
    }
  }

  return null;
}

function getBraceCompletion(value, cursorPosition) {
  const before = value.slice(0, cursorPosition);
  const after = value.slice(cursorPosition);

  // \frac{  ->  }{}
  if (before.endsWith("\\frac{") && !after.startsWith("}")) {
    return "{{cursor}}}{}";
  }

  // \sqrt[  ->  ]{}
  if (before.endsWith("\\sqrt[") && !after.startsWith("]")) {
    return "{{cursor}}]{}";
  }

  // Comandos que reciben un argumento entre llaves.
  const braceCommandMatch = before.match(
    /\\(?:section|subsection|subsubsection|paragraph|textbf|textit|emph|mathrm|mathbf|mathbb|mathcal|vec|hat|bar|dot|ddot|label|ref|eqref|cite|caption|sqrt)\{[^{}]*$/
  );

  if (braceCommandMatch && !after.startsWith("}")) {
    return "{{cursor}}}";
  }

  return null;
}

function getCommandCompletion(value, cursorPosition) {
  const before = value.slice(0, cursorPosition);

  // No mostrar sugerencias de comando si ya estamos dentro de una palabra normal.
  const slashIndex = before.lastIndexOf("\\");
  if (slashIndex < 0) return null;

  const fragment = before.slice(slashIndex);

  if (!/^\\[A-Za-z]*$/.test(fragment)) {
    return null;
  }

  // Un "\" aislado no fuerza una expansión arbitraria.
  // A partir de 2 letras ya damos la primera coincidencia útil.
  if (fragment.length < 3) return null;

  const match = COMMAND_COMPLETIONS.find(([trigger]) =>
    trigger.startsWith(fragment)
  );

  if (!match) return null;

  const [trigger, completion] = match;
  const remainder = trigger.slice(fragment.length);

  if (!remainder && !completion) return null;

  return `${remainder}${completion}`;
}

function getLocalLatexCompletion(value, cursorPosition) {
  return (
    getEnvironmentCompletion(value, cursorPosition) ||
    getDisplayMathCompletion(value, cursorPosition) ||
    getDelimiterCompletion(value, cursorPosition) ||
    getBraceCompletion(value, cursorPosition) ||
    getCommandCompletion(value, cursorPosition) ||
    null
  );
}

function makeGhostSuggestion(rawValue, source, cursorPosition) {
  if (!rawValue) return null;

  const parsed = replaceCursorMarker(String(rawValue));

  return {
    text: parsed.text,
    source,
    at: cursorPosition,
    cursorDelta: parsed.cursorDelta,
  };
}

function getTextareaCaretCoordinates(textarea, position) {
  if (!textarea || typeof document === "undefined") return null;

  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");

  const properties = [
    "boxSizing",
    "width",
    "height",
    "overflowX",
    "overflowY",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "fontStretch",
    "fontSize",
    "fontSizeAdjust",
    "lineHeight",
    "fontFamily",
    "textAlign",
    "textTransform",
    "textIndent",
    "textDecoration",
    "letterSpacing",
    "wordSpacing",
    "tabSize",
  ];

  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";

  for (const property of properties) {
    mirror.style[property] = style[property];
  }

  mirror.textContent = textarea.value.substring(0, position);

  const marker = document.createElement("span");
  marker.textContent = textarea.value.substring(position) || ".";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const coordinates = {
    left: marker.offsetLeft - textarea.scrollLeft,
    top: marker.offsetTop - textarea.scrollTop,
    lineHeight: Number.parseFloat(style.lineHeight) || 28,
  };

  document.body.removeChild(mirror);
  return coordinates;
}

const SNIPPETS = [
  {
    label: "Sección",
    icon: FileText,
    value: "\\section{Título}\n",
  },
  {
    label: "Ecuación",
    icon: Sigma,
    value: "\\begin{equation}\n    {{selection}}\n\\end{equation}\n",
  },
  {
    label: "Align",
    icon: Braces,
    value: "\\begin{align}\n    {{selection}}\n\\end{align}\n",
  },
  {
    label: "Lista",
    icon: Code2,
    value:
      "\\begin{itemize}\n    \\item {{selection}}\n    \\item \n\\end{itemize}\n",
  },
];

export default function LatexNotebook({
  subjects,
  activeSubject,
  onSubjectChange,
  selectedDateKey,
  onSelectedDateChange,
  onNotePresenceChange,
  activeReference,
  onActiveReferenceChange,
}) {
  const editorRef = useRef(null);
  const saveTimerRef = useRef(null);
  const compileTimerRef = useRef(null);
  const requestVersionRef = useRef(0);

  const [content, setContent] = useState("");
  const [loadedContent, setLoadedContent] = useState("");
  const [loadStatus, setLoadStatus] = useState("loading");
  const [saveStatus, setSaveStatus] = useState("idle");
  const [compileStatus, setCompileStatus] = useState("idle");
  const [compileError, setCompileError] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [tectonicReady, setTectonicReady] = useState(null);
  const [autoCompile, setAutoCompile] = useState(true);
  const [referenceOpen, setReferenceOpen] = useState(Boolean(activeReference));

  const [aiAction, setAiAction] = useState(null);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiProposal, setAiProposal] = useState("");
  const [aiStatus, setAiStatus] = useState("idle");
  const [aiError, setAiError] = useState("");
  const [aiSelection, setAiSelection] = useState({
    start: 0,
    end: 0,
    selectedText: "",
  });

  const [figureOpen, setFigureOpen] = useState(false);
  const [figureQuery, setFigureQuery] = useState("");
  const [figureSource, setFigureSource] = useState("all");
  const [figureResults, setFigureResults] = useState([]);
  const [figureStatus, setFigureStatus] = useState("idle");
  const [figureError, setFigureError] = useState("");
  const [figureImportId, setFigureImportId] = useState("");
  const [figureInsertion, setFigureInsertion] = useState({
    start: 0,
  });

  const [scientificPlotOpen, setScientificPlotOpen] = useState(false);
  const [scientificPlotPrompt, setScientificPlotPrompt] = useState("");
  const [scientificPlotStatus, setScientificPlotStatus] = useState("idle");
  const [scientificPlotError, setScientificPlotError] = useState("");
  const [scientificPlotResult, setScientificPlotResult] = useState(null);
  const [scientificPlotInsertion, setScientificPlotInsertion] = useState({
    start: 0,
  });

  const [ghostSuggestion, setGhostSuggestion] = useState(null);
  const [ghostPosition, setGhostPosition] = useState(null);

  const activeSubjectData =
    subjects.find((subject) => subject.id === activeSubject) || subjects[0];

  const loadNote = async () => {
    const version = ++requestVersionRef.current;
    setLoadStatus("loading");
    setSaveStatus("idle");
    setCompileStatus("idle");
    setCompileError("");

    try {
      const response = await fetch(
        `${API_BASE}/api/notebook/note?subject=${encodeURIComponent(
          activeSubject
        )}&dateKey=${encodeURIComponent(selectedDateKey)}`
      );

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo abrir la nota.");
      }

      if (version !== requestVersionRef.current) return;

      setContent(data.content || "");
      setLoadedContent(data.content || "");
      setPdfUrl(
        data.pdfExists
          ? `${API_BASE}/api/notebook/pdf?subject=${encodeURIComponent(
              activeSubject
            )}&dateKey=${encodeURIComponent(
              selectedDateKey
            )}&v=${Date.now()}`
          : ""
      );
      setLoadStatus("ready");
    } catch (error) {
      if (version !== requestVersionRef.current) return;
      setLoadStatus("error");
      setCompileError(error.message || "No se pudo abrir la nota.");
    }
  };

  const checkTectonic = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/notebook/health`);
      const data = await response.json();
      setTectonicReady(Boolean(response.ok && data.ok && data.tectonic));
    } catch {
      setTectonicReady(false);
    }
  };

  useEffect(() => {
    loadNote();
    checkTectonic();

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (compileTimerRef.current) clearTimeout(compileTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubject, selectedDateKey]);


  useEffect(() => {
    if (activeReference?.id) {
      setReferenceOpen(true);
    }
  }, [activeReference?.id]);

  const readApiJson = async (response, routeName) => {
    const raw = await response.text();

    let data;

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      const looksLikeHtml =
        raw.trim().startsWith("<!DOCTYPE") ||
        raw.trim().startsWith("<html");

      if (looksLikeHtml) {
        throw new Error(
          `${routeName} no está disponible en el backend. Ejecuta node install-notebook-ai.js y reinicia npm.cmd run notes.`
        );
      }

      throw new Error(
        `El backend devolvió una respuesta no válida en ${routeName}.`
      );
    }

    return data;
  };

  const saveNow = async (value = content) => {
    setSaveStatus("saving");

    try {
      const response = await fetch(`${API_BASE}/api/notebook/note`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject: activeSubject,
          dateKey: selectedDateKey,
          content: value,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo guardar.");
      }

      setLoadedContent(value);
      setSaveStatus("saved");
      onNotePresenceChange?.({
        subject: activeSubject,
        dateKey: selectedDateKey,
        exists: value.trim().length > 0,
        updatedAt: data.updatedAt || new Date().toISOString(),
      });

      return true;
    } catch (error) {
      setSaveStatus("error");
      setCompileError(error.message || "No se pudo guardar.");
      return false;
    }
  };

  const compileNow = async (value = content, fast = false) => {
    if (!value.trim()) {
      setPdfUrl("");
      setCompileStatus("idle");
      return;
    }

    setCompileStatus("compiling");
    setCompileError("");

    try {
      const response = await fetch(`${API_BASE}/api/notebook/compile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject: activeSubject,
          dateKey: selectedDateKey,
          content: value,
          fast,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.details ||
            data?.error ||
            "La compilación LaTeX no se pudo completar."
        );
      }

      setCompileStatus("done");
      setTectonicReady(true);
      setPdfUrl(
        `${API_BASE}/api/notebook/pdf?subject=${encodeURIComponent(
          activeSubject
        )}&dateKey=${encodeURIComponent(selectedDateKey)}&v=${Date.now()}`
      );

      onNotePresenceChange?.({
        subject: activeSubject,
        dateKey: selectedDateKey,
        exists: value.trim().length > 0,
        updatedAt: data.updatedAt || new Date().toISOString(),
      });
    } catch (error) {
      setCompileStatus("error");
      setCompileError(error.message || "Error compilando LaTeX.");
    }
  };

  const scheduleSaveAndCompile = (value, skipCompile = false) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (compileTimerRef.current) clearTimeout(compileTimerRef.current);

    setSaveStatus("pending");

    saveTimerRef.current = setTimeout(() => {
      saveNow(value);
    }, AUTOSAVE_DELAY_MS);

    if (!skipCompile && autoCompile && value.trim()) {
      compileTimerRef.current = setTimeout(() => {
        compileNow(value, true);
      }, AUTOCOMPILE_DELAY_MS);
    }
  };

  const updateGhostPosition = () => {
    const textarea = editorRef.current;

    if (!textarea || !ghostSuggestion) {
      setGhostPosition(null);
      return;
    }

    if (
      textarea.selectionStart !== ghostSuggestion.at ||
      textarea.selectionEnd !== ghostSuggestion.at
    ) {
      setGhostPosition(null);
      return;
    }

    const coordinates = getTextareaCaretCoordinates(
      textarea,
      ghostSuggestion.at
    );

    if (!coordinates) return;

    setGhostPosition({
      left: coordinates.left,
      top: coordinates.top,
      lineHeight: coordinates.lineHeight,
    });
  };

  const clearGhostSuggestion = () => {
    setGhostSuggestion(null);
    setGhostPosition(null);
  };

  const showGhostSuggestion = (suggestion) => {
    if (!suggestion?.text) {
      clearGhostSuggestion();
      return;
    }

    setGhostSuggestion(suggestion);

    requestAnimationFrame(() => {
      const textarea = editorRef.current;
      if (!textarea) return;

      const coordinates = getTextareaCaretCoordinates(
        textarea,
        suggestion.at
      );

      if (!coordinates) return;

      setGhostPosition({
        left: coordinates.left,
        top: coordinates.top,
        lineHeight: coordinates.lineHeight,
      });
    });
  };

  const updateLocalLatexSuggestion = (value, cursorPosition) => {
    clearGhostSuggestion();

    const localValue = getLocalLatexCompletion(
      value,
      cursorPosition
    );

    if (!localValue) return false;

    const suggestion = makeGhostSuggestion(
      localValue,
      "local",
      cursorPosition
    );

    showGhostSuggestion(suggestion);
    return true;
  };

  const acceptGhostSuggestion = () => {
    if (!ghostSuggestion) return false;

    const textarea = editorRef.current;
    if (!textarea) return false;

    if (
      textarea.selectionStart !== ghostSuggestion.at ||
      textarea.selectionEnd !== ghostSuggestion.at
    ) {
      clearGhostSuggestion();
      return false;
    }

    const insertion = ghostSuggestion.text;
    const nextContent =
      content.slice(0, ghostSuggestion.at) +
      insertion +
      content.slice(ghostSuggestion.at);

    const nextCursor =
      ghostSuggestion.at + ghostSuggestion.cursorDelta;

    setContent(nextContent);
    scheduleSaveAndCompile(nextContent);
    clearGhostSuggestion();

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });

    return true;
  };

  const handleContentChange = (event) => {
    const value = event.target.value;
    const cursorPosition = event.target.selectionStart;

    setContent(value);

    const hasLocalSuggestion = updateLocalLatexSuggestion(
      value,
      cursorPosition
    );

    // Si hay una estructura LaTeX incompleta que Lumina puede cerrar
    // localmente, la guardamos pero no compilamos ese estado transitorio.
    scheduleSaveAndCompile(value, hasLocalSuggestion);
  };

  const handleEditorCursorActivity = () => {
    const textarea = editorRef.current;
    if (!textarea || !ghostSuggestion) return;

    if (
      textarea.selectionStart !== ghostSuggestion.at ||
      textarea.selectionEnd !== ghostSuggestion.at
    ) {
      clearGhostSuggestion();
    } else {
      updateGhostPosition();
    }
  };

  const handleEditorKeyDown = (event) => {
    const textarea = editorRef.current;
    if (!textarea) return;

    if ((event.ctrlKey || event.metaKey) && event.key === "s") {
      event.preventDefault();
      saveNow();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      compileNow(content, false);
      return;
    }

    if (event.key === "Escape" && ghostSuggestion) {
      event.preventDefault();
      clearGhostSuggestion();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();

      if (acceptGhostSuggestion()) {
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const result = insertAtSelection(textarea, "  ", start, end);

      setContent(result.value);
      scheduleSaveAndCompile(result.value);
      updateLocalLatexSuggestion(result.value, result.cursor);

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(result.cursor, result.cursor);
      });
    }
  };

  const insertSnippet = (snippet) => {
    const textarea = editorRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const result = insertAtSelection(
      textarea,
      snippet.value,
      start,
      end
    );

    setContent(result.value);
    scheduleSaveAndCompile(result.value);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.cursor, result.cursor);
    });
  };

  const getEditorContext = () => {
    const textarea = editorRef.current;
    const start = textarea?.selectionStart ?? 0;
    const end = textarea?.selectionEnd ?? start;
    const selectedText = content.slice(start, end);

    const contextBefore = content.slice(Math.max(0, start - 1800), start);
    const contextAfter = content.slice(end, Math.min(content.length, end + 900));

    return {
      start,
      end,
      selectedText,
      contextBefore,
      contextAfter,
    };
  };

  const openAiAction = (action) => {
    clearGhostSuggestion();
    setFigureOpen(false);
    setFigureError("");
    setScientificPlotOpen(false);
    setScientificPlotError("");
    setScientificPlotResult(null);

    const selection = getEditorContext();

    if (action === "improve" && !selection.selectedText.trim()) {
      setAiError("Selecciona primero el texto que quieres mejorar.");
      return;
    }

    setAiSelection(selection);
    setAiAction(action);
    setAiInstruction("");
    setAiProposal("");
    setAiError("");
    setAiStatus("idle");
  };

  const closeAiPanel = () => {
    if (aiStatus === "loading") return;
    setAiAction(null);
    setAiInstruction("");
    setAiProposal("");
    setAiError("");
    setAiStatus("idle");
  };

  const requestAiProposal = async () => {
    if (!aiAction) return;

    const needsInstruction = aiAction === "equation";

    if (needsInstruction && !aiInstruction.trim()) {
      setAiError("Escribe qué quieres que genere Lumina.");
      return;
    }

    setAiStatus("loading");
    setAiError("");
    setAiProposal("");

    try {
      const response = await fetch(`${API_BASE}/api/notebook/ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: aiAction,
          subject: activeSubject,
          subjectName: activeSubjectData?.name || activeSubject,
          dateKey: selectedDateKey,
          selectedText: aiSelection.selectedText,
          contextBefore: aiSelection.contextBefore,
          contextAfter: aiSelection.contextAfter,
          instruction: aiInstruction.trim(),
        }),
      });

      const data = await readApiJson(response, "/api/notebook/ai");

      if (!response.ok || !data.ok) {
        throw new Error(data?.error || "La IA no pudo generar una propuesta.");
      }

      setAiProposal(data.content || "");
      setAiStatus("done");
    } catch (error) {
      setAiStatus("error");
      setAiError(error.message || "Error consultando a Lumina.");
    }
  };

  const applyAiProposal = () => {
    if (!aiProposal) return;

    let nextContent = content;
    let cursor = aiSelection.start;

    if (aiAction === "improve") {
      nextContent =
        content.slice(0, aiSelection.start) +
        aiProposal +
        content.slice(aiSelection.end);
      cursor = aiSelection.start + aiProposal.length;
    } else {
      const insertion =
        (aiSelection.start > 0 &&
        !content.slice(0, aiSelection.start).endsWith("\n")
          ? "\n"
          : "") +
        aiProposal +
        (aiProposal.endsWith("\n") ? "" : "\n");

      nextContent =
        content.slice(0, aiSelection.start) +
        insertion +
        content.slice(aiSelection.start);

      cursor = aiSelection.start + insertion.length;
    }

    setContent(nextContent);
    scheduleSaveAndCompile(nextContent);
    closeAiPanel();

    requestAnimationFrame(() => {
      const textarea = editorRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const openScientificPlot = () => {
    clearGhostSuggestion();

    if (aiStatus !== "loading") {
      setAiAction(null);
      setAiInstruction("");
      setAiProposal("");
      setAiError("");
      setAiStatus("idle");
    }

    setFigureOpen(false);
    setFigureResults([]);
    setFigureStatus("idle");
    setFigureError("");
    setFigureImportId("");

    const selection = getEditorContext();

    setScientificPlotInsertion({
      start: selection.start,
    });
    setScientificPlotPrompt(
      selection.selectedText.trim()
        ? selection.selectedText.replace(/\s+/g, " ").slice(0, 1200)
        : ""
    );
    setScientificPlotStatus("idle");
    setScientificPlotError("");
    setScientificPlotResult(null);
    setScientificPlotOpen(true);
  };

  const closeScientificPlot = () => {
    if (scientificPlotStatus === "loading") return;

    setScientificPlotOpen(false);
    setScientificPlotPrompt("");
    setScientificPlotStatus("idle");
    setScientificPlotError("");
    setScientificPlotResult(null);
  };

  const generateScientificPlot = async () => {
    const prompt = scientificPlotPrompt.trim();

    if (prompt.length < 3) {
      setScientificPlotError(
        "Describe la gráfica que quieres generar con un poco más de detalle."
      );
      return;
    }

    setScientificPlotStatus("loading");
    setScientificPlotError("");
    setScientificPlotResult(null);

    try {
      const response = await fetch(
        `${API_BASE}/api/notebook/scientific-plot/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subject: activeSubject,
            subjectName: activeSubjectData?.name || activeSubject,
            dateKey: selectedDateKey,
            prompt,
          }),
        }
      );

      const data = await readApiJson(
        response,
        "/api/notebook/scientific-plot/generate"
      );

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.error || "No se pudo generar la gráfica científica."
        );
      }

      setScientificPlotResult(data);
      setScientificPlotStatus("done");
    } catch (error) {
      setScientificPlotStatus("error");
      setScientificPlotError(
        error.message || "Error generando la gráfica científica."
      );
    }
  };

  const insertGeneratedScientificPlot = () => {
    const latex = scientificPlotResult?.latex;

    if (!latex) {
      setScientificPlotError(
        "No hay ninguna gráfica generada para insertar."
      );
      return;
    }

    const start = scientificPlotInsertion.start;
    const before = content.slice(0, start);
    const after = content.slice(start);

    const leadingNewline =
      before && !before.endsWith("\n") ? "\n" : "";

    const insertion =
      leadingNewline +
      latex +
      (latex.endsWith("\n") ? "" : "\n");

    const nextContent = before + insertion + after;
    const nextCursor = start + insertion.length;

    setContent(nextContent);
    scheduleSaveAndCompile(nextContent);

    setScientificPlotOpen(false);
    setScientificPlotPrompt("");
    setScientificPlotStatus("idle");
    setScientificPlotError("");
    setScientificPlotResult(null);

    requestAnimationFrame(() => {
      const textarea = editorRef.current;
      if (!textarea) return;

      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const getSuggestedFigureQuery = (selection) => {
    if (selection.selectedText.trim()) {
      return selection.selectedText
        .replace(/\s+/g, " ")
        .slice(0, 180);
    }

    const lines = selection.contextBefore
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const lastUsefulLine = lines.at(-1) || "";

    return lastUsefulLine
      .replace(/\\(?:section|subsection|subsubsection)\{([^}]*)\}/g, "$1")
      .replace(/\\[A-Za-z]+/g, " ")
      .replace(/[{}$]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);
  };

  const openFigureSearch = () => {
    clearGhostSuggestion();
    setScientificPlotOpen(false);
    setScientificPlotError("");
    setScientificPlotResult(null);

    if (aiStatus !== "loading") {
      setAiAction(null);
      setAiInstruction("");
      setAiProposal("");
      setAiError("");
      setAiStatus("idle");
    }

    const selection = getEditorContext();

    setFigureInsertion({
      start: selection.start,
    });
    setFigureQuery(getSuggestedFigureQuery(selection));
    setFigureResults([]);
    setFigureStatus("idle");
    setFigureError("");
    setFigureImportId("");
    setFigureOpen(true);
  };

  const closeFigureSearch = () => {
    if (figureStatus === "loading" || figureImportId) return;

    setFigureOpen(false);
    setFigureResults([]);
    setFigureStatus("idle");
    setFigureError("");
    setFigureImportId("");
  };

  const searchScientificFigures = async () => {
    const query = figureQuery.trim();

    if (query.length < 3) {
      setFigureError("Escribe al menos 3 caracteres para buscar.");
      return;
    }

    setFigureStatus("loading");
    setFigureError("");
    setFigureResults([]);

    try {
      const response = await fetch(
        `${API_BASE}/api/notebook/figures/search?q=${encodeURIComponent(
          query
        )}&source=${encodeURIComponent(figureSource)}`
      );

      const data = await readApiJson(
        response,
        "/api/notebook/figures/search"
      );

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.error || "No se pudieron buscar figuras científicas."
        );
      }

      setFigureResults(data.results || []);
      setFigureStatus("done");
    } catch (error) {
      setFigureStatus("error");
      setFigureError(
        error.message || "Error buscando figuras científicas."
      );
    }
  };

  const insertScientificFigure = async (result) => {
    if (!result?.imageUrl) return;

    setFigureImportId(result.id);
    setFigureError("");

    try {
      const response = await fetch(
        `${API_BASE}/api/notebook/figures/import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subject: activeSubject,
            query: figureQuery.trim(),
            imageUrl: result.imageUrl,
            sourceUrl: result.sourceUrl,
            articleUrl: result.articleUrl,
            source: result.source,
            title: result.title,
            caption: result.caption,
            authors: result.authors,
            year: result.year,
            license: result.license,
          }),
        }
      );

      const data = await readApiJson(
        response,
        "/api/notebook/figures/import"
      );

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.error || "No se pudo importar la figura."
        );
      }

      const start = figureInsertion.start;
      const before = content.slice(0, start);
      const after = content.slice(start);

      const leadingNewline =
        before && !before.endsWith("\n") ? "\n" : "";
      const insertion =
        leadingNewline +
        data.latex +
        (data.latex.endsWith("\n") ? "" : "\n");

      const nextContent = before + insertion + after;
      const nextCursor = start + insertion.length;

      setContent(nextContent);
      scheduleSaveAndCompile(nextContent);

      setFigureOpen(false);
      setFigureResults([]);
      setFigureStatus("idle");
      setFigureImportId("");
      setFigureError("");

      requestAnimationFrame(() => {
        const textarea = editorRef.current;
        if (!textarea) return;

        textarea.focus();
        textarea.setSelectionRange(nextCursor, nextCursor);
      });
    } catch (error) {
      setFigureError(
        error.message || "No se pudo importar la figura."
      );
    } finally {
      setFigureImportId("");
    }
  };

  const goToDay = (offset) => {
    onSelectedDateChange(shiftDate(selectedDateKey, offset));
  };

  const dirty = content !== loadedContent;

  return (
    <main className="w-full max-w-[1400px] mx-auto px-4 pb-8 z-10">
      <section className="mb-5 glass-card border-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-wrap gap-2">
            {subjects.map((subject) => {
              const Icon = subject.icon;
              const active = subject.id === activeSubject;

              return (
                <button
                  key={subject.id}
                  type="button"
                  onClick={() => onSubjectChange(subject.id)}
                  className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition ${
                    active
                      ? "border-purple-400/35 bg-purple-500/10 text-purple-200"
                      : "border-white/10 bg-white/[0.02] text-slate-400 hover:bg-white/[0.05]"
                  }`}
                >
                  <Icon size={15} />
                  {subject.name}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToDay(-1)}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-slate-400 transition hover:text-white"
              title="Día anterior"
            >
              <ChevronLeft size={16} />
            </button>

            <button
              type="button"
              onClick={() => onSelectedDateChange(getDateKey())}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:text-white"
            >
              Hoy
            </button>

            <button
              type="button"
              onClick={() => goToDay(1)}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-slate-400 transition hover:text-white"
              title="Día siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
        <section className="glass-card flex min-w-0 flex-col border-white/5 shadow-2xl">
          <div className="border-b border-white/5 bg-black/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FileText size={19} className="text-purple-300" />
                  <h2 className="text-lg font-semibold text-white">
                    {activeSubjectData?.name}
                  </h2>
                </div>
                <p className="mt-1 text-sm capitalize text-slate-400">
                  {formatLongDate(selectedDateKey)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {saveStatus === "saving" && (
                  <span className="flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
                    <Loader2 size={12} className="animate-spin" />
                    Guardando
                  </span>
                )}

                {saveStatus === "saved" && !dirty && (
                  <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                    <CheckCircle2 size={12} />
                    Guardado
                  </span>
                )}

                {(saveStatus === "pending" || dirty) && (
                  <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs text-amber-200">
                    Cambios pendientes
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => saveNow()}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08]"
                >
                  <Save size={14} />
                  Guardar
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setReferenceOpen((value) => !value)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                  referenceOpen
                    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                    : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-cyan-400/25 hover:text-cyan-200"
                }`}
                title="Abrir bibliografía junto a los apuntes"
              >
                <Library size={13} />
                Referencia
                {activeReference?.title && (
                  <span className="ml-1 max-w-28 truncate text-[10px] text-cyan-300/80">
                    {activeReference.title}
                  </span>
                )}
              </button>

              {SNIPPETS.map((snippet) => {
                const Icon = snippet.icon;
                return (
                  <button
                    key={snippet.label}
                    type="button"
                    onClick={() => insertSnippet(snippet)}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-400 transition hover:border-purple-400/25 hover:text-purple-200"
                  >
                    <Icon size={13} />
                    {snippet.label}
                  </button>
                );
              })}

              <span className="ml-auto self-center text-[11px] text-slate-600">
                Tab aceptar LaTeX · Esc descartar · Ctrl+S guardar · Ctrl+Enter compilar
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
              <span className="mr-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-purple-300">
                <Bot size={13} />
                Lumina AI
              </span>

              <span className="flex items-center gap-2 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.05] px-2.5 py-1.5 text-xs text-emerald-200">
                <CheckCircle2 size={13} />
                LaTeX local · completo
              </span>

              <button
                type="button"
                onClick={() => openAiAction("complete")}
                className="flex items-center gap-1.5 rounded-lg border border-purple-400/20 bg-purple-500/[0.08] px-2.5 py-1.5 text-xs text-purple-200 transition hover:bg-purple-500/[0.14]"
              >
                <Sparkles size={13} />
                Completar
              </button>

              <button
                type="button"
                onClick={() => openAiAction("improve")}
                className="flex items-center gap-1.5 rounded-lg border border-purple-400/20 bg-purple-500/[0.08] px-2.5 py-1.5 text-xs text-purple-200 transition hover:bg-purple-500/[0.14]"
              >
                <WandSparkles size={13} />
                Mejorar
              </button>

              <button
                type="button"
                onClick={() => openAiAction("equation")}
                className="flex items-center gap-1.5 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.07] px-2.5 py-1.5 text-xs text-cyan-200 transition hover:bg-cyan-400/[0.13]"
              >
                <Sigma size={13} />
                Ecuación
              </button>

              <button
                type="button"
                onClick={openFigureSearch}
                className="flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-2.5 py-1.5 text-xs text-amber-200 transition hover:bg-amber-400/[0.13]"
              >
                <ImageIcon size={13} />
                Figura
              </button>

              <button
                type="button"
                onClick={openScientificPlot}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] px-2.5 py-1.5 text-xs text-emerald-200 transition hover:bg-emerald-400/[0.13]"
              >
                <Sigma size={13} />
                Gráfica exacta
              </button>

              {aiError && !aiAction && (
                <span className="text-xs text-rose-300">{aiError}</span>
              )}
            </div>
          </div>

          {aiAction && (
            <div className="border-b border-purple-400/15 bg-purple-500/[0.05] p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles size={15} className="text-purple-300" />
                    <p className="text-sm font-semibold text-white">
                      {aiAction === "complete" && "Completar apuntes"}
                      {aiAction === "improve" && "Mejorar selección"}
                      {aiAction === "equation" && "Generar ecuación"}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Qwen3.5 4B prepara una propuesta. Tu nota no cambia hasta que pulses Aplicar.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeAiPanel}
                  disabled={aiStatus === "loading"}
                  className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
                >
                  <X size={15} />
                </button>
              </div>

              {aiAction === "equation" && (
                <div className="mb-3 flex gap-2">
                  <input
                    value={aiInstruction}
                    onChange={(event) => setAiInstruction(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        requestAiProposal();
                      }
                    }}
                    className="input-dark flex-1"
                    placeholder="Ej. ecuación de Cauchy para equilibrio estático"
                    autoFocus
                  />

                  <button
                    type="button"
                    onClick={requestAiProposal}
                    disabled={aiStatus === "loading"}
                    className="btn-primary flex items-center gap-2 disabled:opacity-50"
                  >
                    {aiStatus === "loading" ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Sparkles size={15} />
                    )}
                    Generar
                  </button>
                </div>
              )}

              {(aiAction === "complete" || aiAction === "improve") &&
                !aiProposal &&
                aiStatus !== "loading" && (
                  <button
                    type="button"
                    onClick={requestAiProposal}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Sparkles size={15} />
                    Generar propuesta
                  </button>
                )}

              {aiStatus === "loading" && (
                <div className="flex items-center gap-2 rounded-xl border border-purple-400/15 bg-black/20 p-3 text-sm text-purple-200">
                  <Loader2 size={16} className="animate-spin" />
                  Lumina está preparando la propuesta...
                </div>
              )}

              {aiError && (
                <div className="mb-3 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-xs text-rose-200">
                  {aiError}
                </div>
              )}

              {aiProposal && (
                <div>
                  <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-slate-950/80 p-4 font-mono text-[13px] leading-6 text-slate-200">
                    {aiProposal}
                  </div>

                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeAiPanel}
                      className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-slate-400 transition hover:text-white"
                    >
                      Rechazar
                    </button>

                    <button
                      type="button"
                      onClick={applyAiProposal}
                      className="btn-primary flex items-center gap-2"
                    >
                      <CheckCircle2 size={15} />
                      Aplicar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {scientificPlotOpen && (
            <div className="border-b border-emerald-400/15 bg-emerald-500/[0.04] p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Sigma size={16} className="text-emerald-300" />
                    <p className="text-sm font-semibold text-white">
                      Generar gráfica científica exacta
                    </p>
                  </div>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                    Describe la gráfica en lenguaje natural. Qwen interpreta la
                    petición y Python la dibuja con SymPy, NumPy y Matplotlib.
                    Primero verás una previsualización; la nota no cambia hasta
                    que pulses Insertar en LaTeX.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeScientificPlot}
                  disabled={scientificPlotStatus === "loading"}
                  className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.78fr)]">
                <div>
                  <textarea
                    value={scientificPlotPrompt}
                    onChange={(event) => {
                      setScientificPlotPrompt(event.target.value);
                      if (scientificPlotResult) {
                        setScientificPlotResult(null);
                        setScientificPlotStatus("idle");
                      }
                      if (scientificPlotError) {
                        setScientificPlotError("");
                      }
                    }}
                    className="min-h-[190px] w-full resize-y rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-300/35 focus:ring-2 focus:ring-emerald-300/10"
                    placeholder={`Ejemplo:\nRepresenta y = exp(-x)*sin(4*x) entre 0 y 10.\nTítulo: Respuesta amortiguada.\nEje x: tiempo (s). Eje y: amplitud.\nAñade rejilla y marca y = 0.`}
                    autoFocus
                  />

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={generateScientificPlot}
                      disabled={
                        scientificPlotStatus === "loading" ||
                        scientificPlotPrompt.trim().length < 3
                      }
                      className="flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {scientificPlotStatus === "loading" ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Sparkles size={15} />
                      )}
                      {scientificPlotResult
                        ? "Regenerar vista previa"
                        : "Generar vista previa"}
                    </button>

                    {scientificPlotResult?.latex && (
                      <button
                        type="button"
                        onClick={insertGeneratedScientificPlot}
                        className="flex items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-400/[0.09] px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/[0.15]"
                      >
                        <CheckCircle2 size={15} />
                        Insertar en LaTeX
                      </button>
                    )}
                  </div>

                  <p className="mt-2 text-[11px] leading-5 text-slate-600">
                    Admite funciones, varias curvas, curvas paramétricas,
                    polares, curvas implícitas, campos de contorno, campos
                    vectoriales y datos experimentales con ajuste.
                  </p>

                  {scientificPlotError && (
                    <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-xs leading-5 text-rose-200">
                      {scientificPlotError}
                    </div>
                  )}
                </div>

                <div className="min-h-[260px] overflow-hidden rounded-xl border border-white/10 bg-slate-950/70">
                  {scientificPlotStatus === "loading" ? (
                    <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 p-6 text-center text-sm text-emerald-100">
                      <Loader2 size={22} className="animate-spin" />
                      <div>
                        <p className="font-semibold">
                          Calculando y dibujando la figura...
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          La curva se genera numéricamente, no como imagen
                          creativa.
                        </p>
                      </div>
                    </div>
                  ) : scientificPlotResult?.previewDataUrl ? (
                    <div>
                      <div className="flex min-h-[260px] items-center justify-center bg-white p-2">
                        <img
                          src={scientificPlotResult.previewDataUrl}
                          alt={
                            scientificPlotResult.caption ||
                            "Gráfica científica generada"
                          }
                          className="max-h-[390px] w-full object-contain"
                        />
                      </div>

                      <div className="border-t border-white/10 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-emerald-400/15 bg-emerald-400/[0.07] px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                            {scientificPlotResult.plotTypeLabel ||
                              "Gráfica científica"}
                          </span>
                          <span className="text-[10px] text-slate-600">
                            PDF vectorial + PNG
                          </span>
                        </div>

                        {scientificPlotResult.caption && (
                          <p className="mt-2 text-xs leading-5 text-slate-400">
                            {scientificPlotResult.caption}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-[260px] flex-col items-center justify-center p-6 text-center">
                      <Sigma size={30} className="mb-3 text-slate-700" />
                      <p className="text-sm font-medium text-slate-400">
                        La previsualización aparecerá aquí.
                      </p>
                      <p className="mt-2 max-w-sm text-xs leading-5 text-slate-600">
                        Si no queda exactamente como quieres, modifica el prompt
                        y vuelve a generar antes de insertarla.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {figureOpen && (
            <div className="border-b border-amber-400/15 bg-amber-500/[0.04] p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <ImageIcon size={16} className="text-amber-300" />
                    <p className="text-sm font-semibold text-white">
                      Buscar figura científica
                    </p>
                  </div>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                    Busca figuras reales de papers de arXiv y material científico abierto.
                    Para arXiv, revisa la licencia del paper antes de reutilizar la imagen fuera
                    de tus apuntes personales.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeFigureSearch}
                  disabled={figureStatus === "loading" || Boolean(figureImportId)}
                  className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_190px_120px]">
                <div className="relative min-w-0">
                  <Search
                    size={17}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                  />

                  <input
                    value={figureQuery}
                    onChange={(event) => setFigureQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        searchScientificFigures();
                      }
                    }}
                    className="h-12 w-full rounded-xl border border-white/10 bg-slate-950/70 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-amber-300/35 focus:ring-2 focus:ring-amber-300/10"
                    placeholder="Buscar: MOSFET energy band diagram, diffraction grating..."
                    autoFocus
                  />
                </div>

                <select
                  value={figureSource}
                  onChange={(event) => setFigureSource(event.target.value)}
                  className="h-12 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-200 outline-none transition focus:border-amber-300/35 focus:ring-2 focus:ring-amber-300/10"
                >
                  <option value="all">Todas las fuentes</option>
                  <option value="papers">Papers · arXiv</option>
                  <option value="open">Open science</option>
                </select>

                <button
                  type="button"
                  onClick={searchScientificFigures}
                  disabled={figureStatus === "loading"}
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {figureStatus === "loading" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Search size={16} />
                  )}
                  Buscar
                </button>
              </div>

              <p className="mt-2 text-[11px] text-slate-600">
                Consejo: en arXiv suele funcionar mejor buscar el concepto en inglés.
              </p>

              {figureError && (
                <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-xs text-rose-200">
                  {figureError}
                </div>
              )}

              {figureStatus === "loading" && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-400/10 bg-black/20 p-4 text-sm text-amber-100">
                  <Loader2 size={16} className="animate-spin" />
                  Buscando papers y figuras...
                </div>
              )}

              {figureStatus === "done" && figureResults.length === 0 && (
                <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-4 text-sm text-slate-500">
                  No he encontrado figuras con esa búsqueda. Prueba términos más concretos
                  o en inglés.
                </div>
              )}

              {figureResults.length > 0 && (
                <div className="mt-4 grid max-h-[560px] grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
                  {figureResults.map((result) => (
                    <article
                      key={result.id}
                      className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/70"
                    >
                      <div className="flex h-44 items-center justify-center overflow-hidden bg-white/[0.03]">
                        <img
                          src={result.previewUrl || result.imageUrl}
                          alt={result.caption || result.title || "Figura científica"}
                          loading="lazy"
                          className="h-full w-full object-contain"
                        />
                      </div>

                      <div className="p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              result.source === "arxiv"
                                ? "bg-cyan-400/10 text-cyan-200"
                                : "bg-emerald-400/10 text-emerald-200"
                            }`}
                          >
                            {result.source === "arxiv"
                              ? "Paper · arXiv"
                              : "Open science"}
                          </span>

                          {result.year && (
                            <span className="text-[10px] text-slate-600">
                              {result.year}
                            </span>
                          )}
                        </div>

                        <p className="line-clamp-2 text-xs font-semibold leading-5 text-slate-200">
                          {result.title}
                        </p>

                        {result.caption && (
                          <p className="mt-2 line-clamp-4 text-[11px] leading-5 text-slate-500">
                            {result.caption}
                          </p>
                        )}

                        {result.license && (
                          <p className="mt-2 line-clamp-1 text-[10px] text-slate-600">
                            Licencia: {result.license}
                          </p>
                        )}

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <a
                            href={result.sourceUrl || result.articleUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-[11px] font-medium text-slate-400 transition hover:text-white"
                          >
                            <ExternalLink size={12} />
                            Fuente
                          </a>

                          <button
                            type="button"
                            onClick={() => insertScientificFigure(result)}
                            disabled={Boolean(figureImportId)}
                            className="rounded-lg border border-amber-400/20 bg-amber-400/[0.08] px-3 py-1.5 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-400/[0.14] disabled:opacity-40"
                          >
                            {figureImportId === result.id ? (
                              <span className="flex items-center gap-1.5">
                                <Loader2 size={12} className="animate-spin" />
                                Importando
                              </span>
                            ) : (
                              "Insertar"
                            )}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="relative min-h-[650px] flex-1 overflow-hidden bg-slate-950/75">
            {loadStatus === "loading" ? (
              <div className="flex min-h-[650px] items-center justify-center text-sm text-slate-500">
                <Loader2 size={18} className="mr-2 animate-spin" />
                Abriendo nota...
              </div>
            ) : (
              <>
                <textarea
                  ref={editorRef}
                  value={content}
                  onChange={handleContentChange}
                  onKeyDown={handleEditorKeyDown}
                  onClick={handleEditorCursorActivity}
                  onSelect={handleEditorCursorActivity}
                  onScroll={updateGhostPosition}
                  spellCheck={false}
                  className="relative z-10 min-h-[650px] w-full resize-y bg-transparent p-5 font-mono text-[14px] leading-7 text-slate-200 outline-none placeholder:text-slate-700"
                  placeholder={`% Escribe aquí tus apuntes de ${activeSubjectData?.name || "la asignatura"}\n\n\\section{Tema de hoy}\n\nEmpieza a escribir directamente en LaTeX...`}
                />

                {ghostSuggestion && ghostPosition && !aiAction && !scientificPlotOpen && (
                  <div
                    className="pointer-events-none absolute z-20 whitespace-pre-wrap font-mono text-[14px] leading-7 text-slate-500/80"
                    style={{
                      left: ghostPosition.left,
                      top: ghostPosition.top,
                      maxWidth: `calc(100% - ${Math.max(ghostPosition.left, 0)}px - 20px)`,
                    }}
                  >
                    {ghostSuggestion.text}
                    <span className="ml-2 inline-flex translate-y-[-1px] items-center rounded border border-white/10 bg-slate-900/90 px-1.5 py-0.5 font-sans text-[9px] leading-none text-slate-500">
                      Tab
                    </span>
                  </div>
                )}

              </>
            )}
          </div>
        </section>

        <section className="glass-card flex min-w-0 flex-col overflow-hidden border-white/5 shadow-2xl">
          <div className="border-b border-white/5 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Play size={18} className="text-cyan-300" />
                  <h2 className="font-semibold text-white">
                    Previsualización PDF
                  </h2>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  PDF real · autocompilación rápida con Tectonic
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={autoCompile}
                    onChange={(event) => setAutoCompile(event.target.checked)}
                    className="accent-cyan-400"
                  />
                  Auto
                </label>

                <button
                  type="button"
                  onClick={() => compileNow(content, false)}
                  disabled={compileStatus === "compiling" || !content.trim()}
                  className="btn-primary flex items-center gap-2 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {compileStatus === "compiling" ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <RefreshCw size={15} />
                  )}
                  Compilar
                </button>
              </div>
            </div>
          </div>

          {tectonicReady === false && (
            <div className="m-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-100">
              Tectonic no está disponible todavía. El editor y el guardado
              funcionan, pero necesitas instalar <strong>tectonic.exe</strong>{" "}
              para generar la previsualización PDF.
            </div>
          )}

          {compileError && (
            <div className="m-4 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 font-mono text-xs leading-relaxed text-rose-100">
              {compileError}
            </div>
          )}

          <div className="min-h-[650px] flex-1 bg-slate-900/70 p-3">
            {pdfUrl ? (
              <iframe
                key={pdfUrl}
                src={pdfUrl}
                title={`PDF ${activeSubjectData?.name} ${selectedDateKey}`}
                className="h-[650px] w-full rounded-xl border border-white/10 bg-white"
              />
            ) : (
              <div className="flex h-[650px] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 p-8 text-center">
                <CalendarDays size={34} className="mb-3 text-slate-700" />
                <p className="font-medium text-slate-400">
                  Todavía no hay una previsualización.
                </p>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
                  Escribe tus apuntes y pulsa Compilar. Si activas Auto, Lumina
                  recompilará poco después de que pares de escribir.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
      {referenceOpen && (
        <div className="contents">
          <ReferencePanel
            activeSubject={activeSubject}
            activeReference={activeReference}
            onActiveReferenceChange={onActiveReferenceChange}
            onClose={() => setReferenceOpen(false)}
          />
        </div>
      )}

    </main>
  );
}