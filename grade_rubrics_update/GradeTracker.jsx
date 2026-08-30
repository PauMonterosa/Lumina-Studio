import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Calculator,
  CheckCircle2,
  ExternalLink,
  Info,
  Plus,
  RefreshCw,
  Target,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

const RUBRIC_VERSION = "Q7-2026-27-v1";

const OFFICIAL_RUBRICS = {
  nanotechnologies: {
    title: "Nanotechnologies",
    badge: "UPC · oficial",
    status: "official",
    sourceLabel: "Programa oficial nTECH",
    sourceUrl:
      "https://enginyeriafisica.etsetb.upc.edu/ca/estudis/optatives/ntech/programa-ntech.pdf",
    note:
      "Fórmula publicada: EP 35% + EF 35% + PT 30%.",
    items: [
      {
        name: "Examen parcial (EP)",
        type: "Examen",
        weight: 35,
      },
      {
        name: "Examen final (EF)",
        type: "Examen",
        weight: 35,
      },
      {
        name: "Presentación del informe (PT)",
        type: "Trabajo",
        weight: 30,
      },
    ],
  },

  quantum_technologies: {
    title: "Quantum Technologies",
    badge: "UPC · QTech",
    status: "official-with-note",
    sourceLabel: "Página y syllabus QTech",
    sourceUrl:
      "https://enginyeriafisica.etsetb.upc.edu/ca/estudis/optatives/qtech",
    note:
      "Estructura 65% exámenes escritos + 20% problemas entregables + 15% implementación práctica. En la fila de exámenes introduce la media global del bloque de dos exámenes. QTech es nueva en 2026–27; conviene contrastar cualquier cambio anunciado en Atenea.",
    items: [
      {
        name: "Exámenes escritos (2) · media del bloque",
        type: "Exámenes",
        weight: 65,
      },
      {
        name: "Problemas entregables",
        type: "Entregables",
        weight: 20,
      },
      {
        name: "Implementación en dispositivo cuántico real",
        type: "Práctica",
        weight: 15,
      },
    ],
  },

  microelectronics_design: {
    title: "Microelectronics Design",
    badge: "UPC · referencia",
    status: "reference",
    sourceLabel: "Guía UPC relacionada 230736",
    sourceUrl:
      "https://telecos.upc.edu/en/shared/master/mee-_90/mee-subjects/bridge_guia_docent_imd.pdf",
    note:
      "No he localizado públicamente la fórmula exacta de la asignatura de grado. Esta plantilla usa la guía UPC estrechamente relacionada 230736: 40% examen final + 40% laboratorios + 20% evaluación continua. Sustitúyela si Atenea/profesorado publica una rúbrica distinta.",
    items: [
      {
        name: "Examen final",
        type: "Examen",
        weight: 40,
      },
      {
        name: "Laboratorios · media del bloque",
        type: "Laboratorio",
        weight: 40,
      },
      {
        name: "Evaluación continua · media del bloque",
        type: "Continua",
        weight: 20,
      },
    ],
  },

  cpia: {
    title: "CPIA",
    badge: "UPC · oficial",
    status: "official",
    sourceLabel: "Programa oficial CPIA",
    sourceUrl:
      "https://enginyeriafisica.etsetb.upc.edu/ca/estudis/optatives/cpia/cpiaT22.pdf",
    note:
      "Fórmula publicada: Nota = 0.25·L + 0.75·PF. En L introduce la media global de los entregables periódicos de laboratorio.",
    items: [
      {
        name: "Entregables de laboratorio (L) · media",
        type: "Laboratorio",
        weight: 25,
      },
      {
        name: "Proyecto final (PF)",
        type: "Proyecto",
        weight: 75,
      },
    ],
  },

  biophotonics: {
    title: "Biophotonics",
    badge: "UPC · oficial",
    status: "official",
    sourceLabel: "Guía docente BIOPHOT 2026",
    sourceUrl:
      "https://www.upc.edu/grau/guiadocent/pdf/ing/230482/biomedical-photonics.pdf",
    note:
      "25% cuestionarios semanales + 60% tres exámenes (20% cada uno) + 15% presentación de un artículo científico.",
    items: [
      {
        name: "Cuestionarios semanales · media",
        type: "Continua",
        weight: 25,
      },
      {
        name: "Examen · Microscopy",
        type: "Examen",
        weight: 20,
      },
      {
        name: "Examen · Therapy",
        type: "Examen",
        weight: 20,
      },
      {
        name: "Examen · Diagnosis",
        type: "Examen",
        weight: 20,
      },
      {
        name: "Presentación de journal paper",
        type: "Presentación",
        weight: 15,
      },
    ],
  },
};

function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function emptyBook() {
  return {
    target: 8,
    items: [],
  };
}

function rubricBook(subjectId, target = 8) {
  const rubric = OFFICIAL_RUBRICS[subjectId];

  if (!rubric) {
    return emptyBook();
  }

  return {
    target,
    rubricVersion: RUBRIC_VERSION,
    rubricSource: subjectId,
    items: rubric.items.map((item, index) => ({
      id: `${subjectId}-rubric-${index + 1}`,
      name: item.name,
      type: item.type,
      weight: String(item.weight),
      score: "",
      maxScore: "10",
      rubricItem: true,
    })),
  };
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rubricTone(status) {
  if (status === "reference") {
    return {
      box: "border-amber-400/20 bg-amber-400/[0.06]",
      badge: "border-amber-400/25 bg-amber-400/10 text-amber-200",
      icon: "text-amber-300",
    };
  }

  if (status === "official-with-note") {
    return {
      box: "border-violet-400/20 bg-violet-400/[0.06]",
      badge: "border-violet-400/25 bg-violet-400/10 text-violet-200",
      icon: "text-violet-300",
    };
  }

  return {
    box: "border-emerald-400/20 bg-emerald-400/[0.05]",
    badge: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    icon: "text-emerald-300",
  };
}

export default function GradeTracker({
  subjects,
  activeSubject,
  onSubjectChange,
  gradeBooks,
  onGradeBooksChange,
}) {
  const [draft, setDraft] = useState({
    name: "",
    type: "Actividad",
    weight: "",
    score: "",
    maxScore: "10",
  });

  const rubric = OFFICIAL_RUBRICS[activeSubject] || null;

  const currentBook =
    gradeBooks[activeSubject] ||
    (rubric ? rubricBook(activeSubject) : emptyBook());

  const updateCurrentBook = (updater) => {
    onGradeBooksChange((previous) => {
      const baseBook =
        previous[activeSubject] ||
        (rubric ? rubricBook(activeSubject) : emptyBook());

      const nextBook =
        typeof updater === "function" ? updater(baseBook) : updater;

      return {
        ...previous,
        [activeSubject]: nextBook,
      };
    });
  };

  const metrics = useMemo(() => {
    const items = currentBook.items || [];

    const totalConfiguredWeight = items.reduce(
      (sum, item) => sum + Math.max(0, toNumber(item.weight)),
      0
    );

    const evaluatedItems = items.filter(
      (item) =>
        item.score !== "" &&
        item.score !== null &&
        item.score !== undefined &&
        toNumber(item.maxScore, 10) > 0
    );

    const evaluatedWeight = evaluatedItems.reduce(
      (sum, item) => sum + Math.max(0, toNumber(item.weight)),
      0
    );

    const earnedContribution = evaluatedItems.reduce((sum, item) => {
      const score = toNumber(item.score);
      const maxScore = Math.max(0.0001, toNumber(item.maxScore, 10));
      const weight = Math.max(0, toNumber(item.weight));

      return sum + (score / maxScore) * 10 * (weight / 100);
    }, 0);

    const currentOnEvaluated =
      evaluatedWeight > 0
        ? earnedContribution / (evaluatedWeight / 100)
        : null;

    const remainingWeight = Math.max(0, 100 - evaluatedWeight);
    const target = toNumber(currentBook.target, 8);

    const neededAverage =
      remainingWeight > 0
        ? (target - earnedContribution) / (remainingWeight / 100)
        : null;

    const bestPossible = earnedContribution + remainingWeight / 10;

    return {
      totalConfiguredWeight,
      evaluatedWeight,
      earnedContribution,
      currentOnEvaluated,
      remainingWeight,
      neededAverage,
      bestPossible,
    };
  }, [currentBook]);

  const addItem = (event) => {
    event.preventDefault();

    const name = draft.name.trim();
    if (!name) return;

    updateCurrentBook((book) => ({
      ...book,
      items: [
        ...(book.items || []),
        {
          id: makeId(),
          name,
          type: draft.type.trim() || "Actividad",
          weight: draft.weight,
          score: draft.score,
          maxScore: draft.maxScore || "10",
          rubricItem: false,
        },
      ],
    }));

    setDraft({
      name: "",
      type: "Actividad",
      weight: "",
      score: "",
      maxScore: "10",
    });
  };

  const updateItem = (itemId, patch) => {
    updateCurrentBook((book) => ({
      ...book,
      items: (book.items || []).map((item) =>
        item.id === itemId ? { ...item, ...patch } : item
      ),
    }));
  };

  const deleteItem = (itemId) => {
    updateCurrentBook((book) => ({
      ...book,
      items: (book.items || []).filter((item) => item.id !== itemId),
    }));
  };

  const restoreRubric = () => {
    if (!rubric) return;

    const hasScores = (currentBook.items || []).some(
      (item) =>
        item.score !== "" &&
        item.score !== null &&
        item.score !== undefined
    );

    if (
      hasScores &&
      !window.confirm(
        "Esto restaurará la rúbrica de la asignatura y borrará las notas introducidas en esta materia. ¿Continuar?"
      )
    ) {
      return;
    }

    updateCurrentBook(
      rubricBook(activeSubject, currentBook.target ?? 8)
    );
  };

  const currentSubject =
    subjects.find((subject) => subject.id === activeSubject) || subjects[0];

  const currentGradeLabel =
    metrics.currentOnEvaluated === null
      ? "—"
      : metrics.currentOnEvaluated.toFixed(2);

  const neededLabel =
    metrics.neededAverage === null
      ? "—"
      : metrics.neededAverage <= 0
        ? "Objetivo ya alcanzado"
        : metrics.neededAverage > 10
          ? `${metrics.neededAverage.toFixed(2)} · imposible sin extras`
          : metrics.neededAverage.toFixed(2);

  const rubricStyle = rubric ? rubricTone(rubric.status) : null;

  return (
    <main className="w-full max-w-[1400px] mx-auto px-4 pb-8 z-10">
      <div className="mb-5 glass-card border-white/5 p-4">
        <div className="flex flex-wrap gap-2">
          {subjects.map((subject) => {
            const Icon = subject.icon;
            const active = subject.id === activeSubject;

            return (
              <button
                key={subject.id}
                type="button"
                onClick={() => onSubjectChange(subject.id)}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-cyan-400/35 bg-cyan-400/10 text-cyan-200"
                    : "border-white/10 bg-white/[0.02] text-slate-400 hover:bg-white/[0.05]"
                }`}
              >
                <Icon size={15} />
                {subject.name}
              </button>
            );
          })}
        </div>
      </div>

      {rubric && (
        <section
          className={`mb-5 rounded-2xl border p-4 ${rubricStyle.box}`}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <BookOpen size={17} className={rubricStyle.icon} />
                <h2 className="font-semibold text-white">
                  Rúbrica de evaluación
                </h2>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${rubricStyle.badge}`}
                >
                  {rubric.badge}
                </span>
              </div>

              <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-300">
                {rubric.note}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  window.open(
                    rubric.sourceUrl,
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.06]"
              >
                <ExternalLink size={13} />
                {rubric.sourceLabel}
              </button>

              <button
                type="button"
                onClick={restoreRubric}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.06]"
              >
                <RefreshCw size={13} />
                Restaurar rúbrica
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-5">
          <section className="glass-card border-white/5 p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                <BarChart3 size={21} />
              </div>
              <div>
                <h2 className="font-semibold text-white">
                  {currentSubject?.name}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Seguimiento según la evaluación configurada
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Nota sobre lo evaluado
              </p>

              <p className="mt-3 text-5xl font-bold tracking-tight text-white">
                {currentGradeLabel}
              </p>

              <p className="mt-2 text-sm text-slate-500">sobre 10</p>

              <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-cyan-400 transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(0, metrics.evaluatedWeight)
                    )}%`,
                  }}
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-500">Evaluado</span>
                <span className="font-semibold text-cyan-200">
                  {metrics.evaluatedWeight.toFixed(1)} %
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs text-slate-500">Acumulado final</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {metrics.earnedContribution.toFixed(2)}
                  <span className="text-xs font-normal text-slate-500">
                    {" "}
                    / 10
                  </span>
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs text-slate-500">Máximo posible</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {Math.min(10, metrics.bestPossible).toFixed(2)}
                  <span className="text-xs font-normal text-slate-500">
                    {" "}
                    / 10
                  </span>
                </p>
              </div>
            </div>

            {Math.abs(metrics.totalConfiguredWeight - 100) <= 0.01 && (
              <div className="mt-4 flex gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-3 text-xs text-emerald-200">
                <CheckCircle2 size={15} className="shrink-0" />
                La evaluación configurada suma exactamente el 100 %.
              </div>
            )}

            {metrics.totalConfiguredWeight > 100.01 && (
              <div className="mt-4 flex gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-xs text-rose-200">
                <AlertTriangle size={15} className="shrink-0" />
                Los pesos suman más del 100 %. Revisa la configuración.
              </div>
            )}

            {metrics.totalConfiguredWeight < 99.99 && (
              <div className="mt-4 flex gap-2 rounded-xl border border-amber-400/15 bg-amber-400/[0.05] p-3 text-xs text-amber-100">
                <Info size={15} className="shrink-0" />
                Falta configurar{" "}
                {(100 - metrics.totalConfiguredWeight).toFixed(1)} % de la
                asignatura.
              </div>
            )}
          </section>

          <section className="glass-card border-white/5 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Target size={17} className="text-purple-300" />
              <h3 className="font-semibold text-white">Objetivo</h3>
            </div>

            <label>
              <span className="mb-2 block text-xs text-slate-500">
                Nota final objetivo
              </span>
              <input
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={currentBook.target ?? 8}
                onChange={(event) =>
                  updateCurrentBook((book) => ({
                    ...book,
                    target: event.target.value,
                  }))
                }
                className="input-dark"
              />
            </label>

            <div className="mt-4 rounded-xl border border-purple-400/15 bg-purple-500/[0.06] p-3">
              <p className="text-xs text-slate-500">
                Media necesaria en el peso aún no evaluado
              </p>
              <p className="mt-1 text-lg font-semibold text-purple-200">
                {neededLabel}
              </p>
              <p className="mt-1 text-[11px] text-slate-600">
                Calculado usando los pesos reales configurados en la tabla.
              </p>
            </div>
          </section>
        </aside>

        <section className="glass-card border-white/5 p-5 shadow-2xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Calculator size={19} className="text-cyan-300" />
                <h2 className="text-xl font-semibold text-white">
                  Evaluación de la asignatura
                </h2>
              </div>

              <p className="mt-1 text-sm text-slate-400">
                Las filas oficiales aparecen precargadas. Introduce las notas
                conforme las vayas obteniendo.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[820px] text-left">
              <thead className="bg-black/30 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Actividad</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Nota</th>
                  <th className="px-4 py-3">Sobre</th>
                  <th className="px-4 py-3">Peso</th>
                  <th className="px-4 py-3">Aporta</th>
                  <th className="w-12 px-3 py-3" />
                </tr>
              </thead>

              <tbody>
                {(currentBook.items || []).length === 0 && (
                  <tr>
                    <td
                      colSpan="7"
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      Todavía no has añadido evaluaciones a esta asignatura.
                    </td>
                  </tr>
                )}

                {(currentBook.items || []).map((item) => {
                  const hasScore =
                    item.score !== "" &&
                    item.score !== null &&
                    item.score !== undefined;

                  const maxScore = Math.max(
                    0.0001,
                    toNumber(item.maxScore, 10)
                  );

                  const contribution = hasScore
                    ? (toNumber(item.score) / maxScore) *
                      10 *
                      (toNumber(item.weight) / 100)
                    : null;

                  return (
                    <tr
                      key={item.id}
                      className={`border-t border-white/5 ${
                        item.rubricItem
                          ? "bg-cyan-400/[0.015]"
                          : "bg-white/[0.01]"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex min-w-48 items-center gap-2">
                          {item.rubricItem && (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300"
                              title="Elemento de la rúbrica"
                            />
                          )}
                          <input
                            value={item.name}
                            onChange={(event) =>
                              updateItem(item.id, {
                                name: event.target.value,
                              })
                            }
                            className="w-full bg-transparent text-sm font-medium text-white outline-none"
                          />
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <input
                          value={item.type}
                          onChange={(event) =>
                            updateItem(item.id, {
                              type: event.target.value,
                            })
                          }
                          className="w-28 bg-transparent text-sm text-slate-400 outline-none"
                        />
                      </td>

                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.score}
                          onChange={(event) =>
                            updateItem(item.id, {
                              score: event.target.value,
                            })
                          }
                          placeholder="—"
                          className="w-20 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-400/40"
                        />
                      </td>

                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.maxScore}
                          onChange={(event) =>
                            updateItem(item.id, {
                              maxScore: event.target.value,
                            })
                          }
                          className="w-20 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-400/40"
                        />
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={item.weight}
                            onChange={(event) =>
                              updateItem(item.id, {
                                weight: event.target.value,
                              })
                            }
                            className="w-20 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-400/40"
                          />
                          <span className="text-xs text-slate-500">%</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-sm font-semibold text-cyan-200">
                        {contribution === null
                          ? "—"
                          : contribution.toFixed(2)}
                      </td>

                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => deleteItem(item.id)}
                          className="rounded-lg p-2 text-slate-600 hover:bg-rose-500/10 hover:text-rose-300"
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <form
            onSubmit={addItem}
            className="mt-5 rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.04] p-4"
          >
            <div className="mb-3 flex items-center gap-2">
              <Plus size={16} className="text-cyan-300" />
              <h3 className="font-semibold text-white">
                Añadir evaluación manual
              </h3>
            </div>

            <p className="mb-4 text-xs text-slate-500">
              Úsalo si el profesorado añade actividades, bonus o desgloses que
              no figuren todavía en la guía.
            </p>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              <label className="md:col-span-2">
                <span className="mb-1.5 block text-xs text-slate-500">
                  Nombre
                </span>
                <input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                  className="input-dark"
                  placeholder="Actividad adicional"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-xs text-slate-500">
                  Tipo
                </span>
                <input
                  value={draft.type}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      type: event.target.value,
                    }))
                  }
                  className="input-dark"
                  placeholder="Examen"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-xs text-slate-500">
                  Peso %
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={draft.weight}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      weight: event.target.value,
                    }))
                  }
                  className="input-dark"
                  placeholder="10"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-xs text-slate-500">
                  Nota opcional
                </span>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.score}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        score: event.target.value,
                      }))
                    }
                    className="input-dark min-w-0"
                    placeholder="—"
                  />

                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={draft.maxScore}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        maxScore: event.target.value,
                      }))
                    }
                    className="input-dark w-20"
                    title="Nota máxima"
                  />
                </div>
              </label>
            </div>

            <button
              type="submit"
              className="btn-primary mt-4 flex items-center gap-2"
            >
              <Plus size={15} />
              Añadir
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
