import fs from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = path.resolve(process.cwd());
const NOTES_ROOT = path.join(PROJECT_ROOT, "notes");

const DEFAULT_TOP_K = 6;
const DEFAULT_MAX_CONTEXT_CHARS = 9000;
const MAX_CHUNK_CHARS = 1500;
const CHUNK_OVERLAP_CHARS = 220;

const STOPWORDS = new Set([
  // Castellano
  "a","al","algo","ante","como","con","contra","cual","cuando","de","del",
  "desde","donde","el","ella","ellas","ellos","en","entre","era","es","esa",
  "ese","eso","esta","este","esto","ha","hacia","hasta","hay","la","las",
  "lo","los","mas","me","mi","muy","no","o","para","pero","por","que","se",
  "sin","sobre","son","su","sus","te","tu","un","una","uno","y","ya",
  // Català
  "a","al","amb","aquest","aquesta","aixo","com","d","de","del","dels",
  "el","els","en","es","i","la","les","mes","no","o","per","pero","que",
  "sense","sobre","un","una",
  // English
  "a","an","and","are","as","at","be","by","for","from","how","in","is",
  "it","of","on","or","that","the","this","to","was","what","when","where",
  "which","with"
]);

let cache = {
  signature: "",
  chunks: [],
  files: 0,
  builtAt: null,
};

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\\([a-zA-Z]+)\*?/g, " $1 ")
    .replace(/[{}[\]$^_&%#~]/g, " ")
    .replace(/[^\p{L}\p{N}+\-*/=.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLatexComments(value = "") {
  return String(value)
    .split(/\r?\n/)
    .map((line) => {
      let escaped = false;

      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];

        if (char === "\\" && !escaped) {
          escaped = true;
          continue;
        }

        if (char === "%" && !escaped) {
          return line.slice(0, i);
        }

        escaped = false;
      }

      return line;
    })
    .join("\n");
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

function getSectionTitle(text = "") {
  const matches = [
    ...String(text).matchAll(
      /\\(?:section|subsection|subsubsection|paragraph)\*?\{([^}]*)\}/g
    ),
  ];

  return matches.at(-1)?.[1]?.trim() || "";
}

function splitLongBlock(text, metadata) {
  const clean = String(text || "").trim();
  if (!clean) return [];

  if (clean.length <= MAX_CHUNK_CHARS) {
    return [
      {
        ...metadata,
        text: clean,
        heading: metadata.heading || getSectionTitle(clean),
      },
    ];
  }

  const chunks = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(start + MAX_CHUNK_CHARS, clean.length);

    if (end < clean.length) {
      const paragraphBreak = clean.lastIndexOf("\n\n", end);
      const lineBreak = clean.lastIndexOf("\n", end);
      const spaceBreak = clean.lastIndexOf(" ", end);

      const candidate = Math.max(
        paragraphBreak,
        lineBreak,
        spaceBreak
      );

      if (candidate > start + 650) {
        end = candidate;
      }
    }

    const piece = clean.slice(start, end).trim();

    if (piece) {
      chunks.push({
        ...metadata,
        text: piece,
        heading:
          metadata.heading ||
          getSectionTitle(piece),
      });
    }

    if (end >= clean.length) break;

    start = Math.max(
      end - CHUNK_OVERLAP_CHARS,
      start + 1
    );
  }

  return chunks;
}

function chunkLatex(content, metadata) {
  const clean = stripLatexComments(content);
  const lines = clean.split(/\r?\n/);

  const chunks = [];
  let current = [];
  let currentHeading = "";

  const flush = () => {
    const block = current.join("\n").trim();

    if (block) {
      chunks.push(
        ...splitLongBlock(block, {
          ...metadata,
          heading: currentHeading,
        })
      );
    }

    current = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(
      /\\(?:section|subsection|subsubsection)\*?\{([^}]*)\}/
    );

    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
      current.push(line);
      continue;
    }

    current.push(line);

    const charCount = current.join("\n").length;

    if (
      charCount >= 1050 &&
      line.trim() === ""
    ) {
      flush();
    }
  }

  flush();
  return chunks;
}

async function walkTexFiles(directory) {
  const results = [];

  try {
    const entries = await fs.readdir(directory, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const fullPath = path.join(
        directory,
        entry.name
      );

      if (entry.isDirectory()) {
        if (
          entry.name === ".build" ||
          entry.name === "media" ||
          entry.name.startsWith(".")
        ) {
          continue;
        }

        results.push(
          ...(await walkTexFiles(fullPath))
        );
      } else if (
        entry.isFile() &&
        entry.name.toLowerCase().endsWith(".tex")
      ) {
        results.push(fullPath);
      }
    }
  } catch {
    // Carpeta inexistente o inaccesible: simplemente no aporta documentos.
  }

  return results;
}

function inferMetadata(filePath) {
  const relative = path
    .relative(PROJECT_ROOT, filePath)
    .split(path.sep)
    .join("/");

  const parts = relative.split("/");

  let subject = "";
  let dateKey = "";

  const dailyIndex = parts.indexOf("daily");

  if (dailyIndex >= 0) {
    subject = parts[dailyIndex + 1] || "";
    dateKey =
      path.basename(filePath, ".tex").match(
        /^\d{4}-\d{2}-\d{2}$/
      )?.[0] || "";
  }

  const subjectsIndex = parts.indexOf("subjects");

  if (!subject && subjectsIndex >= 0) {
    subject = path.basename(filePath, ".tex");
  }

  return {
    filePath,
    relativePath: relative,
    subject,
    dateKey,
  };
}

async function computeSignature(files) {
  const items = [];

  for (const file of files) {
    try {
      const stat = await fs.stat(file);

      items.push(
        `${file}:${stat.size}:${Math.floor(
          stat.mtimeMs
        )}`
      );
    } catch {
      // Ignorar archivos eliminados durante el escaneo.
    }
  }

  return items.sort().join("|");
}

async function buildIndexIfNeeded() {
  const files = await walkTexFiles(NOTES_ROOT);
  const signature = await computeSignature(files);

  if (
    signature &&
    signature === cache.signature &&
    cache.chunks.length
  ) {
    return cache;
  }

  const chunks = [];

  for (const file of files) {
    try {
      const content = await fs.readFile(
        file,
        "utf8"
      );

      const metadata = inferMetadata(file);

      for (const chunk of chunkLatex(
        content,
        metadata
      )) {
        const tokens = tokenize(
          `${chunk.heading || ""}\n${chunk.text}`
        );

        if (tokens.length < 3) continue;

        chunks.push({
          ...chunk,
          tokens,
          length: tokens.length,
          normalizedText: normalizeText(
            `${chunk.heading || ""}\n${chunk.text}`
          ),
        });
      }
    } catch {
      // Un archivo corrupto no debe romper todo el índice.
    }
  }

  cache = {
    signature,
    chunks,
    files: files.length,
    builtAt: new Date().toISOString(),
  };

  return cache;
}

function bm25Search(
  chunks,
  query,
  {
    subject = "",
    selectedDateKey = "",
    topK = DEFAULT_TOP_K,
  } = {}
) {
  const queryTokens = tokenize(query);

  if (!queryTokens.length || !chunks.length) {
    return [];
  }

  let candidates = chunks;

  if (subject) {
    const subjectMatches = chunks.filter(
      (chunk) => chunk.subject === subject
    );

    if (subjectMatches.length) {
      candidates = subjectMatches;
    }
  }

  const N = candidates.length;
  const averageLength =
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

  const normalizedQuery = normalizeText(query);
  const k1 = 1.35;
  const b = 0.72;

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

      const df =
        documentFrequency.get(term) || 0;

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
                Math.max(
                  averageLength,
                  1
                )));

      score +=
        idf *
        ((tf * (k1 + 1)) /
          denominator);
    }

    const headingNormalized = normalizeText(
      chunk.heading || ""
    );

    for (const term of new Set(queryTokens)) {
      if (
        headingNormalized
          .split(/\s+/)
          .includes(term)
      ) {
        score += 0.9;
      }
    }

    if (
      normalizedQuery.length >= 10 &&
      chunk.normalizedText.includes(
        normalizedQuery
      )
    ) {
      score += 3.5;
    }

    if (
      selectedDateKey &&
      chunk.dateKey === selectedDateKey
    ) {
      score += 0.8;
    }

    return {
      ...chunk,
      score,
    };
  });

  return scored
    .filter((chunk) => chunk.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(
      0,
      Math.max(
        1,
        Math.min(Number(topK) || DEFAULT_TOP_K, 10)
      )
    );
}

function formatRagContext(
  results,
  maxChars = DEFAULT_MAX_CONTEXT_CHARS
) {
  if (!results.length) return "";

  const blocks = [];
  let total = 0;

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];

    const headerParts = [
      `fragmento ${index + 1}`,
      result.relativePath,
      result.heading
        ? `sección: ${result.heading}`
        : "",
      result.dateKey
        ? `fecha: ${result.dateKey}`
        : "",
    ].filter(Boolean);

    const block = `
[${headerParts.join(" | ")}]
${result.text}
`.trim();

    if (
      total + block.length >
        maxChars &&
      blocks.length
    ) {
      break;
    }

    blocks.push(block);
    total += block.length;
  }

  if (!blocks.length) return "";

  return `
[CONTEXTO RAG LOCAL DE LUMINA]

Los siguientes fragmentos han sido recuperados automáticamente de los apuntes
porque son los más relacionados con la pregunta actual.

Reglas:
- Úsalos solo cuando sean relevantes para la pregunta.
- No inventes contenido que no aparezca en ellos.
- Si dos fragmentos parecen contradictorios, indícalo.
- La ruta y la fecha son metadatos; no forman parte del contenido académico.

${blocks.join("\n\n---\n\n")}
`.trim();
}

export async function retrieveRagContext({
  query,
  subject = "",
  selectedDateKey = "",
  topK = DEFAULT_TOP_K,
  maxChars = DEFAULT_MAX_CONTEXT_CHARS,
} = {}) {
  const cleanQuery = String(query || "").trim();

  if (cleanQuery.length < 2) {
    return "";
  }

  const index = await buildIndexIfNeeded();

  const results = bm25Search(
    index.chunks,
    cleanQuery,
    {
      subject,
      selectedDateKey,
      topK,
    }
  );

  return formatRagContext(
    results,
    maxChars
  );
}

export async function searchRag({
  query,
  subject = "",
  selectedDateKey = "",
  topK = DEFAULT_TOP_K,
} = {}) {
  const index = await buildIndexIfNeeded();

  const results = bm25Search(
    index.chunks,
    query,
    {
      subject,
      selectedDateKey,
      topK,
    }
  );

  return {
    index,
    results,
  };
}

export function registerRagRoutes(app) {
  app.get("/api/rag/health", async (req, res) => {
    try {
      const index =
        await buildIndexIfNeeded();

      res.json({
        ok: true,
        engine: "Lumina RAG Lite",
        version: "1.0",
        mode: "BM25 local",
        files: index.files,
        chunks: index.chunks.length,
        builtAt: index.builtAt,
        extraModelRequired: false,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "No se pudo construir el índice RAG.",
      });
    }
  });

  app.post("/api/rag/search", async (req, res) => {
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
        await searchRag({
          query,
          subject:
            String(
              req.body?.subject || ""
            ).trim(),
          selectedDateKey:
            String(
              req.body?.selectedDateKey ||
                ""
            ).trim(),
          topK: req.body?.topK,
        });

      res.json({
        ok: true,
        query,
        files: index.files,
        chunks: index.chunks.length,
        results: results.map(
          (result) => ({
            score: Number(
              result.score.toFixed(4)
            ),
            subject: result.subject,
            dateKey: result.dateKey,
            heading: result.heading,
            source: result.relativePath,
            text: result.text,
          })
        ),
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "No se pudo buscar en los apuntes.",
      });
    }
  });
}
