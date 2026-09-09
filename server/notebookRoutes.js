import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const DAILY_NOTES_DIR = path.resolve(process.cwd(), "notes", "daily");

const SUBJECT_NAMES = {
  nanotechnologies: "Nanotechnologies",
  quantum_technologies: "Quantum Technologies",
  microelectronics_design: "Microelectronics Design",
  cpia: "CPIA",
  biophotonics: "Biophotonics",
};

const ALLOWED_SUBJECTS = new Set(Object.keys(SUBJECT_NAMES));
const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function assertNotebookKey(subject, dateKey) {
  if (!ALLOWED_SUBJECTS.has(subject)) {
    throw new Error("Asignatura no válida.");
  }

  if (!DATE_KEY_REGEX.test(dateKey || "")) {
    throw new Error("Fecha no válida.");
  }
}

function subjectDirectory(subject) {
  return path.join(DAILY_NOTES_DIR, subject);
}

function notePath(subject, dateKey) {
  return path.join(subjectDirectory(subject), `${dateKey}.tex`);
}

function buildDirectory(subject) {
  return path.join(subjectDirectory(subject), ".build");
}

function compileSourcePath(subject, dateKey) {
  return path.join(buildDirectory(subject), `${dateKey}.tex`);
}

function pdfPath(subject, dateKey) {
  return path.join(buildDirectory(subject), `${dateKey}.pdf`);
}

async function ensureNotebookDirectories(subject) {
  await fs.mkdir(subjectDirectory(subject), { recursive: true });
  await fs.mkdir(buildDirectory(subject), { recursive: true });
}

function detectLatexPackages(content = "") {
  const packages = [
    "\\usepackage[margin=2.2cm]{geometry}",
    "\\usepackage{amsmath,amssymb}",
  ];

  if (/\\begin\{tikzpicture\}|\\tikz\b/.test(content)) {
    packages.push("\\usepackage{tikz}");
  }

  if (/\\includegraphics\b/.test(content)) {
    packages.push("\\usepackage{graphicx}");
  }

  if (/\\begin\{figure\}\[H\]|\\begin\{table\}\[H\]/.test(content)) {
    packages.push("\\usepackage{float}");
  }

  if (/\\toprule\b|\\midrule\b|\\bottomrule\b/.test(content)) {
    packages.push("\\usepackage{booktabs}");
  }

  if (/\\SI\b|\\si\b|\\qty\b|\\unit\b/.test(content)) {
    packages.push("\\usepackage{siunitx}");
  }

  if (/\\textcolor\b|\\color\b|\\definecolor\b/.test(content)) {
    packages.push("\\usepackage{xcolor}");
  }

  if (/\\href\b|\\url\b|\\hyperref\b/.test(content)) {
    packages.push("\\usepackage{hyperref}");
  }

  if (/\\coloneqq\b|\\mathclap\b|\\prescript\b/.test(content)) {
    packages.push("\\usepackage{mathtools}");
  }

  if (/\\begin\{enumerate\}|\\begin\{itemize\}/.test(content)) {
    packages.push("\\usepackage{enumitem}");
  }

  return packages.join("\n");
}

function buildStandaloneDocument({ subject, dateKey, content }) {
  const subjectName = SUBJECT_NAMES[subject] || subject;
  const packages = detectLatexPackages(content);

  return String.raw`\documentclass[11pt,a4paper]{article}
${packages}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0.55em}

\begin{document}

% Lumina Studio
% Asignatura: ${subjectName}
% Fecha: ${dateKey}

${content}

\end{document}
`;
}

function tectonicBinary() {
  if (process.env.TECTONIC_BIN) {
    return process.env.TECTONIC_BIN;
  }

  const localWindowsBinary = path.resolve(process.cwd(), "tectonic.exe");
  if (existsSync(localWindowsBinary)) {
    return localWindowsBinary;
  }

  const localUnixBinary = path.resolve(process.cwd(), "tectonic");
  if (existsSync(localUnixBinary)) {
    return localUnixBinary;
  }

  return "tectonic";
}

function runProcess(command, args, { cwd, timeoutMs = 120000 } = {}) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    let child;

    try {
      child = spawn(command, args, {
        cwd,
        windowsHide: true,
        env: {
          ...process.env,
          TECTONIC_UNTRUSTED_MODE: "1",
        },
      });
    } catch (error) {
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: error.message || String(error),
        notFound: true,
      });
      return;
    }

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Ya finalizado.
      }

      finish({
        ok: false,
        code: null,
        stdout,
        stderr: "La compilación superó el tiempo máximo permitido.",
        timeout: true,
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 50000) stdout = stdout.slice(-50000);
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 50000) stderr = stderr.slice(-50000);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        ok: false,
        code: null,
        stdout,
        stderr: error.message || String(error),
        notFound: error.code === "ENOENT",
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      finish({
        ok: code === 0,
        code,
        stdout,
        stderr,
      });
    });
  });
}

async function saveNote({ subject, dateKey, content }) {
  assertNotebookKey(subject, dateKey);
  await ensureNotebookDirectories(subject);

  const finalContent = typeof content === "string" ? content : "";
  const filePath = notePath(subject, dateKey);

  await fs.writeFile(filePath, finalContent, "utf8");

  const stat = await fs.stat(filePath);

  return {
    filePath,
    updatedAt: stat.mtime.toISOString(),
  };
}

async function getNotebookIndex() {
  await fs.mkdir(DAILY_NOTES_DIR, { recursive: true });
  const result = [];

  for (const subject of ALLOWED_SUBJECTS) {
    const directory = subjectDirectory(subject);

    try {
      const entries = await fs.readdir(directory, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".tex")) continue;

        const dateKey = entry.name.slice(0, -4);
        if (!DATE_KEY_REGEX.test(dateKey)) continue;

        const filePath = path.join(directory, entry.name);
        const content = await fs.readFile(filePath, "utf8");

        if (!content.trim()) continue;

        const stat = await fs.stat(filePath);

        result.push({
          subject,
          subjectName: SUBJECT_NAMES[subject],
          dateKey,
          updatedAt: stat.mtime.toISOString(),
        });
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  return result.sort((a, b) => {
    const byDate = b.dateKey.localeCompare(a.dateKey);
    if (byDate !== 0) return byDate;
    return a.subject.localeCompare(b.subject);
  });
}

export function registerNotebookRoutes(app) {
  app.get("/api/notebook/health", async (req, res) => {
    const command = tectonicBinary();

    const result = await runProcess(command, ["--version"], {
      cwd: process.cwd(),
      timeoutMs: 5000,
    });

    res.json({
      ok: true,
      tectonic: result.ok,
      binary: command,
      version: result.ok
        ? (result.stdout || result.stderr).trim()
        : null,
    });
  });

  app.get("/api/notebook/index", async (req, res) => {
    try {
      const notes = await getNotebookIndex();

      res.json({
        ok: true,
        notes,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        ok: false,
        error: error.message || "No se pudo leer el índice de apuntes.",
      });
    }
  });

  app.get("/api/notebook/note", async (req, res) => {
    try {
      const subject = String(req.query.subject || "");
      const dateKey = String(req.query.dateKey || "");

      assertNotebookKey(subject, dateKey);
      await ensureNotebookDirectories(subject);

      const filePath = notePath(subject, dateKey);

      let content = "";
      let exists = false;
      let updatedAt = null;

      try {
        content = await fs.readFile(filePath, "utf8");
        const stat = await fs.stat(filePath);
        exists = content.trim().length > 0;
        updatedAt = stat.mtime.toISOString();
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }

      res.json({
        ok: true,
        subject,
        dateKey,
        content,
        exists,
        updatedAt,
        pdfExists: existsSync(pdfPath(subject, dateKey)),
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error.message || "No se pudo abrir la nota.",
      });
    }
  });

  app.put("/api/notebook/note", async (req, res) => {
    try {
      const {
        subject,
        dateKey,
        content = "",
      } = req.body || {};

      const saved = await saveNote({
        subject,
        dateKey,
        content,
      });

      res.json({
        ok: true,
        subject,
        dateKey,
        updatedAt: saved.updatedAt,
      });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        ok: false,
        error: error.message || "No se pudo guardar la nota.",
      });
    }
  });

  app.post("/api/notebook/compile", async (req, res) => {
    try {
      const {
        subject,
        dateKey,
        content = "",
        fast = true,
      } = req.body || {};

      assertNotebookKey(subject, dateKey);

      const saved = await saveNote({
        subject,
        dateKey,
        content,
      });

      await ensureNotebookDirectories(subject);

      const sourcePath = compileSourcePath(subject, dateKey);
      const outputDirectory = buildDirectory(subject);
      const finalPdfPath = pdfPath(subject, dateKey);

      await fs.writeFile(
        sourcePath,
        buildStandaloneDocument({
          subject,
          dateKey,
          content,
        }),
        "utf8"
      );

      const command = tectonicBinary();

      const args = [
        "-X",
        "compile",
        "--untrusted",
        "--outdir",
        outputDirectory,
      ];

      // Para la autocompilación hacemos una sola pasada.
      // El botón de compilación manual puede enviar fast: false.
      if (fast) {
        args.push("--reruns", "0");
      }

      args.push(sourcePath);

      const result = await runProcess(command, args, {
        cwd: subjectDirectory(subject),
        timeoutMs: fast ? 30000 : 120000,
      });

      if (!result.ok) {
        const details = (result.stderr || result.stdout || "").trim();

        return res.status(result.notFound ? 503 : 422).json({
          ok: false,
          error: result.notFound
            ? "Tectonic no está instalado o no se puede encontrar."
            : "LaTeX contiene un error y no se pudo compilar.",
          details: details.slice(-12000),
        });
      }

      // En Windows puede haber un pequeño retraso entre el fin del proceso
      // y la visibilidad del archivo en el sistema de archivos.
      let pdfExists = existsSync(finalPdfPath);

      for (let attempt = 0; !pdfExists && attempt < 10; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        pdfExists = existsSync(finalPdfPath);
      }

      if (!pdfExists) {
        const buildFiles = await fs
          .readdir(outputDirectory)
          .catch(() => []);

        return res.status(500).json({
          ok: false,
          error: "Tectonic terminó sin generar el PDF esperado.",
          details: [
            `PDF esperado: ${finalPdfPath}`,
            `Archivos encontrados en .build: ${buildFiles.join(", ") || "(ninguno)"}`,
            "",
            "Salida de Tectonic:",
            (result.stderr || result.stdout || "(sin salida)").trim(),
          ].join("\n"),
        });
      }

      res.json({
        ok: true,
        subject,
        dateKey,
        fast: Boolean(fast),
        updatedAt: saved.updatedAt,
        pdfUrl: `/api/notebook/pdf?subject=${encodeURIComponent(
          subject
        )}&dateKey=${encodeURIComponent(dateKey)}`,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        error: error.message || "No se pudo compilar la nota.",
      });
    }
  });

  app.get("/api/notebook/pdf", async (req, res) => {
    try {
      const subject = String(req.query.subject || "");
      const dateKey = String(req.query.dateKey || "");

      assertNotebookKey(subject, dateKey);

      const filePath = pdfPath(subject, dateKey);

      let pdfBuffer;

      try {
        pdfBuffer = await fs.readFile(filePath);
      } catch (error) {
        if (error.code === "ENOENT") {
          return res.status(404).json({
            ok: false,
            error: "Todavía no existe un PDF compilado para esta nota.",
          });
        }

        throw error;
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Length", String(pdfBuffer.length));
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.send(pdfBuffer);
    } catch (error) {
      console.error(error);

      res.status(400).json({
        ok: false,
        error: error.message || "No se pudo abrir el PDF.",
      });
    }
  });
}
