import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const PROJECT_ROOT = path.resolve(process.cwd());
const PYTHON_SCRIPT = path.join(PROJECT_ROOT, "scientific", "notebook_plot.py");
const MEDIA_ROOT = path.join(PROJECT_ROOT, "notes", "media");

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .trim() || "general";
}

function getPythonCommand() {
  const configured = String(process.env.LUMINA_PYTHON || "").trim();
  if (configured) return { command: configured, prefixArgs: [] };

  const winVenv = path.join(PROJECT_ROOT, ".venv", "Scripts", "python.exe");
  const posixVenv = path.join(PROJECT_ROOT, ".venv", "bin", "python");

  if (fs.existsSync(winVenv)) return { command: winVenv, prefixArgs: [] };
  if (fs.existsSync(posixVenv)) return { command: posixVenv, prefixArgs: [] };

  if (process.platform === "win32") return { command: "py", prefixArgs: ["-3"] };
  return { command: "python3", prefixArgs: [] };
}

async function createPlotSpec({ prompt, model, ollamaUrl, subjectName }) {
  const plannerPrompt = `
Eres un planificador para figuras científicas exactas en apuntes de Ingeniería Física.

Convierte la petición del usuario a un JSON para dibujar una gráfica exacta con Python.
Devuelve SOLO JSON válido.

Admite estos tipos:
- function_plot: una o varias funciones y(x)
- scatter_fit: puntos experimentales + ajuste polinómico

Formato de salida:
{
  "type": "function_plot",
  "expressions": ["sin(x)", "0.3*sin(5*x)"],
  "labels": ["sin(x)", "0.3 sin(5x)"],
  "variable": "x",
  "x_min": "-2*pi",
  "x_max": "2*pi",
  "title": "Señal compuesta",
  "x_label": "x",
  "y_label": "y",
  "caption": "Señal compuesta ...",
  "filename_base": "senal-compuesta",
  "grid": true,
  "legend": true,
  "samples": 1200
}

o

{
  "type": "scatter_fit",
  "x": [0,1,2,3],
  "y": [1.1,2.0,3.1,3.9],
  "fit_degree": 1,
  "title": "Ajuste experimental",
  "x_label": "x",
  "y_label": "y",
  "caption": "Datos experimentales y ajuste lineal.",
  "filename_base": "ajuste-experimental",
  "grid": true,
  "legend": true
}

Reglas:
- Usa sintaxis compatible con SymPy: **, sin(), cos(), exp(), log(), sqrt(), pi.
- No inventes datos numéricos que no estén en el prompt.
- Si el usuario pide una única curva, usa function_plot.
- Si el usuario pide puntos/medidas/datos, usa scatter_fit.
- Si falta el título, crea uno breve y técnico.
- Si falta la caption, crea una caption breve y útil.
- filename_base debe ser corto y sin espacios.
- Si el prompt es ambiguo, elige la interpretación más razonable para un apunte técnico.

Asignatura: ${subjectName || "Ingeniería Física"}

Petición del usuario:
"""
${String(prompt || "").slice(0, 6000)}
"""
`.trim();

  const response = await fetch(ollamaUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      format: "json",
      options: {
        temperature: 0,
        num_ctx: 3072,
        num_predict: 500,
      },
      messages: [{ role: "user", content: plannerPrompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama devolvió HTTP ${response.status}`);
  }

  const data = await response.json();
  const raw = String(data?.message?.content || "")
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();

  const parsed = JSON.parse(raw);

  if (!parsed?.type) {
    throw new Error("La IA no devolvió un spec de gráfica válido.");
  }

  return parsed;
}

function runPythonPlot(spec, outputDir) {
  return new Promise((resolve, reject) => {
    const { command, prefixArgs } = getPythonCommand();

    const child = spawn(command, [...prefixArgs, PYTHON_SCRIPT], {
      cwd: PROJECT_ROOT,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(new Error(`No se pudo iniciar Python: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Python terminó con código ${code}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout || "{}");
        if (!parsed.ok) {
          reject(new Error(parsed.error || "No se pudo generar la gráfica."));
          return;
        }
        resolve(parsed);
      } catch (error) {
        reject(new Error(`JSON inválido desde Python: ${error.message}`));
      }
    });

    child.stdin.end(JSON.stringify({ ...spec, output_dir: outputDir }));
  });
}

function buildLatexFigure({
  pdfRelativePath,
  caption,
  label,
  width = "0.88\\textwidth",
}) {
  return `
\\begin{figure}[h]
    \\centering
    \\includegraphics[width=${width}]{${pdfRelativePath}}
    \\caption{${caption}}
    \\label{${label}}
\\end{figure}
`.trim();
}

export function registerNotebookScientificFigureRoutes(
  app,
  {
    model = "qwen3.5:4b",
    ollamaUrl = "http://localhost:11434/api/chat",
  } = {}
) {
  app.post("/api/notebook/figure-plot/generate", async (req, res) => {
    try {
      const prompt = String(req.body?.prompt || "").trim();
      const subjectName = String(req.body?.subjectName || "general");
      const noteDate = String(req.body?.noteDate || "").trim() || new Date().toISOString().slice(0, 10);

      if (!prompt) {
        return res.status(400).json({ ok: false, error: "Falta prompt." });
      }

      const spec = await createPlotSpec({
        prompt,
        model,
        ollamaUrl,
        subjectName,
      });

      const subjectSlug = slugify(subjectName);
      const dateSlug = slugify(noteDate);
      const outputDir = path.join(MEDIA_ROOT, subjectSlug, dateSlug);
      fs.mkdirSync(outputDir, { recursive: true });

      const plot = await runPythonPlot(spec, outputDir);

      const pdfRelativePath = path
        .relative(path.join(PROJECT_ROOT, "notes"), plot.pdf_path)
        .split(path.sep)
        .join("/");

      const previewRelativePath = path
        .relative(PROJECT_ROOT, plot.png_path)
        .split(path.sep)
        .join("/");

      const label = `fig:${slugify(plot.filename_base || "grafica")}`;

      const latexBlock = buildLatexFigure({
        pdfRelativePath,
        caption: plot.caption,
        label,
      });

      res.json({
        ok: true,
        spec,
        latexBlock,
        caption: plot.caption,
        label,
        pdfPath: plot.pdf_path,
        pngPath: plot.png_path,
        filenameBase: plot.filename_base,
        previewUrl: `/api/notebook/media/${encodeURIComponent(subjectSlug)}/${encodeURIComponent(dateSlug)}/${encodeURIComponent(path.basename(plot.png_path))}`,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error.message || "No se pudo generar la gráfica científica.",
      });
    }
  });

  app.get("/api/notebook/media/:subject/:date/:file", (req, res) => {
    const subject = slugify(req.params.subject || "");
    const date = slugify(req.params.date || "");
    const file = path.basename(String(req.params.file || ""));

    const fullPath = path.join(MEDIA_ROOT, subject, date, file);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).send("Archivo no encontrado.");
    }

    res.sendFile(fullPath);
  });
}
