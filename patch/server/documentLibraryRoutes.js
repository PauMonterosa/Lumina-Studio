// LUMINA_BIBLIOGRAPHY_V1
import express from "express";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const PROJECT_ROOT = path.resolve(process.cwd());
const PDF_ROOT = path.join(PROJECT_ROOT, "library", "pdfs");
const PPTX_ROOT = path.join(PROJECT_ROOT, "library", "presentations");
const CACHE_ROOT = path.join(PROJECT_ROOT, ".lumina", "rag-pptx");
const PREVIEW_ROOT = path.join(PROJECT_ROOT, ".lumina", "library-previews");
const METADATA_PATH = path.join(PROJECT_ROOT, ".lumina", "library-metadata.json");
const EXTRACTOR_PATH = path.join(PROJECT_ROOT, "scientific", "extractPptxLibrary.py");
const PREVIEW_SCRIPT = path.join(PROJECT_ROOT, "scientific", "convertPptxPreview.ps1");

const MAX_DOCUMENT_BYTES = 90 * 1024 * 1024;
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const STOPWORDS = new Set([
  "a","al","algo","ante","como","con","contra","cual","cuando","de","del","desde","donde",
  "el","ella","ellas","ellos","en","entre","era","es","esa","ese","eso","esta","este","esto",
  "ha","hacia","hasta","hay","la","las","lo","los","mas","me","mi","muy","no","o","para",
  "pero","por","que","se","sin","sobre","son","su","sus","te","tu","un","una","uno","y","ya",
  "amb","aquest","aquesta","aixo","dels","els","i","les","mes","per","sense",
  "an","and","are","as","at","be","by","for","from","how","in","is","it","of","on","or",
  "that","the","this","to","was","what","when","where","which","with"
]);

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}+\-*/=.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value = "") {
  return normalizeText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && token.length <= 48 && !STOPWORDS.has(token));
}

function sanitizePart(value = "", fallback = "general") {
  const clean = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return clean || fallback;
}

function decodeHeader(value = "") {
  const raw = String(value || "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function safeFilename(value = "document.pdf", extension = ".pdf") {
  const base = path.basename(decodeHeader(value));
  const ext = path.extname(base).toLowerCase();
  const desiredExt = extension.toLowerCase();
  const stem = sanitizePart(base.slice(0, ext ? -ext.length : undefined), "document");
  return `${stem}${desiredExt}`;
}

function documentId(kind, relative) {
  return crypto.createHash("sha1").update(`${kind}:${relative}`).digest("hex");
}

async function ensureFolders() {
  await Promise.all([
    fs.mkdir(PDF_ROOT, { recursive: true }),
    fs.mkdir(PPTX_ROOT, { recursive: true }),
    fs.mkdir(CACHE_ROOT, { recursive: true }),
    fs.mkdir(PREVIEW_ROOT, { recursive: true }),
    fs.mkdir(path.dirname(METADATA_PATH), { recursive: true }),
  ]);
}

async function readMetadata() {
  await ensureFolders();
  try {
    const parsed = JSON.parse(await fs.readFile(METADATA_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMetadata(metadata) {
  await ensureFolders();
  const tmp = `${METADATA_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(metadata, null, 2), "utf8");
  await fs.rename(tmp, METADATA_PATH);
}

async function walkFiles(root, extension) {
  const results = [];
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".")) results.push(...(await walkFiles(fullPath, extension)));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) {
        results.push(fullPath);
      }
    }
  } catch {
    // Folder may not exist yet.
  }
  return results;
}

function getPythonCommand() {
  const configured = String(process.env.LUMINA_PYTHON || "").trim();
  if (configured) return { command: configured, prefixArgs: [] };

  const winVenv = path.join(PROJECT_ROOT, ".venv", "Scripts", "python.exe");
  const posixVenv = path.join(PROJECT_ROOT, ".venv", "bin", "python");
  if (fsSync.existsSync(winVenv)) return { command: winVenv, prefixArgs: [] };
  if (fsSync.existsSync(posixVenv)) return { command: posixVenv, prefixArgs: [] };
  if (process.platform === "win32") return { command: "py", prefixArgs: ["-3"] };
  return { command: "python3", prefixArgs: [] };
}

function runProcess(command, args, { cwd = PROJECT_ROOT, timeoutMs = 60000 } = {}) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let child;

    try {
      child = spawn(command, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      resolve({ ok: false, stdout, stderr: error.message || String(error), code: null, notFound: true });
      return;
    }

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish({ ok: false, stdout, stderr: "Tiempo máximo superado.", code: null, timeout: true });
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({ ok: false, stdout, stderr: error.message || String(error), code: null, notFound: error.code === "ENOENT" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({ ok: code === 0, stdout, stderr, code });
    });
  });
}

async function pptxInfo(filePath) {
  const stat = await fs.stat(filePath);
  const relative = path.relative(PPTX_ROOT, filePath).split(path.sep).join("/");
  const parts = relative.split("/");
  return {
    kind: "pptx",
    filePath,
    relative,
    filename: path.basename(filePath),
    subject: parts.length > 1 ? parts[0] : "general",
    size: stat.size,
    mtimeMs: Math.floor(stat.mtimeMs),
    id: documentId("pptx", relative),
  };
}

async function pdfInfo(filePath) {
  const stat = await fs.stat(filePath);
  const relative = path.relative(PDF_ROOT, filePath).split(path.sep).join("/");
  const parts = relative.split("/");
  return {
    kind: "pdf",
    filePath,
    relative,
    filename: path.basename(filePath),
    subject: parts.length > 1 ? parts[0] : "general",
    size: stat.size,
    mtimeMs: Math.floor(stat.mtimeMs),
    id: documentId("pdf", relative),
  };
}

function pptxCachePath(info) {
  return path.join(CACHE_ROOT, `${info.id}.json`);
}

function pptxPreviewPath(info) {
  return path.join(PREVIEW_ROOT, `${info.id}.pdf`);
}

async function extractPptx(info, force = false) {
  const cachePath = pptxCachePath(info);
  if (!force && fsSync.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(await fs.readFile(cachePath, "utf8"));
      if (
        cached?.source?.relative === info.relative &&
        cached?.source?.mtimeMs === info.mtimeMs &&
        cached?.source?.size === info.size
      ) {
        return cached;
      }
    } catch {
      // Rebuild corrupt cache.
    }
  }

  const { command, prefixArgs } = getPythonCommand();
  const result = await runProcess(
    command,
    [
      ...prefixArgs,
      EXTRACTOR_PATH,
      "--input", info.filePath,
      "--output", cachePath,
      "--relative", info.relative,
      "--subject", info.subject,
      "--mtime", String(info.mtimeMs),
      "--size", String(info.size),
    ],
    { timeoutMs: 60000 }
  );

  if (!result.ok) {
    throw new Error((result.stderr || result.stdout || "No se pudo extraer el PPTX.").trim());
  }

  return JSON.parse(await fs.readFile(cachePath, "utf8"));
}

async function listDocuments({ subject = "" } = {}) {
  await ensureFolders();
  const metadata = await readMetadata();
  const [pdfFiles, pptxFiles] = await Promise.all([
    walkFiles(PDF_ROOT, ".pdf"),
    walkFiles(PPTX_ROOT, ".pptx"),
  ]);

  const documents = [];

  for (const filePath of pdfFiles) {
    try {
      const info = await pdfInfo(filePath);
      if (subject && info.subject !== subject) continue;
      const meta = metadata[`pdf:${info.relative}`] || {};
      documents.push({
        id: info.id,
        kind: "pdf",
        filename: info.filename,
        title: meta.title || info.filename.replace(/\.pdf$/i, ""),
        author: meta.author || "",
        category: meta.category || "book",
        subject: info.subject,
        relative: info.relative,
        size: info.size,
        slideCount: 0,
        previewAvailable: true,
        ragReady: true,
        warning: "",
      });
    } catch {}
  }

  for (const filePath of pptxFiles) {
    try {
      const info = await pptxInfo(filePath);
      if (subject && info.subject !== subject) continue;
      const meta = metadata[`pptx:${info.relative}`] || {};
      let extracted = null;
      let warning = "";
      try {
        extracted = await extractPptx(info);
      } catch (error) {
        warning = error.message || "No se pudo indexar la presentación.";
      }
      documents.push({
        id: info.id,
        kind: "pptx",
        filename: info.filename,
        title: meta.title || extracted?.title || info.filename.replace(/\.pptx$/i, ""),
        author: meta.author || "",
        category: meta.category || "slides",
        subject: info.subject,
        relative: info.relative,
        size: info.size,
        slideCount: extracted?.slideCount || 0,
        previewAvailable: fsSync.existsSync(pptxPreviewPath(info)),
        ragReady: Boolean(extracted?.chunks?.length),
        warning: warning || extracted?.warning || "",
      });
    } catch {}
  }

  return documents.sort((a, b) => {
    if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.title.localeCompare(b.title);
  });
}

async function findDocument(id) {
  if (!id) return null;
  const [pdfFiles, pptxFiles] = await Promise.all([
    walkFiles(PDF_ROOT, ".pdf"),
    walkFiles(PPTX_ROOT, ".pptx"),
  ]);
  for (const filePath of pdfFiles) {
    try {
      const info = await pdfInfo(filePath);
      if (info.id === id) return info;
    } catch {}
  }
  for (const filePath of pptxFiles) {
    try {
      const info = await pptxInfo(filePath);
      if (info.id === id) return info;
    } catch {}
  }
  return null;
}

async function uniqueDestination(dir, filename) {
  let destination = path.join(dir, filename);
  if (!fsSync.existsSync(destination)) return destination;
  const ext = path.extname(filename);
  const stem = filename.slice(0, -ext.length);
  destination = path.join(dir, `${stem}-${Date.now()}${ext}`);
  return destination;
}

async function buildPptxSearchIndex(subject = "") {
  const files = await walkFiles(PPTX_ROOT, ".pptx");
  const chunks = [];
  for (const filePath of files) {
    try {
      const info = await pptxInfo(filePath);
      if (subject && info.subject !== subject) continue;
      const extracted = await extractPptx(info);
      for (const chunk of extracted.chunks || []) {
        const combined = `${extracted.title || info.filename}\n${chunk.heading || ""}\n${chunk.text || ""}`;
        chunks.push({
          score: 0,
          title: extracted.title || info.filename.replace(/\.pptx$/i, ""),
          filename: info.filename,
          subject: info.subject,
          relative: info.relative,
          slide: chunk.slide || null,
          heading: chunk.heading || "",
          text: chunk.text || "",
          tokens: tokenize(combined),
          normalizedText: normalizeText(combined),
        });
      }
    } catch {
      // One bad presentation must not break the whole library.
    }
  }
  return chunks;
}

export async function searchPptxRag({ query, subject = "", topK = 5 } = {}) {
  const cleanQuery = String(query || "").trim();
  if (cleanQuery.length < 2) return [];
  const queryTokens = tokenize(cleanQuery);
  if (!queryTokens.length) return [];
  const normalizedQuery = normalizeText(cleanQuery);
  const chunks = await buildPptxSearchIndex(subject);

  const scored = chunks.map((chunk) => {
    const frequencies = new Map();
    for (const token of chunk.tokens) frequencies.set(token, (frequencies.get(token) || 0) + 1);
    let score = 0;
    for (const term of queryTokens) {
      const tf = frequencies.get(term) || 0;
      if (tf) score += 1 + Math.log1p(tf);
      if (normalizeText(`${chunk.title} ${chunk.heading}`).includes(term)) score += 0.75;
    }
    if (normalizedQuery.length >= 10 && chunk.normalizedText.includes(normalizedQuery)) score += 2.5;
    return { ...chunk, score };
  });

  return scored
    .filter((item) => item.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(Number(topK) || 5, 8)));
}

export async function retrievePptxRagContext({ query, subject = "", topK = 5, maxChars = 4800 } = {}) {
  const results = await searchPptxRag({ query, subject, topK });
  if (!results.length) return "";
  const blocks = [];
  let total = 0;
  for (const result of results) {
    const block = `[PRESENTACIÓN: ${result.title} | diap. ${result.slide}${result.heading ? ` | ${result.heading}` : ""}]\n${result.text}`;
    if (total + block.length > maxChars && blocks.length) break;
    blocks.push(block);
    total += block.length;
  }
  return `
[CONTEXTO DE PRESENTACIONES — LUMINA]

Lumina ha recuperado fragmentos de PowerPoints/PPTX de la bibliografía de la asignatura.
Reglas:
- Úsalos solo cuando sean relevantes para la pregunta.
- No inventes contenido ausente.
- Si una afirmación depende de una presentación, cita: [Fuente: Título, diap. N].
- Si las diapositivas contradicen un libro o los apuntes, indícalo.

${blocks.join("\n\n---\n\n")}
`.trim();
}

export async function getActiveReferenceContext({ activeReference, subject = "" } = {}) {
  const id = String(activeReference?.id || "").trim();
  if (!id) return "";
  const info = await findDocument(id);
  if (!info || (subject && info.subject !== subject)) return "";

  const metadata = await readMetadata();
  const meta = metadata[`${info.kind}:${info.relative}`] || {};
  const title = meta.title || info.filename.replace(/\.(pdf|pptx)$/i, "");

  if (info.kind === "pdf") {
    const page = Number(activeReference?.page || 0) || null;
    return `
[REFERENCIA ACTIVA EN LUMINA]
El usuario tiene abierto el PDF "${title}"${page ? ` en la página ${page}` : ""}.
Trátalo como la referencia visual activa. El contenido textual relevante del PDF puede aparecer también en el contexto RAG de libros/PDFs.
`.trim();
  }

  try {
    const extracted = await extractPptx(info);
    const selected = Math.max(1, Math.min(Number(activeReference?.slide || 1), extracted.slideCount || 1));
    const slides = (extracted.slides || []).filter((slide) => Math.abs(slide.number - selected) <= 1);
    const body = slides.map((slide) => {
      const marker = slide.number === selected ? "ACTIVA" : "CONTEXTO";
      return `[${marker} · diap. ${slide.number}: ${slide.title}]\n${slide.text || ""}${slide.notes ? `\nNotas del profesor:\n${slide.notes}` : ""}`;
    }).join("\n\n---\n\n");
    return `
[REFERENCIA ACTIVA EN LUMINA]
El usuario está viendo "${title}", diapositiva ${selected}. Prioriza la diapositiva activa y usa las adyacentes solo para contexto.
Si citas este material usa: [Fuente: ${title}, diap. N].

${body}
`.trim();
  } catch {
    return `El usuario tiene abierta la presentación "${title}", pero Lumina no pudo extraer su texto.`;
  }
}

async function generatePptxPreview(info) {
  if (info.kind !== "pptx") throw new Error("La vista previa de PowerPoint solo aplica a PPTX.");
  if (process.platform !== "win32") {
    throw new Error("La vista previa visual automática de PPTX requiere Windows + Microsoft PowerPoint. El visor textual sigue disponible.");
  }
  const output = pptxPreviewPath(info);
  const result = await runProcess(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", PREVIEW_SCRIPT,
      "-InputPath", info.filePath,
      "-OutputPath", output,
    ],
    { timeoutMs: 45000 }
  );
  if (!result.ok || !fsSync.existsSync(output)) {
    throw new Error((result.stderr || result.stdout || "No se pudo generar la vista previa con PowerPoint.").trim());
  }
  return output;
}

export function registerDocumentLibraryRoutes(app) {
  app.get("/api/library/health", async (req, res) => {
    try {
      const documents = await listDocuments();
      res.json({ ok: true, version: "1.0", documents: documents.length, pptxSupport: true, pdfSupport: true });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message || "Biblioteca no disponible." });
    }
  });

  app.get("/api/library/documents", async (req, res) => {
    try {
      const subject = String(req.query.subject || "").trim();
      const documents = await listDocuments({ subject });
      res.json({ ok: true, documents });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message || "No se pudo leer la bibliografía." });
    }
  });

  app.post(
    "/api/library/upload",
    express.raw({ type: () => true, limit: `${Math.floor(MAX_DOCUMENT_BYTES / (1024 * 1024))}mb` }),
    async (req, res) => {
      try {
        const body = req.body;
        if (!Buffer.isBuffer(body) || body.length < 5) {
          return res.status(400).json({ ok: false, error: "Archivo vacío o no válido." });
        }

        const rawFilename = req.headers["x-lumina-filename"] || "document";
        const originalName = decodeHeader(rawFilename);
        const ext = path.extname(originalName).toLowerCase();
        const subject = sanitizePart(req.headers["x-lumina-subject"] || "", "general");
        const title = decodeHeader(req.headers["x-lumina-title"] || "").trim();
        const author = decodeHeader(req.headers["x-lumina-author"] || "").trim();
        let category = sanitizePart(req.headers["x-lumina-category"] || "", "book");

        let kind;
        let root;
        let filename;

        if (ext === ".pdf") {
          if (!body.subarray(0, 5).toString("ascii").startsWith("%PDF-")) {
            return res.status(400).json({ ok: false, error: "El archivo no parece ser un PDF válido." });
          }
          kind = "pdf";
          root = PDF_ROOT;
          filename = safeFilename(originalName, ".pdf");
        } else if (ext === ".pptx") {
          if (body[0] !== 0x50 || body[1] !== 0x4b) {
            return res.status(400).json({ ok: false, error: "El archivo no parece ser un PPTX válido." });
          }
          kind = "pptx";
          root = PPTX_ROOT;
          filename = safeFilename(originalName, ".pptx");
          category = "slides";
        } else {
          return res.status(400).json({ ok: false, error: "Lumina Bibliografía V1 acepta PDF y PPTX." });
        }

        await ensureFolders();
        const destinationDir = path.join(root, subject);
        await fs.mkdir(destinationDir, { recursive: true });
        const destination = await uniqueDestination(destinationDir, filename);
        await fs.writeFile(destination, body);

        const relative = path.relative(root, destination).split(path.sep).join("/");
        const metadata = await readMetadata();
        metadata[`${kind}:${relative}`] = {
          title,
          author,
          category,
          uploadedAt: new Date().toISOString(),
        };
        await writeMetadata(metadata);

        let warning = "";
        if (kind === "pptx") {
          try {
            await extractPptx(await pptxInfo(destination), true);
          } catch (error) {
            warning = error.message || "PPTX guardado, pero no indexado.";
          }
        }

        const documents = await listDocuments({ subject });
        const saved = documents.find((doc) => doc.relative === relative && doc.kind === kind) || null;
        res.json({ ok: true, document: saved, warning });
      } catch (error) {
        res.status(500).json({ ok: false, error: error.message || "No se pudo guardar el documento." });
      }
    }
  );

  app.get("/api/library/file/:id", async (req, res) => {
    const info = await findDocument(String(req.params.id || ""));
    if (!info) return res.status(404).json({ ok: false, error: "Documento no encontrado." });
    res.setHeader("Cache-Control", "no-store");
    if (info.kind === "pdf") res.type("application/pdf");
    else res.type(PPTX_MIME);
    res.sendFile(info.filePath);
  });

  app.get("/api/library/pptx/:id/slides", async (req, res) => {
    try {
      const info = await findDocument(String(req.params.id || ""));
      if (!info || info.kind !== "pptx") {
        return res.status(404).json({ ok: false, error: "Presentación no encontrada." });
      }
      const extracted = await extractPptx(info);
      res.json({
        ok: true,
        id: info.id,
        title: extracted.title || info.filename,
        slideCount: extracted.slideCount || 0,
        slides: extracted.slides || [],
        previewAvailable: fsSync.existsSync(pptxPreviewPath(info)),
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message || "No se pudo leer la presentación." });
    }
  });

  app.get("/api/library/preview/:id", async (req, res) => {
    const info = await findDocument(String(req.params.id || ""));
    if (!info || info.kind !== "pptx") return res.status(404).end();
    const preview = pptxPreviewPath(info);
    if (!fsSync.existsSync(preview)) return res.status(404).json({ ok: false, error: "La vista previa todavía no existe." });
    res.type("application/pdf");
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(preview);
  });

  app.post("/api/library/preview/:id", async (req, res) => {
    try {
      const info = await findDocument(String(req.params.id || ""));
      if (!info || info.kind !== "pptx") {
        return res.status(404).json({ ok: false, error: "Presentación no encontrada." });
      }
      await generatePptxPreview(info);
      res.json({ ok: true, previewUrl: `/api/library/preview/${info.id}` });
    } catch (error) {
      res.status(422).json({ ok: false, error: error.message || "No se pudo generar la vista previa." });
    }
  });

  app.delete("/api/library/document/:id", async (req, res) => {
    try {
      const info = await findDocument(String(req.params.id || ""));
      if (!info) return res.status(404).json({ ok: false, error: "Documento no encontrado." });
      await fs.unlink(info.filePath).catch(() => {});
      if (info.kind === "pptx") {
        await fs.unlink(pptxCachePath(info)).catch(() => {});
        await fs.unlink(pptxPreviewPath(info)).catch(() => {});
      }
      const metadata = await readMetadata();
      delete metadata[`${info.kind}:${info.relative}`];
      await writeMetadata(metadata);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message || "No se pudo eliminar el documento." });
    }
  });

  app.post("/api/library/pptx/search", async (req, res) => {
    try {
      const query = String(req.body?.query || "").trim();
      if (!query) return res.status(400).json({ ok: false, error: "Falta query." });
      const results = await searchPptxRag({
        query,
        subject: String(req.body?.subject || "").trim(),
        topK: req.body?.topK,
      });
      res.json({ ok: true, results });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message || "No se pudo buscar en las presentaciones." });
    }
  });
}
