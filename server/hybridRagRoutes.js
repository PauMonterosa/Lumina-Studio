import { searchRag } from "./ragRoutes.js";
import { searchPdfRag } from "./pdfRagRoutes.js";

const OLLAMA_EMBED_URL =
  process.env.LUMINA_EMBED_URL ||
  "http://localhost:11434/api/embed";

const EMBED_MODEL =
  process.env.LUMINA_EMBED_MODEL ||
  "embeddinggemma:300m-qat-q4_0";

const DEFAULT_TOP_K = 6;
const DEFAULT_MAX_CONTEXT_CHARS = 7200;
const MAX_CANDIDATES = 14;
const EMBED_DIMENSIONS = 256;

function compactText(value = "", max = 1350) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= max) return text;
  return text.slice(0, max) + " …";
}

function candidateKey(candidate) {
  return [
    candidate.kind,
    candidate.source || "",
    candidate.page || "",
    compactText(candidate.text, 180),
  ].join("|");
}

function normalizeCandidates(noteResults = [], pdfResults = []) {
  const candidates = [];

  for (const item of noteResults) {
    candidates.push({
      kind: "notes",
      lexicalScore: Number(item.score || 0),
      source: item.relativePath || "",
      title:
        item.heading ||
        item.relativePath ||
        "Apuntes",
      heading: item.heading || "",
      subject: item.subject || "",
      dateKey: item.dateKey || "",
      page: null,
      author: "",
      text: item.text || "",
    });
  }

  for (const item of pdfResults) {
    candidates.push({
      kind: "pdf",
      lexicalScore: Number(item.score || 0),
      source: item.relative || item.filename || "",
      title:
        item.title ||
        item.filename ||
        "PDF",
      heading: item.heading || "",
      subject: item.subject || "",
      dateKey: "",
      page: item.page || null,
      author: item.author || "",
      text: item.text || "",
    });
  }

  const unique = new Map();

  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    const current = unique.get(key);

    if (
      !current ||
      candidate.lexicalScore >
        current.lexicalScore
    ) {
      unique.set(key, candidate);
    }
  }

  return [...unique.values()]
    .sort(
      (a, b) =>
        b.lexicalScore -
        a.lexicalScore
    )
    .slice(0, MAX_CANDIDATES);
}

function embeddingInput(candidate) {
  const metadata = [
    candidate.title,
    candidate.heading,
    candidate.author,
    candidate.source,
  ]
    .filter(Boolean)
    .join(" | ");

  return compactText(
    `${metadata}\n${candidate.text}`,
    1750
  );
}

function dot(a, b) {
  const length = Math.min(a.length, b.length);
  let total = 0;

  for (let i = 0; i < length; i += 1) {
    total += a[i] * b[i];
  }

  return total;
}

async function embedBatch(texts) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    14000
  );

  try {
    const response = await fetch(
      OLLAMA_EMBED_URL,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: EMBED_MODEL,
          input: texts,
          truncate: true,
          dimensions: EMBED_DIMENSIONS,

          // ECO: libera el modelo inmediatamente.
          keep_alive: 0,
        }),
      }
    );

    if (!response.ok) {
      const raw = await response
        .text()
        .catch(() => "");

      throw new Error(
        `Ollama embeddings HTTP ${
          response.status
        }${raw ? ` · ${raw.slice(0, 160)}` : ""}`
      );
    }

    const data = await response.json();

    if (
      !Array.isArray(data.embeddings) ||
      data.embeddings.length !== texts.length
    ) {
      throw new Error(
        "Ollama no devolvió todos los embeddings."
      );
    }

    return {
      embeddings: data.embeddings,
      model: data.model || EMBED_MODEL,
      totalDuration:
        data.total_duration || 0,
      loadDuration:
        data.load_duration || 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function lexicalNorm(score, maxScore) {
  if (!maxScore || maxScore <= 0) return 0;
  return Math.min(1, score / maxScore);
}

async function semanticRerank(query, candidates) {
  if (!candidates.length) {
    return {
      mode: "empty",
      model: null,
      results: [],
    };
  }

  const texts = [
    compactText(query, 1300),
    ...candidates.map(embeddingInput),
  ];

  try {
    const embedded = await embedBatch(texts);
    const queryVector = embedded.embeddings[0];
    const candidateVectors =
      embedded.embeddings.slice(1);

    const maxLexical = Math.max(
      ...candidates.map(
        (candidate) =>
          candidate.lexicalScore
      ),
      0.0001
    );

    const results = candidates.map(
      (candidate, index) => {
        const semanticScore = Math.max(
          -1,
          Math.min(
            1,
            dot(
              queryVector,
              candidateVectors[index]
            )
          )
        );

        const lexicalScore = lexicalNorm(
          candidate.lexicalScore,
          maxLexical
        );

        // Scientific text needs both exact terms and semantic similarity.
        let hybridScore =
          0.44 * lexicalScore +
          0.56 *
            Math.max(0, semanticScore);

        // Slight preference for personal notes on a tie.
        if (candidate.kind === "notes") {
          hybridScore += 0.025;
        }

        return {
          ...candidate,
          semanticScore,
          lexicalNormalized:
            lexicalScore,
          hybridScore,
        };
      }
    );

    return {
      mode: "hybrid",
      model: embedded.model,
      totalDuration:
        embedded.totalDuration,
      loadDuration:
        embedded.loadDuration,
      results: results.sort(
        (a, b) =>
          b.hybridScore -
          a.hybridScore
      ),
    };
  } catch (error) {
    const maxLexical = Math.max(
      ...candidates.map(
        (candidate) =>
          candidate.lexicalScore
      ),
      0.0001
    );

    return {
      mode: "lexical-fallback",
      model: null,
      warning:
        error.message ||
        "Embeddings no disponibles.",
      results: candidates.map(
        (candidate) => ({
          ...candidate,
          semanticScore: null,
          lexicalNormalized:
            lexicalNorm(
              candidate.lexicalScore,
              maxLexical
            ),
          hybridScore:
            lexicalNorm(
              candidate.lexicalScore,
              maxLexical
            ),
        })
      ),
    };
  }
}

function formatSource(candidate) {
  if (candidate.kind === "pdf") {
    return [
      candidate.title,
      candidate.author
        ? `autor: ${candidate.author}`
        : "",
      candidate.page
        ? `p. ${candidate.page}`
        : "",
      candidate.heading
        ? `sección: ${candidate.heading}`
        : "",
    ]
      .filter(Boolean)
      .join(" | ");
  }

  return [
    candidate.source || "Apuntes",
    candidate.heading
      ? `sección: ${candidate.heading}`
      : "",
    candidate.dateKey
      ? `fecha: ${candidate.dateKey}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

function formatHybridContext(
  results,
  maxChars =
    DEFAULT_MAX_CONTEXT_CHARS
) {
  if (!results.length) return "";

  const blocks = [];
  let total = 0;

  for (
    let index = 0;
    index < results.length;
    index += 1
  ) {
    const result = results[index];

    const label =
      result.kind === "pdf"
        ? "LIBRO/PDF"
        : "APUNTES";

    const block = `
[${label} ${index + 1}: ${formatSource(
      result
    )}]
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
[CONTEXTO HÍBRIDO RAG — LUMINA]

Lumina ha combinado búsqueda lexical y semántica para recuperar los fragmentos
más relacionados con la pregunta actual.

Reglas:
- Prioriza estos fragmentos cuando sean relevantes.
- No inventes información ausente.
- Los apuntes personales y los libros son fuentes distintas; no mezcles sus
  afirmaciones como si provinieran del mismo documento.
- Para información tomada de un PDF, cita:
  [Fuente: Título, p. N]
- Para información tomada de los apuntes, puedes indicar:
  [Apuntes: sección o fecha]
  cuando ayude a localizarla.
- Si una fuente contradice otra, indícalo.
- No menciones puntuaciones BM25 ni embeddings al usuario.

${blocks.join("\n\n---\n\n")}
`.trim();
}

export async function retrieveHybridRagContext({
  query,
  subject = "",
  selectedDateKey = "",
  topK = DEFAULT_TOP_K,
  maxChars =
    DEFAULT_MAX_CONTEXT_CHARS,
} = {}) {
  const cleanQuery = String(
    query || ""
  ).trim();

  if (cleanQuery.length < 2) {
    return "";
  }

  const [
    noteSearch,
    pdfSearch,
  ] = await Promise.all([
    searchRag({
      query: cleanQuery,
      subject,
      selectedDateKey,
      topK: 9,
    }).catch(() => ({
      results: [],
    })),

    searchPdfRag({
      query: cleanQuery,
      subject,
      topK: 7,
    }).catch(() => ({
      results: [],
    })),
  ]);

  const candidates =
    normalizeCandidates(
      noteSearch.results || [],
      pdfSearch.results || []
    );

  const reranked =
    await semanticRerank(
      cleanQuery,
      candidates
    );

  const selected =
    reranked.results.slice(
      0,
      Math.max(
        1,
        Math.min(
          Number(topK) ||
            DEFAULT_TOP_K,
          8
        )
      )
    );

  return formatHybridContext(
    selected,
    maxChars
  );
}

export async function hybridSearch({
  query,
  subject = "",
  selectedDateKey = "",
  topK = DEFAULT_TOP_K,
} = {}) {
  const [
    noteSearch,
    pdfSearch,
  ] = await Promise.all([
    searchRag({
      query,
      subject,
      selectedDateKey,
      topK: 9,
    }).catch(() => ({
      results: [],
    })),

    searchPdfRag({
      query,
      subject,
      topK: 7,
    }).catch(() => ({
      results: [],
    })),
  ]);

  const candidates =
    normalizeCandidates(
      noteSearch.results || [],
      pdfSearch.results || []
    );

  const reranked =
    await semanticRerank(
      query,
      candidates
    );

  return {
    ...reranked,
    candidates: candidates.length,
    results: reranked.results.slice(
      0,
      Math.max(
        1,
        Math.min(
          Number(topK) ||
            DEFAULT_TOP_K,
          8
        )
      )
    ),
  };
}

async function embeddingHealth() {
  try {
    const embedded = await embedBatch([
      "Lumina semantic retrieval health check",
    ]);

    return {
      ok: true,
      model: embedded.model,
      dimensions:
        embedded.embeddings[0]
          ?.length || 0,
    };
  } catch (error) {
    return {
      ok: false,
      model: EMBED_MODEL,
      error:
        error.message ||
        "Embedding model unavailable.",
    };
  }
}

export function registerHybridRagRoutes(app) {
  app.get(
    "/api/rag/hybrid/health",
    async (req, res) => {
      const embedding =
        await embeddingHealth();

      res.json({
        ok: true,
        engine:
          "Lumina Hybrid RAG",
        version: "3.0",
        strategy:
          "BM25 candidate retrieval + semantic reranking",
        embedding,
        ecoMode: true,
        maxCandidates:
          MAX_CANDIDATES,
      });
    }
  );

  app.post(
    "/api/rag/hybrid/search",
    async (req, res) => {
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

        const result =
          await hybridSearch({
            query,
            subject: String(
              req.body?.subject ||
                ""
            ).trim(),
            selectedDateKey:
              String(
                req.body
                  ?.selectedDateKey ||
                  ""
              ).trim(),
            topK: req.body?.topK,
          });

        res.json({
          ok: true,
          query,
          mode: result.mode,
          model: result.model,
          warning:
            result.warning || null,
          candidates:
            result.candidates,
          results:
            result.results.map(
              (item) => ({
                kind: item.kind,
                title: item.title,
                source: item.source,
                page: item.page,
                heading: item.heading,
                dateKey: item.dateKey,
                lexicalScore:
                  Number(
                    item.lexicalNormalized?.toFixed(
                      4
                    ) || 0
                  ),
                semanticScore:
                  item.semanticScore ==
                  null
                    ? null
                    : Number(
                        item.semanticScore.toFixed(
                          4
                        )
                      ),
                hybridScore:
                  Number(
                    item.hybridScore.toFixed(
                      4
                    )
                  ),
                text: item.text,
              })
            ),
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error:
            error.message ||
            "No se pudo ejecutar Hybrid RAG.",
        });
      }
    }
  );
}
