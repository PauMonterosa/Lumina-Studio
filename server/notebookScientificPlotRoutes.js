import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const PROJECT_ROOT = path.resolve(process.cwd());
const PLOT_SCRIPT = path.join(
  PROJECT_ROOT,
  "scientific",
  "notebookScientificPlot.py"
);
const MEDIA_ROOT = path.join(
  PROJECT_ROOT,
  "notes",
  "media"
);

const PLOT_TYPE_LABELS = {
  function_plot: "Funciones",
  parametric: "Curva paramétrica",
  polar: "Curva polar",
  implicit_curve: "Curva implícita",
  contour: "Mapa de contorno",
  vector_field: "Campo vectorial",
  scatter_fit: "Datos + ajuste",
  surface_3d: "Superficie 3D",
};

const SPEC_CACHE = new Map();
const MAX_SPEC_CACHE = 40;

function normalizePromptText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cacheSpec(key, spec) {
  if (SPEC_CACHE.size >= MAX_SPEC_CACHE) {
    const firstKey = SPEC_CACHE.keys().next().value;
    if (firstKey) SPEC_CACHE.delete(firstKey);
  }
  SPEC_CACHE.set(key, spec);
}

function besselPreset(prompt) {
  const q = normalizePromptText(prompt);
  if (!q.includes("bessel")) return null;

  const wantsModified = /modificad|modified|\bi_n\b|\bk_n\b/.test(q);
  const wantsSecond = /segunda|second kind|neumann|bessely|\by_n\b/.test(q);
  const wantsFirstAndSecond = /primera.*segunda|first.*second|ambos tipos|both kinds/.test(q);

  if (wantsModified) {
    return {
      type: "function_plot",
      expressions: [
        "besseli(0,x)", "besseli(1,x)", "besseli(2,x)",
        "besselk(0,x)", "besselk(1,x)", "besselk(2,x)"
      ],
      labels: ["$I_0(x)$", "$I_1(x)$", "$I_2(x)$", "$K_0(x)$", "$K_1(x)$", "$K_2(x)$"],
      variable: "x",
      x_min: "0.15",
      x_max: "8",
      title: "Funciones de Bessel modificadas",
      x_label: "x",
      y_label: "Valor de la función",
      grid: true,
      legend: true,
      axis_at_zero: true,
      caption: "Funciones de Bessel modificadas de órdenes 0, 1 y 2 en el dominio $x\in[0.15,8]$.",
      filename_base: "bessel-modificadas",
      samples: 700,
      dpi: 130,
    };
  }

  if (wantsFirstAndSecond) {
    return {
      type: "function_plot",
      expressions: [
        "besselj(0,x)", "besselj(1,x)", "besselj(2,x)",
        "bessely(0,x)", "bessely(1,x)", "bessely(2,x)"
      ],
      labels: ["$J_0(x)$", "$J_1(x)$", "$J_2(x)$", "$Y_0(x)$", "$Y_1(x)$", "$Y_2(x)$"],
      variable: "x",
      x_min: "0.15",
      x_max: "20",
      y_min: "-2.5",
      y_max: "2.5",
      title: "Funciones de Bessel de primera y segunda especie",
      x_label: "x",
      y_label: "Valor de la función",
      grid: true,
      legend: true,
      axis_at_zero: true,
      caption: "Funciones de Bessel $J_n(x)$ y $Y_n(x)$ para los órdenes $n=0,1,2$.",
      filename_base: "bessel-primera-segunda",
      samples: 800,
      dpi: 130,
    };
  }

  if (wantsSecond) {
    return {
      type: "function_plot",
      expressions: ["bessely(0,x)", "bessely(1,x)", "bessely(2,x)", "bessely(3,x)"],
      labels: ["$Y_0(x)$", "$Y_1(x)$", "$Y_2(x)$", "$Y_3(x)$"],
      variable: "x",
      x_min: "0.15",
      x_max: "20",
      y_min: "-2.5",
      y_max: "2.5",
      title: "Funciones de Bessel de segunda especie",
      x_label: "x",
      y_label: "Valor de la función",
      grid: true,
      legend: true,
      axis_at_zero: true,
      caption: "Funciones de Bessel de segunda especie $Y_n(x)$ para $n=0,1,2,3$.",
      filename_base: "bessel-segunda-especie",
      samples: 800,
      dpi: 130,
    };
  }

  // Preset general: los órdenes más habituales de J_n. Evita Qwen por completo.
  return {
    type: "function_plot",
    expressions: ["besselj(0,x)", "besselj(1,x)", "besselj(2,x)", "besselj(3,x)", "besselj(4,x)"],
    labels: ["$J_0(x)$", "$J_1(x)$", "$J_2(x)$", "$J_3(x)$", "$J_4(x)$"],
    variable: "x",
    x_min: "0",
    x_max: "20",
    title: "Funciones de Bessel de primera especie",
    x_label: "x",
    y_label: "Valor de la función",
    grid: true,
    legend: true,
    axis_at_zero: true,
    caption: "Funciones de Bessel de primera especie $J_n(x)$ para los órdenes $n=0,1,2,3,4$.",
    filename_base: "funciones-bessel",
    samples: 800,
    dpi: 130,
  };
}

function explicitFunctionPreset(prompt) {
  const raw = String(prompt || "").trim();

  const formula = raw.match(
    /(?:^|\b)y\s*=\s*([^\n.;]+?)(?=\s+entre\s+|[\n.;]|$)/i
  );

  if (!formula) return null;

  const expression = formula[1].trim();
  if (!expression || expression.length > 500) return null;

  const range = raw.match(
    /\bentre\s+([^,;\n]+?)\s+y\s+([^,;\n.]+?)(?=[,;\n.]|$)/i
  );

  const titleMatch = raw.match(
    /(?:titulo|título)\s*[:=]\s*["“]?([^"”\n.;]+)["”]?/i
  );

  return {
    type: "function_plot",
    expressions: [expression],
    labels: [],
    variable: "x",
    x_min: range ? range[1].trim() : "-10",
    x_max: range ? range[2].trim() : "10",
    title: titleMatch ? titleMatch[1].trim() : "Representación de la función",
    x_label: "x",
    y_label: "y",
    grid: true,
    legend: false,
    axis_at_zero: true,
    caption: range
      ? `Representación de la función en el dominio indicado por el usuario.`
      : "Representación de la función en el dominio de visualización $x\in[-10,10]$.",
    filename_base: "funcion",
    samples: 750,
    dpi: 130,
  };
}

function specialFamilyPreset(prompt) {
  const q = normalizePromptText(prompt);

  const directFunction = explicitFunctionPreset(prompt);
  if (directFunction) return directFunction;

  const bessel = besselPreset(prompt);
  if (bessel) return bessel;

  if (q.includes("legendre")) {
    return {
      type: "function_plot",
      expressions: ["legendre(0,x)", "legendre(1,x)", "legendre(2,x)", "legendre(3,x)", "legendre(4,x)"],
      labels: ["$P_0(x)$", "$P_1(x)$", "$P_2(x)$", "$P_3(x)$", "$P_4(x)$"],
      variable: "x", x_min: "-1", x_max: "1",
      title: "Polinomios de Legendre", x_label: "x", y_label: "$P_n(x)$",
      grid: true, legend: true, axis_at_zero: true,
      caption: "Polinomios de Legendre para los órdenes $n=0,1,2,3,4$.",
      filename_base: "polinomios-legendre", samples: 650, dpi: 130,
    };
  }

  if (q.includes("hermite")) {
    return {
      type: "function_plot",
      expressions: ["hermite(0,x)", "hermite(1,x)", "hermite(2,x)", "hermite(3,x)", "hermite(4,x)"],
      labels: ["$H_0(x)$", "$H_1(x)$", "$H_2(x)$", "$H_3(x)$", "$H_4(x)$"],
      variable: "x", x_min: "-2.5", x_max: "2.5",
      title: "Polinomios de Hermite", x_label: "x", y_label: "$H_n(x)$",
      grid: true, legend: true, axis_at_zero: true,
      caption: "Polinomios de Hermite para los órdenes $n=0,1,2,3,4$.",
      filename_base: "polinomios-hermite", samples: 650, dpi: 130,
    };
  }

  if (q.includes("laguerre")) {
    return {
      type: "function_plot",
      expressions: ["laguerre(0,x)", "laguerre(1,x)", "laguerre(2,x)", "laguerre(3,x)", "laguerre(4,x)"],
      labels: ["$L_0(x)$", "$L_1(x)$", "$L_2(x)$", "$L_3(x)$", "$L_4(x)$"],
      variable: "x", x_min: "0", x_max: "10",
      title: "Polinomios de Laguerre", x_label: "x", y_label: "$L_n(x)$",
      grid: true, legend: true, axis_at_zero: true,
      caption: "Polinomios de Laguerre para los órdenes $n=0,1,2,3,4$.",
      filename_base: "polinomios-laguerre", samples: 650, dpi: 130,
    };
  }

  return null;
}

function sanitizeFilePart(value, fallback = "plot") {
  const cleaned = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return cleaned || fallback;
}

function latexEscape(value = "") {
  return String(value)
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([#$%&_{}])/g, "\\$1")
    .replace(/\^/g, "\\^{}")
    .replace(/~/g, "\\~{}");
}

function getPythonCommand() {
  const configured = String(
    process.env.LUMINA_PYTHON || ""
  ).trim();

  if (configured) {
    return {
      command: configured,
      prefixArgs: [],
    };
  }

  const windowsVenv = path.join(
    PROJECT_ROOT,
    ".venv",
    "Scripts",
    "python.exe"
  );

  const posixVenv = path.join(
    PROJECT_ROOT,
    ".venv",
    "bin",
    "python"
  );

  return {
    command:
      process.platform === "win32"
        ? windowsVenv
        : posixVenv,
    prefixArgs: [],
  };
}

function cleanPlannerJson(value = "") {
  return String(value)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

function normalizeSpec(spec = {}) {
  const type = String(
    spec.type || "function_plot"
  ).trim();

  if (!PLOT_TYPE_LABELS[type]) {
    throw new Error(
      `Tipo de gráfica no compatible: ${type}`
    );
  }

  return {
    ...spec,
    type,
    samples: Math.round(
      clampNumber(
        spec.samples,
        240,
        2600,
        800
      )
    ),
    dpi: Math.round(
      clampNumber(
        spec.dpi,
        110,
        200,
        140
      )
    ),
    latex_width: clampNumber(
      spec.latex_width,
      0.45,
      1.0,
      0.82
    ),
  };
}

async function createPlotSpec({
  prompt,
  subjectName,
  model,
  ollamaUrl,
}) {
  const cacheKey = `${subjectName || ""}::${normalizePromptText(prompt)}`;

  const cached = SPEC_CACHE.get(cacheKey);
  if (cached) {
    return normalizeSpec({ ...cached });
  }

  const preset = specialFamilyPreset(prompt);
  if (preset) {
    const normalized = normalizeSpec(preset);
    cacheSpec(cacheKey, normalized);
    return normalized;
  }

  // Planner compacto: Qwen solo traduce lenguaje natural -> JSON.
  // No necesita el contexto grande del tutor ni razonamiento largo.
  const plannerPrompt = `
Convierte esta petición de una gráfica científica a JSON. Devuelve SOLO JSON.

Asignatura: ${subjectName || "Ingeniería Física"}
Petición: ${String(prompt || "").slice(0, 3500)}

Tipos: function_plot, parametric, polar, implicit_curve, contour, vector_field, scatter_fit, surface_3d.

Campos por tipo:
function_plot: {type,expressions,labels,variable,x_min,x_max,y_min,y_max,title,x_label,y_label,grid,legend,axis_at_zero,caption,filename_base,samples}
parametric: {type,x_expression,y_expression,parameter,t_min,t_max,title,x_label,y_label,grid,equal_aspect,caption,filename_base}
polar: {type,r_expression,parameter,theta_min,theta_max,title,grid,caption,filename_base}
implicit_curve: {type,expression,x_variable,y_variable,x_min,x_max,y_min,y_max,title,x_label,y_label,equal_aspect,grid,caption,filename_base}
contour: {type,expression,x_variable,y_variable,x_min,x_max,y_min,y_max,levels,filled,colorbar,title,x_label,y_label,caption,filename_base}
vector_field: {type,u_expression,v_expression,x_variable,y_variable,x_min,x_max,y_min,y_max,density,normalize_vectors,title,x_label,y_label,caption,filename_base}
scatter_fit: {type,x,y,x_error,y_error,fit_degree,show_fit,title,x_label,y_label,grid,legend,caption,filename_base}
surface_3d: {type,expression,x_variable,y_variable,x_min,x_max,y_min,y_max,mesh_points,title,x_label,y_label,z_label,caption,filename_base}

Sintaxis matemática SymPy: **, pi, E, sin, cos, tan, exp, log, sqrt, Abs, Piecewise, Heaviside, besselj, bessely, besseli, besselk, legendre, hermite, laguerre, erf.
Para familias con orden n, NO dejes n simbólico: crea varias expresiones con órdenes enteros concretos.
No inventes datos físicos. Si falta solo un dominio necesario para visualizar, elige uno matemáticamente razonable y menciónalo en caption.
Una curva: legend=false salvo petición. Varias: legend=true. grid=true por defecto. No fijes colores.
Usa 650-900 samples para 2D; no más salvo petición explícita.
`.trim();

  const response = await fetch(ollamaUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      format: "json",
      keep_alive: "15s",
      options: {
        temperature: 0,
        top_p: 0.75,
        num_ctx: 2048,
        num_predict: 460,
      },
      messages: [{ role: "user", content: plannerPrompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama respondió con HTTP ${response.status}`);
  }

  const data = await response.json();
  const raw = cleanPlannerJson(data?.message?.content || "");

  let spec;
  try {
    spec = JSON.parse(raw);
  } catch {
    throw new Error("Qwen no devolvió una especificación JSON válida.");
  }

  const normalized = normalizeSpec(spec);
  cacheSpec(cacheKey, normalized);
  return normalized;
}

function runPlotPython(payload, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const {
      command,
      prefixArgs,
    } = getPythonCommand();

    const child = spawn(
      command,
      [...prefixArgs, PLOT_SCRIPT],
      {
        cwd: PROJECT_ROOT,
        windowsHide: true,
        stdio: [
          "pipe",
          "pipe",
          "pipe",
        ],
      }
    );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (
      handler,
      value
    ) => {
      if (settled) return;

      settled = true;
      clearTimeout(timer);
      handler(value);
    };

    const timer = setTimeout(() => {
      child.kill();

      finish(
        reject,
        new Error(
          "La generación de la gráfica ha superado el tiempo máximo."
        )
      );
    }, timeoutMs);

    child.stdout.on(
      "data",
      (chunk) => {
        stdout += chunk.toString();
      }
    );

    child.stderr.on(
      "data",
      (chunk) => {
        stderr += chunk.toString();
      }
    );

    child.on(
      "error",
      (error) => {
        finish(
          reject,
          new Error(
            `No se pudo iniciar Python: ${error.message}`
          )
        );
      }
    );

    child.on(
      "close",
      (code) => {
        if (settled) return;

        if (code !== 0) {
          finish(
            reject,
            new Error(
              stderr.trim() ||
                `Python terminó con código ${code}.`
            )
          );
          return;
        }

        try {
          const parsed = JSON.parse(
            stdout || "{}"
          );

          if (!parsed.ok) {
            finish(
              reject,
              new Error(
                parsed.error ||
                  "Python no pudo generar la gráfica."
              )
            );
            return;
          }

          finish(
            resolve,
            parsed
          );
        } catch (error) {
          finish(
            reject,
            new Error(
              `Respuesta Python no válida: ${error.message}`
            )
          );
        }
      }
    );

    child.stdin.end(
      JSON.stringify(payload)
    );
  });
}

function buildLatex({
  pdfPath,
  caption,
  label,
  width,
  specPath,
}) {
  const latexPdfPath =
    String(pdfPath)
      .replace(/\\/g, "/");

  const latexSpecPath =
    String(specPath)
      .replace(/\\/g, "/");

  const widthValue =
    clampNumber(
      width,
      0.45,
      1.0,
      0.82
    );

  return [
    "\\begin{figure}[H]",
    "    \\centering",
    `    \\includegraphics[width=${widthValue.toFixed(2)}\\textwidth]{${latexPdfPath}}`,
    `    \\caption{${latexEscape(caption)}}`,
    `    \\label{${label}}`,
    "\\end{figure}",
    `% Lumina Scientific Plot spec: ${latexSpecPath}`,
  ].join("\n");
}

export function registerNotebookScientificPlotRoutes(
  app,
  {
    model = "qwen3.5:4b",
    ollamaUrl = "http://localhost:11434/api/chat",
  } = {}
) {
  app.get(
    "/api/notebook/scientific-plot/health",
    async (req, res) => {
      try {
        const result =
          await runPlotPython(
            {
              operation: "health",
            },
            12000
          );

        res.json(result);
      } catch (error) {
        res.status(503).json({
          ok: false,
          error:
            error.message ||
            "El generador de gráficas no está disponible.",
        });
      }
    }
  );

  app.post(
    "/api/notebook/scientific-plot/generate",
    async (req, res) => {
      try {
        const {
          subject,
          subjectName,
          dateKey,
          prompt,
        } = req.body || {};

        if (
          !subject ||
          typeof subject !== "string"
        ) {
          return res.status(400).json({
            ok: false,
            error:
              "Asignatura no válida.",
          });
        }

        const cleanPrompt =
          String(prompt || "").trim();

        if (
          cleanPrompt.length < 3
        ) {
          return res.status(400).json({
            ok: false,
            error:
              "Describe la gráfica con un poco más de detalle.",
          });
        }

        const spec =
          await createPlotSpec({
            prompt: cleanPrompt,
            subjectName:
              subjectName || subject,
            model,
            ollamaUrl,
          });

        const subjectFolder =
          sanitizeFilePart(
            subject,
            "subject"
          );

        const dateFolder =
          sanitizeFilePart(
            dateKey ||
              new Date()
                .toISOString()
                .slice(0, 10),
            "date"
          );

        const outputDirectory =
          path.join(
            MEDIA_ROOT,
            subjectFolder,
            dateFolder
          );

        await fs.mkdir(
          outputDirectory,
          {
            recursive: true,
          }
        );

        const baseStem =
          sanitizeFilePart(
            spec.filename_base ||
              spec.title ||
              "scientific-plot",
            "scientific-plot"
          );

        const uniqueStem =
          `${baseStem}-${Date.now()}`;

        const result =
          await runPlotPython({
            operation: "generate",
            spec,
            output_dir:
              outputDirectory,
            file_stem:
              uniqueStem,
          });

        const specPath =
          path.join(
            outputDirectory,
            `${uniqueStem}.json`
          );

        await fs.writeFile(
          specPath,
          JSON.stringify(
            {
              version: 1,
              createdAt:
                new Date()
                  .toISOString(),
              subject,
              subjectName:
                subjectName || subject,
              dateKey:
                dateKey || "",
              originalPrompt:
                cleanPrompt,
              spec,
            },
            null,
            2
          ),
          "utf8"
        );

        const previewBuffer =
          await fs.readFile(
            result.png_path
          );

        const previewDataUrl =
          `data:image/png;base64,${previewBuffer.toString("base64")}`;

        const caption =
          String(
            spec.caption ||
              spec.title ||
              "Gráfica científica."
          ).trim();

        const labelStem =
          sanitizeFilePart(
            uniqueStem,
            "plot"
          ).toLowerCase();

        const label =
          `fig:${labelStem}`;

        const latex =
          buildLatex({
            pdfPath:
              result.pdf_path,
            caption,
            label,
            width:
              spec.latex_width,
            specPath,
          });

        res.json({
          ok: true,
          latex,
          caption,
          label,
          previewDataUrl,
          spec,
          plotType:
            spec.type,
          plotTypeLabel:
            PLOT_TYPE_LABELS[
              spec.type
            ],
          pngPath:
            result.png_path,
          pdfPath:
            result.pdf_path,
          specPath,
        });
      } catch (error) {
        console.error(
          "Notebook scientific plot:",
          error
        );

        res.status(500).json({
          ok: false,
          error:
            error.message ||
            "No se pudo generar la gráfica científica.",
        });
      }
    }
  );
}
