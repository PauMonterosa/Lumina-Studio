import fs from "fs/promises";
import path from "path";

const ARXIV_API = "https://export.arxiv.org/api/query";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

const USER_AGENT =
  "Lumina-Studio/1.0 (local academic note-taking tool)";

const DOWNLOAD_HOSTS = new Set([
  "arxiv.org",
  "www.arxiv.org",
  "export.arxiv.org",
  "upload.wikimedia.org",
]);

const ALLOWED_IMAGE_TYPES = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
]);

function decodeEntities(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function stripHtml(value = "") {
  return decodeEntities(
    String(value)
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function xmlTag(block, tag) {
  const match = String(block).match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i")
  );
  return match ? stripHtml(match[1]) : "";
}

function sanitizeFilePart(value, fallback = "figure") {
  const cleaned = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return cleaned || fallback;
}

function latexEscape(value = "") {
  return String(value)
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([#$%&_{}])/g, "\\$1")
    .replace(/\^/g, "\\^{}")
    .replace(/~/g, "\\~{}");
}

function queryTokens(query) {
  return String(query)
    .toLowerCase()
    .split(/[^a-z0-9áéíóúüñ]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 12);
}

function relevanceScore(query, title, caption) {
  const tokens = queryTokens(query);
  const haystackTitle = String(title || "").toLowerCase();
  const haystackCaption = String(caption || "").toLowerCase();

  let score = 0;

  for (const token of tokens) {
    if (haystackCaption.includes(token)) score += 3;
    if (haystackTitle.includes(token)) score += 1;
  }

  return score;
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: options.accept || "text/html,application/xml,text/xml;q=0.9,*/*;q=0.8",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} al consultar ${new URL(url).hostname}`);
  }

  return response.text();
}

function parseArxivFeed(atom) {
  const entries = [
    ...String(atom).matchAll(/<entry>([\s\S]*?)<\/entry>/gi),
  ];

  return entries.map((match) => {
    const block = match[1];
    const idUrl = xmlTag(block, "id");
    const id = idUrl.split("/abs/").pop()?.trim() || "";

    const authors = [
      ...block.matchAll(
        /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi
      ),
    ]
      .map((authorMatch) => stripHtml(authorMatch[1]))
      .filter(Boolean)
      .slice(0, 4)
      .join(", ");

    const published = xmlTag(block, "published");

    return {
      id,
      title: xmlTag(block, "title"),
      authors,
      year: published ? published.slice(0, 4) : "",
      articleUrl: id ? `https://arxiv.org/abs/${id}` : idUrl,
    };
  });
}

function extractArxivFigures(html, paper, query) {
  const figures = [
    ...String(html).matchAll(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi),
  ];

  const results = [];

  for (let index = 0; index < figures.length; index += 1) {
    const block = figures[index][1];

    const imageMatch =
      block.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i) ||
      block.match(/<img\b[^>]*\bdata-src=["']([^"']+)["'][^>]*>/i);

    if (!imageMatch) continue;

    const rawSrc = decodeEntities(imageMatch[1]);

    let imageUrl;
    try {
      imageUrl = new URL(
        rawSrc,
        `https://arxiv.org/html/${paper.id}`
      ).href;
    } catch {
      continue;
    }

    const pathname = new URL(imageUrl).pathname.toLowerCase();
    if (!/\.(png|jpe?g)(?:$|\?)/i.test(pathname)) {
      continue;
    }

    const captionMatch = block.match(
      /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i
    );

    const altMatch = block.match(
      /<img\b[^>]*\balt=["']([^"']+)["'][^>]*>/i
    );

    const caption =
      stripHtml(captionMatch?.[1] || altMatch?.[1] || "") ||
      `Figura del paper ${paper.title}`;

    const score = relevanceScore(query, paper.title, caption);

    results.push({
      id: `arxiv-${paper.id}-${index}`,
      source: "arxiv",
      title: paper.title,
      caption,
      authors: paper.authors,
      year: paper.year,
      license: "Consulta la licencia del paper",
      previewUrl: imageUrl,
      imageUrl,
      sourceUrl: paper.articleUrl,
      articleUrl: paper.articleUrl,
      score,
    });
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

async function searchArxivFigures(query) {
  const terms = queryTokens(query);
  if (!terms.length) return [];

  const searchQuery = terms
    .slice(0, 7)
    .map((term) => `all:${term}`)
    .join(" AND ");

  const url = new URL(ARXIV_API);
  url.searchParams.set("search_query", searchQuery);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", "5");
  url.searchParams.set("sortBy", "relevance");
  url.searchParams.set("sortOrder", "descending");

  const atom = await fetchText(url.href, {
    accept: "application/atom+xml,application/xml,text/xml",
  });

  const papers = parseArxivFeed(atom)
    .filter((paper) => paper.id)
    .slice(0, 4);

  const figureGroups = await Promise.allSettled(
    papers.map(async (paper) => {
      const html = await fetchText(
        `https://arxiv.org/html/${paper.id}`
      );

      return extractArxivFigures(html, paper, query);
    })
  );

  return figureGroups
    .flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function metadataValue(metadata, key) {
  return stripHtml(metadata?.[key]?.value || "");
}

async function searchCommonsFigures(query) {
  const url = new URL(COMMONS_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "18");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|extmetadata");
  url.searchParams.set("iiurlwidth", "1400");
  url.searchParams.set(
    "iiextmetadatafilter",
    [
      "ImageDescription",
      "Artist",
      "Credit",
      "LicenseShortName",
      "LicenseUrl",
      "DateTimeOriginal",
    ].join("|")
  );

  const response = await fetch(url.href, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Wikimedia Commons respondió con HTTP ${response.status}`
    );
  }

  const data = await response.json();
  const pages = Object.values(data?.query?.pages || {});

  return pages
    .map((page, index) => {
      const info = page?.imageinfo?.[0];
      if (!info) return null;

      if (!["image/png", "image/jpeg"].includes(info.mime)) {
        return null;
      }

      const metadata = info.extmetadata || {};
      const title = String(page.title || "")
        .replace(/^File:/i, "")
        .trim();

      const description =
        metadataValue(metadata, "ImageDescription") || title;

      const license =
        metadataValue(metadata, "LicenseShortName") ||
        "Ver licencia en Wikimedia Commons";

      const licenseUrl = metadata?.LicenseUrl?.value || "";

      const sourceUrl = `https://commons.wikimedia.org/wiki/${encodeURIComponent(
        String(page.title || "").replace(/ /g, "_")
      )}`;

      return {
        id: `commons-${page.pageid || index}`,
        source: "commons",
        title,
        caption: description,
        authors:
          metadataValue(metadata, "Artist") ||
          metadataValue(metadata, "Credit"),
        year: metadataValue(metadata, "DateTimeOriginal").slice(0, 4),
        license: licenseUrl ? `${license} · ${licenseUrl}` : license,
        previewUrl: info.thumburl || info.url,
        imageUrl: info.thumburl || info.url,
        sourceUrl,
        articleUrl: sourceUrl,
        score: relevanceScore(query, title, description),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

async function downloadImage(imageUrl) {
  const parsed = new URL(imageUrl);

  if (!DOWNLOAD_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `No se permite descargar imágenes desde ${parsed.hostname}`
    );
  }

  const response = await fetch(imageUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "image/png,image/jpeg",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `No se pudo descargar la imagen (HTTP ${response.status}).`
    );
  }

  const finalUrl = new URL(response.url);
  if (!DOWNLOAD_HOSTS.has(finalUrl.hostname)) {
    throw new Error(
      `La descarga redirigió a un host no permitido: ${finalUrl.hostname}`
    );
  }

  const contentType = String(
    response.headers.get("content-type") || ""
  )
    .split(";")[0]
    .trim()
    .toLowerCase();

  const extension = ALLOWED_IMAGE_TYPES.get(contentType);

  if (!extension) {
    throw new Error(
      `Formato de imagen no compatible con LaTeX: ${
        contentType || "desconocido"
      }. Busca una figura PNG o JPG.`
    );
  }

  const declaredLength = Number(
    response.headers.get("content-length") || 0
  );

  if (declaredLength > 12 * 1024 * 1024) {
    throw new Error("La imagen supera el límite de 12 MB.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length > 12 * 1024 * 1024) {
    throw new Error("La imagen supera el límite de 12 MB.");
  }

  return {
    buffer,
    extension,
  };
}

export function registerNotebookFigureRoutes(app) {
  app.get("/api/notebook/figures/search", async (req, res) => {
    try {
      const query = String(req.query.q || "").trim();
      const source = String(req.query.source || "all");

      if (query.length < 3) {
        return res.status(400).json({
          ok: false,
          error: "La búsqueda debe tener al menos 3 caracteres.",
        });
      }

      let paperResults = [];
      let openResults = [];

      if (source === "all" || source === "papers") {
        try {
          paperResults = await searchArxivFigures(query);
        } catch (error) {
          console.warn("Búsqueda arXiv:", error.message);
        }
      }

      if (source === "all" || source === "open") {
        try {
          openResults = await searchCommonsFigures(query);
        } catch (error) {
          console.warn("Búsqueda Commons:", error.message);
        }
      }

      const results =
        source === "all"
          ? [...paperResults.slice(0, 7), ...openResults.slice(0, 7)]
          : source === "papers"
            ? paperResults
            : openResults;

      res.json({
        ok: true,
        query,
        results,
        counts: {
          papers: paperResults.length,
          open: openResults.length,
        },
      });
    } catch (error) {
      console.error("Figure search:", error);

      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "No se pudieron buscar figuras científicas.",
      });
    }
  });

  app.post("/api/notebook/figures/import", async (req, res) => {
    try {
      const {
        subject,
        query = "",
        imageUrl,
        sourceUrl = "",
        articleUrl = "",
        source = "",
        title = "",
        caption = "",
        authors = "",
        year = "",
        license = "",
      } = req.body || {};

      if (!subject || typeof subject !== "string") {
        return res.status(400).json({
          ok: false,
          error: "Asignatura no válida.",
        });
      }

      if (!imageUrl || typeof imageUrl !== "string") {
        return res.status(400).json({
          ok: false,
          error: "Falta la URL de la imagen.",
        });
      }

      const { buffer, extension } = await downloadImage(imageUrl);

      const projectRoot = path.resolve(process.cwd());
      const subjectFolder = sanitizeFilePart(subject, "subject");
      const mediaDirectory = path.join(
        projectRoot,
        "notes",
        "media",
        subjectFolder
      );

      await fs.mkdir(mediaDirectory, {
        recursive: true,
      });

      const baseName = sanitizeFilePart(
        query || title || "scientific-figure",
        "scientific-figure"
      );

      const fileName = `${baseName}-${Date.now()}${extension}`;
      const filePath = path.join(mediaDirectory, fileName);

      await fs.writeFile(filePath, buffer);

      const latexPath = filePath.replace(/\\/g, "/");

      const cleanCaption =
        caption ||
        title ||
        "Figura científica";

      const labelStem = sanitizeFilePart(
        query || title || "figure",
        "figure"
      ).toLowerCase();

      const citationParts = [
        source === "arxiv" ? "arXiv" : "Wikimedia Commons",
        authors,
        year,
      ].filter(Boolean);

      const citation = citationParts.join(", ");

      const provenanceUrl =
        sourceUrl || articleUrl || "";

      const latex = [
        "\\begin{figure}[H]",
        "    \\centering",
        `    \\includegraphics[width=0.78\\textwidth]{${latexPath}}`,
        `    \\caption{${latexEscape(cleanCaption)}}`,
        `    \\label{fig:${labelStem}}`,
        "\\end{figure}",
        citation
          ? `% Fuente: ${citation}`
          : `% Fuente: ${source || "externa"}`,
        provenanceUrl
          ? `% URL: ${provenanceUrl}`
          : "",
        license
          ? `% Licencia: ${license}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      res.json({
        ok: true,
        fileName,
        filePath,
        latex,
      });
    } catch (error) {
      console.error("Figure import:", error);

      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "No se pudo descargar e insertar la figura.",
      });
    }
  });
}
