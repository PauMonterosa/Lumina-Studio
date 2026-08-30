import {
  AlertTriangle,
  BarChart3,
  Calculator,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

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

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

  const currentBook = gradeBooks[activeSubject] || emptyBook();

  const updateCurrentBook = (updater) => {
    onGradeBooksChange((previous) => {
      const baseBook = previous[activeSubject] || emptyBook();
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

    return {
      totalConfiguredWeight,
      evaluatedWeight,
      earnedContribution,
      currentOnEvaluated,
      remainingWeight,
      neededAverage,
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
                  Seguimiento de evaluación continua
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
                <p className="text-xs text-slate-500">Peso configurado</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {metrics.totalConfiguredWeight.toFixed(1)}
                  <span className="text-xs font-normal text-slate-500"> %</span>
                </p>
              </div>
            </div>

            {metrics.totalConfiguredWeight > 100.01 && (
              <div className="mt-4 flex gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-xs text-rose-200">
                <AlertTriangle size={15} className="shrink-0" />
                Los pesos suman más del 100 %. Revisa la configuración.
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
                Cálculo orientativo suponiendo que el resto de la asignatura
                completa el 100 %.
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
                  Evaluación continua
                </h2>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                Añade parciales, prácticas, proyectos o cualquier actividad.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[760px] text-left">
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
                      className="border-t border-white/5 bg-white/[0.01]"
                    >
                      <td className="px-4 py-3">
                        <input
                          value={item.name}
                          onChange={(event) =>
                            updateItem(item.id, { name: event.target.value })
                          }
                          className="w-full min-w-40 bg-transparent text-sm font-medium text-white outline-none"
                        />
                      </td>

                      <td className="px-4 py-3">
                        <input
                          value={item.type}
                          onChange={(event) =>
                            updateItem(item.id, { type: event.target.value })
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
                            updateItem(item.id, { score: event.target.value })
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
              <h3 className="font-semibold text-white">Añadir evaluación</h3>
            </div>

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
                  placeholder="Parcial 1"
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
                  placeholder="20"
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

            <button type="submit" className="btn-primary mt-4 flex items-center gap-2">
              <Plus size={15} />
              Añadir
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
