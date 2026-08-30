import express from "express";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const PROJECT_ROOT = path.resolve(process.cwd());
const PDF_ROOT = path.join(PROJECT_ROOT, "library", "pdfs");
const CACHE_ROOT = path.join(PROJECT_ROOT, ".lumina", "rag-pdf");
const EXTRACTOR_PATH = path.join(PROJECT_ROOT, "scientific", "extractPdfRag.py");

const DEFAULT_TOP_K = 4;
const DEFAULT_MAX_CONTEXT_CHARS = 4300;
const MAX_PDF_BYTES = 90 * 1024 * 1024;

const STOPWORDS = new Set([
  "a","al","algo","ante","como","con","contra","cual","cuando","de","del",
  "desde","donde","el","ella","ellas","ellos","en","entre","era","es","esa",
  "ese","eso","esta","este","esto","ha","hacia","hasta","hay","la","las",
  "lo","los","mas","me","mi","muy","no","o","para","pero","por","que","se",
  "sin","sobre","son","su","sus","te","tu","un","una","uno","y","ya",
  "amb","aquest","aquesta","aixo","dels","els","i","les","mes","per","sense",
  "an","and","are","as","at","be","by","for","from","how","in","is","it",
  "of","on","or","that","the","this","to","was","what","when","where","which",
  "with"
]);

let memoryCache = {
  signature: "",
  documents: [],
  chunks: [],
  builtAt: null,
};

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
    .filter(
      (token) =>
        token.length >= 2 &&
        token.length <= 48 &&
        !STOPWORDS.has(token)
    );
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

function safeFilename(value = "") {
  const base = path.basename(String(value || "document.pdf"));
  const stem = sanitizePart(base.replace(/\.pdf$/i, ""), "document");
  return `${stem}.pdf`;
}

function getPythonCommand() {
  const configured = String(process.env.LUMINA_PYTHON || "").trim();

  if (configured) {
    return { command: configured, prefixArgs: [] };
  }

  const winVenv = path.join(PROJECT_ROOT, ".venv", "Scripts", "python.exe");
  const posixVenv = path.join(PROJECT_ROOT, ".venv", "bin", "python");

  if (fsSync.existsSync(winVenv)) {
    return { command: winVenv, prefixArgs: [] };
  }

  if (fsSync.existsSync(posixVenv)) {
    return { command: posixVenv, prefixArgs: [] };
  }

  if (process.platform === "win32") {
    return { command: "py", prefixArgs: ["-3"] };
  }

  return { command: "python3", prefixArgs: [] };
}

async function ensureFolders() {
  await fs.mkdir(PDF_ROOT, { recursive: true });
  await fs.mkdir(CACHE_ROOT, { recursive: true });
}

async function walkPdfFiles(directory) {
  const results = [];

  try {
    const entries = await fs.readdir(directory, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue;
        results.push(...(await walkPdfFiles(fullPath)));
      } else if (
        entry.isFile() &&
        entry.name.toLowerCase().endsWith(".pdf")
      ) {
        results.push(fullPath);
      }
    }
  } catch {
    // Carpeta todavía no creada.
  }

  return results;
}

async function fileInfo(filePath) {
  const stat = await fs.stat(filePath);
  const relative = path
    .relative(PDF_ROOT, filePath)
    .split(path.sep)
    .join("/");

  const parts = relative.split("/");

  return {
    filePath,
    relative,
    filename: path.basename(filePath),
    subject: parts.length > 1 ? parts[0] : "",
    size: stat.size,
    mtimeMs: Math.floor(stat.mtimeMs),
  };
}

function cacheKey(info) {
  return crypto
    .createHash("sha1")
    .update(info.relative)
    .digest("hex");
}

function runExtractor(info, cachePath) {
  return new Promise((resolve, reject) => {
    const { command, prefixArgs } = getPythonCommand();

    const child = spawn(
      command,
      [
        ...prefixArgs,
        EXTRACTOR_PATH,
        "--input",
        info.filePath,
        "--output",
        cachePath,
        "--subject",
        info.subject || "",
        "--relative",
        info.relative,
        "--mtime",
        String(info.mtimeMs),
        "--size",
        String(info.size),
      ],
      {
        cwd: PROJECT_ROOT,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `No se pudo iniciar el extractor PDF: ${error.message}`
        )
      );
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() ||
              stdout.trim() ||
              `Extractor PDF terminó con código ${code}`
          )
        );
        return;
      }

      resolve(stdout.trim());
    });
  });
}

async function loadOrExtractPdf(info, force = false) {
  const key = cacheKey(info);
  const cachePath = path.join(CACHE_ROOT, `${key}.json`);

  if (!force && fsSync.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(
        await fs.readFile(cachePath, "utf8")
      );

      if (
        cached?.source?.relative === info.relative &&
        cached?.source?.mtimeMs === info.mtimeMs &&
        cached?.source?.size === info.size
      ) {
        return cached;
      }
    } catch {
      // Cache corrupta: regenerar.
    }
  }

  await runExtractor(info, cachePath);

  return JSON.parse(
    await fs.readFile(cachePath, "utf8")
  );
}

async function computeSignature(infos) {
  return infos
    .map(
      (info) =>
        `${info.relative}:${info.size}:${info.mtimeMs}`
    )
    .sort()
    .join("|");
}

function hydrateChunk(chunk, document) {
  const combined = [
    document.title,
    document.filename,
    chunk.heading || "",
    chunk.text,
  ]
    .filter(Boolean)
    .join("\n");

  const tokens = tokenize(combined);

  return {
    ...chunk,
    documentId: document.id,
    filename: document.filename,
    title: document.title,
    author: document.author,
    subject: document.subject,
    relative: document.relative,
    tokens,
    length: Math.max(tokens.length, 1),
    normalizedText: normalizeText(combined),
  };
}

async function buildPdfIndex({ force = false } = {}) {
  await ensureFolders();

  const files = await walkPdfFiles(PDF_ROOT);
  const infos = [];

  for (const file of files) {
    try {
      infos.push(await fileInfo(file));
    } catch {
      // Ignorar archivo eliminado durante el escaneo.
    }
  }

  const signature = await computeSignature(infos);

  if (
    !force &&
    signature === memoryCache.signature &&
    memoryCache.documents.length
  ) {
    return memoryCache;
  }

  const documents = [];
  const chunks = [];

  for (const info of infos) {
    try {
      const extracted = await loadOrExtractPdf(info, force);

      const document = {
        id: cacheKey(info),
        filename: extracted.filename || info.filename,
        title:
          extracted.metadata?.title ||
          info.filename.replace(/\.pdf$/i, ""),
        author: extracted.metadata?.author || "",
        subject: info.subject,
        relative: info.relative,
        pages: extracted.pages || 0,
        chunks: extracted.chunks?.length || 0,
        textPages: extracted.textPages || 0,
        scannedPages: extracted.scannedPages || 0,
        warning: extracted.warning || "",
      };

      documents.push(document);

      for (const chunk of extracted.chunks || []) {
        const hydrated = hydrateChunk(chunk, document);

        if (hydrated.tokens.length >= 3) {
          chunks.push(hydrated);
        }
      }
    } catch (error) {
      documents.push({
        id: cacheKey(info),
        filename: info.filename,
        title: info.filename.replace(/\.pdf$/i, ""),
        author: "",
        subject: info.subject,
        relative: info.relative,
        pages: 0,
        chunks: 0,
        textPages: 0,
        scannedPages: 0,
        warning: `No se pudo indexar: ${error.message}`,
      });
    }
  }

  memoryCache = {
    signature,
    documents,
    chunks,
    builtAt: new Date().toISOString(),
  };

  return memoryCache;
}

function bm25Search(
  chunks,
  query,
  {
    subject = "",
    topK = DEFAULT_TOP_K,
  } = {}
) {
  const queryTokens = tokenize(query);

  if (!queryTokens.length || !chunks.length) {
    return [];
  }

  let candidates = chunks;

  if (subject) {
    const sameSubject = chunks.filter(
      (chunk) =>
        !chunk.subject ||
        chunk.subject === subject
    );

    if (sameSubject.length) {
      candidates = sameSubject;
    }
  }

  const N = candidates.length;
  const avgLength =
    candidates.reduce(
      (sum, chunk) => sum + chunk.length,
      0
    ) / Math.max(N, 1);

  const documentFrequency = new Map();

  for (const term of new Set(queryTokens)) {
    let count = 0;

    for (const chunk of candidates) {
      if (chunk.tokens.includes(term)) {
        count += 1;
      }
    }

    documentFrequency.set(term, count);
  }

  const k1 = 1.3;
  const b = 0.72;
  const normalizedQuery = normalizeText(query);

  const scored = candidates.map((chunk) => {
    const frequencies = new Map();

    for (const token of chunk.tokens) {
      frequencies.set(
        token,
        (frequencies.get(token) || 0) + 1
      );
    }

    let score = 0;

    for (const term of queryTokens) {
      const tf = frequencies.get(term) || 0;
      if (!tf) continue;

      const df = documentFrequency.get(term) || 0;

      const idf = Math.log(
        1 +
          (N - df + 0.5) /
            (df + 0.5)
      );

      const denominator =
        tf +
        k1 *
          (1 -
            b +
            b *
              (chunk.length /
                Math.max(avgLength, 1)));

      score +=
        idf *
        ((tf * (k1 + 1)) /
          denominator);
    }

    const sourceName = normalizeText(
      `${chunk.filename} ${chunk.title}`
    );

    for (const term of new Set(queryTokens)) {
      if (sourceName.split(/\s+/).includes(term)) {
        score += 0.75;
      }
    }

    const heading = normalizeText(chunk.heading || "");

    for (const term of new Set(queryTokens)) {
      if (heading.split(/\s+/).includes(term)) {
        score += 0.6;
      }
    }

    if (
      normalizedQuery.length >= 12 &&
      chunk.normalizedText.includes(normalizedQuery)
    ) {
      score += 2.5;
    }

    if (
      subject &&
      chunk.subject === subject
    ) {
      score += 0.35;
    }

    return {
      ...chunk,
      score,
    };
  });

  return scored
    .filter((chunk) => chunk.score > 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(
      0,
      Math.max(
        1,
        Math.min(Number(topK) || DEFAULT_TOP_K, 8)
      )
    );
}

function formatPdfContext(
  results,
  maxChars = DEFAULT_MAX_CONTEXT_CHARS
) {
  if (!results.length) return "";

  const blocks = [];
  let total = 0;

  for (const result of results) {
    const sourceLabel = [
      result.title || result.filename,
      result.author ? `autor: ${result.author}` : "",
      `p. ${result.page}`,
      result.heading ? `sección: ${result.heading}` : "",
    ]
      .filter(Boolean)
      .join(" | ");

    const block = `
[FUENTE PDF: ${sourceLabel}]
${result.text}
`.trim();

    if (
      total + block.length > maxChars &&
      blocks.length
    ) {
      break;
    }

    blocks.push(block);
    total += block.length;
  }

  if (!blocks.length) return "";

  return `
[CONTEXTO DE BIBLIOTECA PDF — LUMINA]

Estos fragmentos se han recuperado de libros/PDFs locales porque son relevantes
para la pregunta actual.

Reglas:
- Usa los fragmentos solo cuando aporten información relevante.
- No inventes datos ausentes.
- Cuando una afirmación importante dependa de un PDF, cita la fuente al final
  de la frase usando exactamente este formato:
  [Fuente: Título, p. N]
- No inventes números de página.
- Si los PDFs y los apuntes discrepan, indícalo en vez de reconciliarlos sin aviso.

${blocks.join("\n\n---\n\n")}
`.trim();
}

export async function retrievePdfRagContext({
  query,
  subject = "",
  topK = DEFAULT_TOP_K,
  maxChars = DEFAULT_MAX_CONTEXT_CHARS,
} = {}) {
  const cleanQuery = String(query || "").trim();

  if (cleanQuery.length < 2) return "";

  const index = await buildPdfIndex();

  const results = bm25Search(
    index.chunks,
    cleanQuery,
    {
      subject,
      topK,
    }
  );

  return formatPdfContext(results, maxChars);
}

export async function searchPdfRag({
  query,
  subject = "",
  topK = DEFAULT_TOP_K,
} = {}) {
  const index = await buildPdfIndex();

  const results = bm25Search(
    index.chunks,
    query,
    {
      subject,
      topK,
    }
  );

  return {
    index,
    results,
  };
}

function libraryHtml() {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Lumina · Biblioteca PDF</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;background:#080d19;color:#e5e7eb;font:14px Inter,system-ui,sans-serif}
  main{max-width:1000px;margin:40px auto;padding:0 20px}
  .card{background:#0f172a;border:1px solid #243047;border-radius:18px;padding:20px;margin-bottom:18px}
  h1{font-size:28px;margin:0 0 8px}.muted{color:#94a3b8}
  .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
  input,select,button{border-radius:10px;border:1px solid #334155;background:#111827;color:#e5e7eb;padding:10px 12px}
  input[type=file]{flex:1;min-width:260px} input[type=text]{min-width:180px}
  button{cursor:pointer;background:#22d3ee;color:#082f49;border:0;font-weight:700}
  button.secondary{background:#1e293b;color:#cbd5e1}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{text-align:left;padding:10px;border-bottom:1px solid #1e293b;vertical-align:top}
  code{color:#67e8f9}.warn{color:#fbbf24}.ok{color:#86efac}
</style>
</head>
<body>
<main>
  <div class="card">
    <h1>Biblioteca PDF de Lumina</h1>
    <p class="muted">Añade libros y apuntes PDF. Lumina los indexa localmente y solo envía a Qwen los fragmentos relevantes.</p>
    <div class="row">
      <input id="file" type="file" accept="application/pdf,.pdf" />
      <input id="subject" type="text" placeholder="Asignatura (ej. quantum)" />
      <button id="upload">Añadir PDF</button>
      <button class="secondary" id="reindex">Reindexar</button>
    </div>
    <p id="status" class="muted"></p>
  </div>
  <div class="card">
    <h2>Documentos</h2>
    <table>
      <thead><tr><th>Documento</th><th>Asignatura</th><th>Páginas</th><th>Texto</th><th>Estado</th></tr></thead>
      <tbody id="docs"></tbody>
    </table>
  </div>
</main>
<script>
const statusEl=document.getElementById("status");
const docsEl=document.getElementById("docs");

async function refresh(){
  const r=await fetch("/api/rag/pdf/list");
  const d=await r.json();
  docsEl.innerHTML="";
  for(const doc of d.documents||[]){
    const tr=document.createElement("tr");
    const warning=doc.warning||(
      doc.scannedPages>doc.textPages
        ? "Parte del PDF parece escaneada; no se usa OCR."
        : "OK"
    );
    tr.innerHTML=
      "<td><strong>"+escapeHtml(doc.title||doc.filename)+"</strong><br><span class='muted'>"+escapeHtml(doc.filename)+"</span></td>"+
      "<td>"+escapeHtml(doc.subject||"—")+"</td>"+
      "<td>"+doc.pages+"</td>"+
      "<td>"+doc.textPages+" páginas · "+doc.chunks+" fragmentos</td>"+
      "<td class='"+(warning==="OK"?"ok":"warn")+"'>"+escapeHtml(warning)+"</td>";
    docsEl.appendChild(tr);
  }
}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c]))}

document.getElementById("upload").onclick=async()=>{
  const file=document.getElementById("file").files[0];
  if(!file){statusEl.textContent="Selecciona un PDF.";return}
  statusEl.textContent="Subiendo e indexando...";
  const subject=document.getElementById("subject").value.trim();
  const r=await fetch("/api/rag/pdf/upload",{
    method:"POST",
    headers:{
      "Content-Type":"application/pdf",
      "X-Lumina-Filename":encodeURIComponent(file.name),
      "X-Lumina-Subject":subject
    },
    body:file
  });
  const d=await r.json();
  statusEl.textContent=d.ok?"PDF añadido e indexado.":(d.error||"Error.");
  await refresh();
};
document.getElementById("reindex").onclick=async()=>{
  statusEl.textContent="Reindexando...";
  const r=await fetch("/api/rag/pdf/reindex",{method:"POST"});
  const d=await r.json();
  statusEl.textContent=d.ok?"Índice reconstruido.":(d.error||"Error.");
  await refresh();
};
refresh();
</script>
</body>
</html>`;
}

export function registerPdfRagRoutes(app) {
  app.get("/rag-library", (req, res) => {
    res.type("html").send(libraryHtml());
  });

  app.get("/api/rag/pdf/health", async (req, res) => {
    try {
      const index = await buildPdfIndex();

      res.json({
        ok: true,
        engine: "Lumina PDF RAG",
        version: "2.0",
        documents: index.documents.length,
        chunks: index.chunks.length,
        builtAt: index.builtAt,
        root: PDF_ROOT,
        ocr: false,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "No se pudo iniciar PDF RAG.",
      });
    }
  });

  app.get("/api/rag/pdf/list", async (req, res) => {
    try {
      const index = await buildPdfIndex();

      res.json({
        ok: true,
        documents: index.documents,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error.message,
      });
    }
  });

  app.post(
    "/api/rag/pdf/upload",
    express.raw({
      type: "application/pdf",
      limit: `${Math.floor(MAX_PDF_BYTES / (1024 * 1024))}mb`,
    }),
    async (req, res) => {
      try {
        const body = req.body;

        if (!Buffer.isBuffer(body) || body.length < 5) {
          return res.status(400).json({
            ok: false,
            error: "El cuerpo no contiene un PDF válido.",
          });
        }

        if (!body.subarray(0, 5).toString("ascii").startsWith("%PDF-")) {
          return res.status(400).json({
            ok: false,
            error: "El archivo no parece ser un PDF.",
          });
        }

        const rawHeader = String(
          req.headers["x-lumina-filename"] || "document.pdf"
        );

        let decodedFilename = rawHeader;

        try {
          decodedFilename = decodeURIComponent(rawHeader);
        } catch {
          // Conservar el nombre recibido.
        }

        const filename = safeFilename(decodedFilename);
        const subject = sanitizePart(
          req.headers["x-lumina-subject"] || "",
          "general"
        );

        await ensureFolders();

        const destinationDir = path.join(
          PDF_ROOT,
          subject
        );

        await fs.mkdir(destinationDir, {
          recursive: true,
        });

        const destination = path.join(
          destinationDir,
          filename
        );

        if (fsSync.existsSync(destination)) {
          const stem = filename.replace(/\.pdf$/i, "");
          const unique = `${stem}-${Date.now()}.pdf`;

          await fs.writeFile(
            path.join(destinationDir, unique),
            body
          );
        } else {
          await fs.writeFile(destination, body);
        }

        memoryCache.signature = "";

        const index = await buildPdfIndex();

        res.json({
          ok: true,
          documents: index.documents.length,
          chunks: index.chunks.length,
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error:
            error.message ||
            "No se pudo guardar/indexar el PDF.",
        });
      }
    }
  );

  app.post("/api/rag/pdf/reindex", async (req, res) => {
    try {
      memoryCache = {
        signature: "",
        documents: [],
        chunks: [],
        builtAt: null,
      };

      const index = await buildPdfIndex({
        force: true,
      });

      res.json({
        ok: true,
        documents: index.documents.length,
        chunks: index.chunks.length,
        builtAt: index.builtAt,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "No se pudo reconstruir el índice.",
      });
    }
  });

  app.post("/api/rag/pdf/search", async (req, res) => {
    try {
      const query = String(
        req.body?.query || ""
      ).trim();

      if (!query) {
        return res.status(400).json({
          ok: false,
          error: "Falta query.",
        });
      }

      const { index, results } =
        await searchPdfRag({
          query,
          subject: String(
            req.body?.subject || ""
          ).trim(),
          topK: req.body?.topK,
        });

      res.json({
        ok: true,
        query,
        documents: index.documents.length,
        chunks: index.chunks.length,
        results: results.map(
          (result) => ({
            score: Number(
              result.score.toFixed(4)
            ),
            title: result.title,
            filename: result.filename,
            author: result.author,
            subject: result.subject,
            page: result.page,
            heading: result.heading,
            text: result.text,
          })
        ),
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "No se pudo buscar en los PDFs.",
      });
    }
  });
}
