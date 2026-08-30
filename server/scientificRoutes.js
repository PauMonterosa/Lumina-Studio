import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const PROJECT_ROOT = path.resolve(process.cwd());
const ENGINE_PATH = path.join(PROJECT_ROOT, "scientific", "engine.py");
const PLOTS_DIR = path.join(PROJECT_ROOT, ".lumina", "scientific", "plots");

const ALLOWED_OPERATIONS = new Set([
  "simplify",
  "expand",
  "factor",
  "solve",
  "diff",
  "integrate",
  "limit",
  "series",
  "evaluate",
  "matrix",
  "linear_solve",
  "root",
  "numeric_integral",
  "ode",
  "fft",
  "polyfit",
  "plot",
]);

const SCIENTIFIC_TRIGGER =
  /\b(resuelv|solve|calcul|deriv|differentiat|integr|simplif|factoriz|limit|serie de taylor|taylor series|autovalor|eigen|autovector|matriz invers|inverse matrix|determinante|determinant|sistema lineal|linear system|ra[ií]z|root|edo\b|ode\b|ecuaci[oó]n diferencial|differential equation|fft\b|fourier|ajust|polyfit|regresi[oó]n|fit\b|gr[aá]fic|representa|plot\b)\b/i;

const MATH_TRIGGER =
  /(?:\d\s*[+\-*/^]\s*\d|=|∫|√|\\frac|\\int|sin\s*\(|cos\s*\(|exp\s*\(|log\s*\(|\[[^\]]+\])/i;

function getPythonCommand() {
  const configured = String(process.env.LUMINA_PYTHON || "").trim();

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

  if (fs.existsSync(windowsVenv)) {
    return {
      command: windowsVenv,
      prefixArgs: [],
    };
  }

  if (fs.existsSync(posixVenv)) {
    return {
      command: posixVenv,
      prefixArgs: [],
    };
  }

  if (process.platform === "win32") {
    return {
      command: "py",
      prefixArgs: ["-3"],
    };
  }

  return {
    command: "python3",
    prefixArgs: [],
  };
}

function normalizePlannerText(value = "") {
  return String(value)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function looksScientific(question = "") {
  const text = String(question || "").trim();

  if (text.length < 2) return false;

  return SCIENTIFIC_TRIGGER.test(text) || MATH_TRIGGER.test(text);
}

function sanitizePlan(plan) {
  if (!plan || typeof plan !== "object") return null;
  if (!plan.use_tool) return null;

  const operation = String(plan.operation || "")
    .trim()
    .toLowerCase();

  if (!ALLOWED_OPERATIONS.has(operation)) {
    return null;
  }

  const cleaned = {
    ...plan,
    operation,
  };

  delete cleaned.use_tool;
  delete cleaned.reason;

  return cleaned;
}

async function createScientificPlan({
  question,
  subjectName,
  model,
  ollamaUrl,
  keepAlive = "1m",
}) {
  if (!looksScientific(question)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);

  const plannerPrompt = `
Eres el router matemático de Lumina Studio.

Tu única tarea es decidir si la pregunta necesita un motor científico y,
si lo necesita, traducirla a UNA operación JSON segura.

Asignatura: ${subjectName || "Ingeniería Física"}

Pregunta:
"""
${String(question || "").slice(0, 7000)}
"""

Operaciones disponibles:
- simplify: simplificar una expresión simbólica.
- expand: expandir.
- factor: factorizar.
- solve: resolver una ecuación en una variable.
- diff: derivar.
- integrate: integrar simbólicamente; lower+upper si es definida.
- limit: calcular límite.
- series: serie de Taylor.
- evaluate: evaluar una expresión sustituyendo variables.
- matrix: det, inverse, rank, eigenvalues, eigenvectors, transpose.
- linear_solve: resolver A x = b.
- root: raíz numérica con bracket=[a,b] o guess.
- numeric_integral: integral numérica con lower y upper.
- ode: ODE escalar dy/dt=f(t,y), con t0,t1,y0.
- fft: FFT de una lista samples, con sample_rate.
- polyfit: ajuste polinómico con x, y y degree.
- plot: representar una o varias expresiones.

Campos posibles:
{
  "use_tool": true,
  "operation": "solve",
  "expression": "x**2 - 5*x + 6",
  "equation": "x**2 - 5*x + 6 = 0",
  "variable": "x",
  "order": 1,
  "point": 0,
  "direction": "+-",
  "lower": 0,
  "upper": "pi",
  "substitutions": {"R": 1000, "C": "1e-6"},
  "precision": 12,
  "matrix": [[1,2],[3,4]],
  "vector": [1,2],
  "action": "eigenvalues",
  "bracket": [0,2],
  "guess": 1,
  "expressions": ["sin(x)", "cos(x)"],
  "x_min": -6.28,
  "x_max": 6.28,
  "title": "Título",
  "plot": true,
  "t0": 0,
  "t1": 10,
  "y0": 1,
  "samples": [0,1,0,-1],
  "sample_rate": 1000,
  "x": [0,1,2],
  "y": [1,3,5],
  "degree": 1
}

Reglas:
- Devuelve SOLO un objeto JSON.
- Si la pregunta es puramente conceptual, devuelve:
  {"use_tool": false}
- NO generes código Python.
- Usa sintaxis matemática compatible con SymPy: ** para potencias, pi, E,
  sin(), cos(), exp(), log(), sqrt().
- Conserva los datos dados por el usuario. No inventes números.
- Si el usuario pide una gráfica, usa plot o activa "plot": true en ode,
  fft o polyfit.
- Para una ecuación usa preferentemente "equation".
- Para aritmética o sustitución usa "evaluate".
`.trim();

  try {
    const response = await fetch(ollamaUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        keep_alive: keepAlive,
        format: "json",
        options: {
          temperature: 0,
          top_p: 0.8,
          num_ctx: 3072,
          num_predict: 500,
        },
        messages: [
          {
            role: "user",
            content: plannerPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Planner científico: Ollama HTTP ${response.status}`
      );
    }

    const data = await response.json();
    const raw = normalizePlannerText(
      data?.message?.content || ""
    );

    const parsed = JSON.parse(raw);
    return sanitizePlan(parsed);
  } finally {
    clearTimeout(timeout);
  }
}

export function runScientificEngine(payload, timeoutMs = 22000) {
  return new Promise((resolve, reject) => {
    const { command, prefixArgs } = getPythonCommand();

    fs.mkdirSync(PLOTS_DIR, {
      recursive: true,
    });

    const request = {
      ...payload,
      output_dir: PLOTS_DIR,
    };

    const child = spawn(
      command,
      [...prefixArgs, ENGINE_PATH],
      {
        cwd: PROJECT_ROOT,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (handler, value) => {
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
          "El cálculo científico superó el tiempo máximo permitido."
        )
      );
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 2_000_000) {
        child.kill();
        finish(
          reject,
          new Error(
            "El motor científico devolvió demasiados datos."
          )
        );
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      finish(
        reject,
        new Error(
          `No se pudo iniciar Python: ${error.message}`
        )
      );
    });

    child.on("close", (code) => {
      if (settled) return;

      if (code !== 0) {
        return finish(
          reject,
          new Error(
            stderr.trim() ||
              `Python terminó con código ${code}.`
          )
        );
      }

      try {
        const result = JSON.parse(stdout || "{}");

        if (!result.ok) {
          return finish(
            reject,
            new Error(
              result.error ||
                "El motor científico no pudo resolver la operación."
            )
          );
        }

        if (result.plot_file) {
          result.plot_url =
            `http://localhost:3001/api/scientific/plots/` +
            encodeURIComponent(result.plot_file);
        }

        finish(resolve, result);
      } catch (error) {
        finish(
          reject,
          new Error(
            `Respuesta Python no válida: ${error.message}`
          )
        );
      }
    });

    child.stdin.end(JSON.stringify(request));
  });
}

function compactResult(result) {
  const copy = {
    ...result,
  };

  // La gráfica se envía al frontend por un canal estructurado.
  // No exponemos la URL/ruta a Qwen para que no intente crear
  // una segunda imagen Markdown.
  delete copy.plot_url;
  delete copy.plot_file;

  if (copy.series) {
    const t = copy.series.t || [];
    const y = copy.series.y || [];

    copy.series = {
      first: t.length
        ? {
            t: t[0],
            y: y[0],
          }
        : null,
      last: t.length
        ? {
            t: t[t.length - 1],
            y: y[y.length - 1],
          }
        : null,
      points: t.length,
    };
  }

  let text = JSON.stringify(copy, null, 2);

  if (text.length > 9000) {
    text = text.slice(0, 9000) + "\n... resultado truncado ...";
  }

  return text;
}

export async function getScientificContext({
  question,
  subjectName,
  model,
  ollamaUrl,
  keepAlive,
}) {
  const plan = await createScientificPlan({
    question,
    subjectName,
    model,
    ollamaUrl,
    keepAlive,
  });

  if (!plan) {
    return {
      context: "",
      plotUrl: null,
      operation: null,
    };
  }

  const result = await runScientificEngine(plan);
  const compact = compactResult(result);

  const context = `
[MOTOR CIENTÍFICO LUMINA — RESULTADO VERIFICADO]

Lumina ha usado Python científico para esta pregunta.
La operación ejecutada fue: ${plan.operation}

Resultado del motor:
${compact}

Reglas para responder:
- Trata este resultado como la referencia para el cálculo simbólico o numérico.
- Explica el procedimiento al estudiante; no te limites a copiar el JSON.
- No contradigas el resultado con aritmética improvisada.
- Conserva y comprueba las unidades a partir del enunciado original.
- Si el motor no contiene una unidad, NO inventes una.
- Si existe una gráfica estructurada, NO escribas su URL ni intentes recrearla en Markdown:
  Lumina la mostrará automáticamente debajo de tu explicación.
`.trim();

  let plotUrl = null;

  if (result.plot_file) {
    try {
      const plotPath = path.join(
        PLOTS_DIR,
        result.plot_file
      );

      const imageBuffer = await fs.promises.readFile(
        plotPath
      );

      plotUrl =
        "data:image/png;base64," +
        imageBuffer.toString("base64");
    } catch (error) {
      console.warn(
        "Scientific Engine: no se pudo incrustar la gráfica:",
        error.message
      );
    }
  }

  return {
    context,
    plotUrl,
    operation: plan.operation,
  };
}

export function registerScientificRoutes(
  app,
  {
    model = "qwen3.5:4b",
    ollamaUrl = "http://localhost:11434/api/chat",
    keepAlive = "1m",
  } = {}
) {
  app.get("/api/scientific/health", async (req, res) => {
    try {
      const result = await runScientificEngine(
        {
          operation: "health",
        },
        12000
      );

      res.json({
        ...result,
        autoRouting: true,
        model,
      });
    } catch (error) {
      res.status(503).json({
        ok: false,
        error:
          error.message ||
          "Lumina Scientific Engine no está disponible.",
      });
    }
  });

  app.post("/api/scientific/run", async (req, res) => {
    try {
      const operation = String(
        req.body?.operation || ""
      )
        .trim()
        .toLowerCase();

      if (!ALLOWED_OPERATIONS.has(operation)) {
        return res.status(400).json({
          ok: false,
          error: "Operación científica no permitida.",
        });
      }

      const result = await runScientificEngine({
        ...req.body,
        operation,
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "No se pudo ejecutar el cálculo científico.",
      });
    }
  });

  app.post("/api/scientific/plan", async (req, res) => {
    try {
      const question = String(
        req.body?.question || ""
      ).trim();

      if (!question) {
        return res.status(400).json({
          ok: false,
          error: "Falta question.",
        });
      }

      const plan = await createScientificPlan({
        question,
        subjectName: req.body?.subjectName,
        model,
        ollamaUrl,
        keepAlive,
      });

      res.json({
        ok: true,
        useTool: Boolean(plan),
        plan,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "No se pudo crear el plan científico.",
      });
    }
  });

  app.get("/api/scientific/plots/:file", (req, res) => {
    const file = String(req.params.file || "");

    if (!/^plot-[a-f0-9]+\.png$/i.test(file)) {
      return res.status(400).send("Nombre de gráfica no válido.");
    }

    const fullPath = path.join(PLOTS_DIR, file);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).send("Gráfica no encontrada.");
    }

    res.sendFile(fullPath);
  });
}
