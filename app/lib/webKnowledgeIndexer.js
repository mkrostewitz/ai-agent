import crypto from "crypto";

import {MongoDBAtlasVectorSearch} from "@langchain/mongodb";
import {OllamaEmbeddings} from "@langchain/ollama";
import {RecursiveCharacterTextSplitter} from "@langchain/textsplitters";
import * as cheerio from "cheerio";
import {Document} from "langchain/document";
import {MongoClient} from "mongodb";

import buildIds from "../helpers/buildIds.js";
import normalizeText from "../helpers/normalizeText.js";

export const DEFAULT_WEB_CHUNK_SIZE = 500;
export const DEFAULT_WEB_CHUNK_OVERLAP = 80;
export const DEFAULT_WEB_MAX_PAGES = 25;
export const HARD_WEB_MAX_PAGES = 100;

const USER_AGENT = "ai-agent-web-indexer/1.0";
const REQUEST_TIMEOUT_MS = 15000;
const SKIP_PATH_PREFIXES = [
  "/_next/",
  "/api/admin/",
  "/admin",
  "/assets/",
  "/favicon",
];
const SKIP_EXTENSIONS = new Set([
  ".avif",
  ".css",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".map",
  ".mp3",
  ".mp4",
  ".pdf",
  ".png",
  ".svg",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xml",
  ".zip",
]);

export function validateUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function cleanNumber(value, fallback, max = HARD_WEB_MAX_PAGES) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.trunc(number), 1), max);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sourceIdPrefix(namespace, source) {
  const namespacePart = String(namespace || "website")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const hash = crypto.createHash("sha1").update(String(source)).digest("hex");
  return `${namespacePart || "website"}-${hash.slice(0, 12)}`;
}

function canonicalizeSource(url, canonicalOrigin) {
  if (!canonicalOrigin) return url;

  try {
    const sourceUrl = new URL(url);
    const canonicalUrl = new URL(canonicalOrigin);
    sourceUrl.protocol = canonicalUrl.protocol;
    sourceUrl.hostname = canonicalUrl.hostname;
    sourceUrl.port = canonicalUrl.port;
    return sourceUrl.toString();
  } catch {
    return url;
  }
}

function isSkippableUrl(url) {
  const path = url.pathname.toLowerCase();
  if (SKIP_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;

  const extensionMatch = path.match(/\.[a-z0-9]{2,8}$/);
  return extensionMatch ? SKIP_EXTENSIONS.has(extensionMatch[0]) : false;
}

function normalizeInternalUrl(raw, baseUrl, origin) {
  try {
    const url = new URL(raw, baseUrl);
    if (url.origin !== origin) return null;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (isSkippableUrl(url)) return null;

    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (
        key.toLowerCase().startsWith("utm_") ||
        key.toLowerCase() === "fbclid" ||
        key.toLowerCase() === "gclid"
      ) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchText(url, accept = "text/html,application/xhtml+xml") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: accept,
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      contentType: response.headers.get("content-type") || "",
      ok: response.ok,
      status: response.status,
      text,
      url: response.url || url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractInternalLinks(html, baseUrl, origin) {
  const $ = cheerio.load(html || "");
  const links = new Set();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    const normalized = normalizeInternalUrl(href, baseUrl, origin);
    if (normalized) links.add(normalized);
  });

  return [...links];
}

function hasNoIndex(html) {
  const $ = cheerio.load(html || "");
  const robots = String($('meta[name="robots"]').attr("content") || "")
    .toLowerCase()
    .split(",")
    .map((part) => part.trim());
  return robots.includes("noindex");
}

export function extractTextFromHtml(html, url) {
  const $ = cheerio.load(html || "");
  $("script, style, noscript, iframe, svg, canvas").remove();
  const title = ($("title").text() || "").trim();
  const description = ($('meta[name="description"]').attr("content") || "").trim();
  const bodyText = normalizeText($("body").text() || "");
  const combined = [title, description, bodyText]
    .map((text) => (text || "").trim())
    .filter(Boolean)
    .join("\n\n");

  return {
    metadata: {description, title, url},
    text: combined,
  };
}

function parseSitemapUrls(xml, baseUrl, origin) {
  const $ = cheerio.load(xml || "", {xmlMode: true});
  const urls = [];

  $("loc").each((_, element) => {
    const loc = $(element).text();
    const normalized = normalizeInternalUrl(loc, baseUrl, origin);
    if (normalized) urls.push(normalized);
  });

  return urls;
}

async function discoverSitemapUrls(startUrl, maxPages) {
  const origin = new URL(startUrl).origin;
  const sitemapUrls = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/server-sitemap.xml`,
  ];
  const discovered = new Set();
  const queue = [...sitemapUrls];
  const visited = new Set();

  while (queue.length && discovered.size < maxPages) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);

    try {
      const response = await fetchText(sitemapUrl, "application/xml,text/xml,*/*");
      if (!response.ok || !response.text.includes("<loc")) continue;

      for (const loc of parseSitemapUrls(response.text, sitemapUrl, origin)) {
        if (loc.endsWith(".xml")) queue.push(loc);
        else discovered.add(loc);
        if (discovered.size >= maxPages) break;
      }
    } catch {
      // Sitemap discovery is best-effort; crawling can still continue from links.
    }
  }

  return [...discovered];
}

async function discoverPages(startUrls, options = {}) {
  const maxPages = cleanNumber(options.maxPages, DEFAULT_WEB_MAX_PAGES);
  const crawl = Boolean(options.crawl);
  const normalizedStartUrls = startUrls
    .map(validateUrl)
    .filter(Boolean)
    .slice(0, maxPages);
  const roots = normalizedStartUrls.map((url) => new URL(url));
  const allowedOrigins = new Set(roots.map((url) => url.origin));
  const queue = [...normalizedStartUrls];
  const pages = [];
  const pageCache = new Map();
  const visited = new Set();

  if (crawl) {
    for (const startUrl of normalizedStartUrls) {
      for (const sitemapUrl of await discoverSitemapUrls(startUrl, maxPages)) {
        if (!queue.includes(sitemapUrl)) queue.push(sitemapUrl);
      }
    }
  }

  while (queue.length && pages.length < maxPages) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);

    let fetched;
    try {
      fetched = await fetchText(url);
    } catch (error) {
      pageCache.set(url, {error: error.message || "Fetch failed", url});
      continue;
    }

    if (!fetched.ok) {
      pageCache.set(url, {
        error: `Fetch failed ${fetched.status}`,
        status: fetched.status,
        url,
      });
      continue;
    }

    const contentType = fetched.contentType.toLowerCase();
    if (contentType && !contentType.includes("html") && !fetched.text.includes("<html")) {
      pageCache.set(url, {
        error: `Unsupported content type ${fetched.contentType}`,
        url,
      });
      continue;
    }

    pageCache.set(url, fetched);
    pages.push(url);

    if (!crawl) continue;

    const origin = new URL(url).origin;
    if (!allowedOrigins.has(origin)) continue;

    for (const link of extractInternalLinks(fetched.text, url, origin)) {
      if (!visited.has(link) && !queue.includes(link) && pages.length + queue.length < maxPages) {
        queue.push(link);
      }
    }
  }

  return {pageCache, pages};
}

function collectText(value, lines = [], path = "", depth = 0) {
  if (value == null || depth > 8) return lines;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value).trim();
    if (text && text.length < 5000) {
      lines.push(path ? `${path}: ${text}` : text);
    }
    return lines;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectText(entry, lines, path, depth + 1));
    return lines;
  }

  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (["key", "mimeType", "size"].includes(key)) continue;
      const nextPath = path ? `${path}.${key}` : key;
      collectText(entry, lines, nextPath, depth + 1);
    }
  }

  return lines;
}

function postStructuredText(post) {
  const slug = post.slug || post.id || post.title || "post";
  const categories = Array.isArray(post.categories)
    ? post.categories.map((category) => category.label || category.slug).filter(Boolean)
    : [];
  const bodyLines = collectText(post)
    .filter((line) => !line.startsWith("media.") && !line.startsWith("mediaGallery."))
    .join("\n");
  const title = post.title || slug;
  const text = normalizeText(
    [
      `Blog post: ${title}`,
      post.summary ? `Summary: ${post.summary}` : "",
      categories.length ? `Categories: ${categories.join(", ")}` : "",
      post.publishedAt ? `Published: ${post.publishedAt}` : "",
      bodyLines,
    ]
      .filter(Boolean)
      .join("\n")
  );

  return {categories, slug, text, title};
}

async function apiPostToDocument(post, origin, namespace, canonicalOrigin) {
  const displayOrigin = canonicalOrigin || origin;
  const {categories, slug, text: apiText, title} = postStructuredText(post);
  const postUrl = `${origin}/blog/${encodeURIComponent(slug)}`;
  const source = `${displayOrigin}/blog/${encodeURIComponent(slug)}`;
  let pageText = "";
  let pageTitle = title;

  try {
    const response = await fetchText(postUrl);
    if (response.ok && !hasNoIndex(response.text)) {
      const extracted = extractTextFromHtml(response.text, postUrl);
      pageText = extracted.text || "";
      pageTitle = extracted.metadata.title || pageTitle;
    }
  } catch {
    // Fall back to the API summary if the rendered post page is not available.
  }

  const combinedText = normalizeText(
    [apiText, pageText && `Rendered blog page:\n${pageText}`]
      .filter(Boolean)
      .join("\n\n")
  );

  return new Document({
    pageContent: combinedText,
    metadata: {
      apiSource: `${origin}/api/posts`,
      categories,
      namespace,
      source,
      sourceType: pageText ? "blog-post" : "api-post",
      title: pageTitle,
      url: source,
    },
  });
}

async function fetchJsonDocument(url, namespace, sourceType, canonicalOrigin) {
  try {
    const response = await fetchText(url, "application/json,*/*");
    if (!response.ok) return [];

    const data = JSON.parse(response.text);
    const text = normalizeText(collectText(data).join("\n"));
    if (!text) return [];

    const source = canonicalizeSource(url, canonicalOrigin);
    return [
      new Document({
        pageContent: text,
        metadata: {
          namespace,
          source,
          sourceType,
          title: sourceType,
          url: source,
        },
      }),
    ];
  } catch {
    return [];
  }
}

async function fetchKnownApiDocuments(startUrl, namespace, canonicalOrigin) {
  const origin = new URL(startUrl).origin;
  const documents = [];

  try {
    const postsUrl = `${origin}/api/posts`;
    const response = await fetchText(postsUrl, "application/json,*/*");
    if (response.ok) {
      const data = JSON.parse(response.text);
      const posts = Array.isArray(data.posts) ? data.posts : [];
      for (const post of posts) {
        if (post.status && post.status !== "published") continue;
        documents.push(
          await apiPostToDocument(post, origin, namespace, canonicalOrigin)
        );
      }
    }
  } catch {
    // Known API discovery is best-effort.
  }

  for (const [path, sourceType] of [
    ["/api/content/profile", "api-profile"],
    ["/api/cv", "api-cv"],
  ]) {
    documents.push(
      ...(await fetchJsonDocument(
        `${origin}${path}`,
        namespace,
        sourceType,
        canonicalOrigin
      ))
    );
  }

  return documents;
}

async function deleteExistingSources(collection, namespace, urls, canonicalOrigin) {
  const origins = [
    ...new Set(
      [
        ...urls.map((url) => new URL(url).origin),
        canonicalOrigin ? new URL(canonicalOrigin).origin : null,
      ].filter(Boolean)
    ),
  ];
  let deleted = 0;

  for (const origin of origins) {
    const originUrl = new URL(origin);
    const hostPattern =
      canonicalOrigin && origin === new URL(canonicalOrigin).origin
        ? `${escapeRegex(`${originUrl.protocol}//${originUrl.hostname}`)}(?::\\d+)?`
        : escapeRegex(origin);
    const sourcePattern = new RegExp(`^${hostPattern}`);
    const result = await collection.deleteMany({
      $and: [
        {$or: [{namespace}, {"metadata.namespace": namespace}]},
        {$or: [{source: sourcePattern}, {"metadata.source": sourcePattern}]},
      ],
    });
    deleted += result.deletedCount || 0;
  }

  return deleted;
}

export async function indexWebsiteUrls(input = {}) {
  const urlsInput = input.urls || input.url;
  const urls = Array.isArray(urlsInput) ? urlsInput : urlsInput ? [urlsInput] : [];
  const validated = urls
    .map((url) => (typeof url === "string" ? validateUrl(url) : null))
    .filter(Boolean);

  if (!validated.length) {
    throw new Error("Provide at least one valid URL.");
  }

  const namespace = String(input.namespace || "website").trim() || "website";
  const crawl = Boolean(input.crawl);
  const includeKnownApis = input.includeKnownApis ?? crawl;
  const canonicalOrigin = input.canonicalOrigin
    ? validateUrl(input.canonicalOrigin)?.replace(/\/$/, "")
    : "";
  const maxPages = cleanNumber(input.maxPages, crawl ? DEFAULT_WEB_MAX_PAGES : 1);

  const {
    MONGODB_URI,
    MONGODB_DB,
    MONGODB_DEFAULT_EMBEDDING_COLLECTION,
    MONGODB_INDEX,
    OLLAMA_BASE_URL,
  } = process.env;

  if (!MONGODB_URI || !MONGODB_DB || !MONGODB_DEFAULT_EMBEDDING_COLLECTION || !MONGODB_INDEX) {
    throw new Error(
      "Missing MongoDB config. Set MONGODB_URI, MONGODB_DB, MONGODB_DEFAULT_EMBEDDING_COLLECTION, MONGODB_INDEX."
    );
  }

  let client;
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(MONGODB_DB);
    const collection = db.collection(MONGODB_DEFAULT_EMBEDDING_COLLECTION);
    const deleted = input.replace
      ? await deleteExistingSources(collection, namespace, validated, canonicalOrigin)
      : 0;

    const embeddings = new OllamaEmbeddings({
      baseUrl: OLLAMA_BASE_URL || "http://localhost:11434",
      model: "nomic-embed-text",
    });
    const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
      collection,
      embeddingKey: "embedding",
      indexName: MONGODB_INDEX,
      textKey: "text",
    });
    const splitter = new RecursiveCharacterTextSplitter({
      chunkOverlap: DEFAULT_WEB_CHUNK_OVERLAP,
      chunkSize: DEFAULT_WEB_CHUNK_SIZE,
    });

    const {pageCache, pages} = await discoverPages(validated, {crawl, maxPages});
    const baseDocuments = [];
    const results = [];

    for (const url of pages) {
      const fetched = pageCache.get(url);
      if (!fetched || fetched.error) {
        results.push({
          added: 0,
          error: fetched?.error || "Fetch failed",
          namespace,
          url,
        });
        continue;
      }

      if (hasNoIndex(fetched.text)) {
        results.push({
          added: 0,
          error: "Page marked noindex",
          namespace,
          url,
        });
        continue;
      }

      const extracted = extractTextFromHtml(fetched.text, url);
      if (!extracted.text || !extracted.text.trim()) {
        results.push({
          added: 0,
          error: "No extractable text from page",
          namespace,
          url,
        });
        continue;
      }

      baseDocuments.push(
        new Document({
          pageContent: extracted.text,
          metadata: {
            ...extracted.metadata,
            namespace,
            source: canonicalizeSource(url, canonicalOrigin),
            sourceType: "page",
            url: canonicalizeSource(url, canonicalOrigin),
          },
        })
      );
    }

    if (includeKnownApis) {
      for (const url of validated) {
        baseDocuments.push(
          ...(await fetchKnownApiDocuments(url, namespace, canonicalOrigin))
        );
      }
    }

    let totalAdded = 0;

    for (const baseDoc of baseDocuments) {
      const source = baseDoc.metadata.source;
      const splits = await splitter.splitDocuments([baseDoc]);
      const ids = buildIds(splits.length, sourceIdPrefix(namespace, source));
      const docsWithMeta = splits.map(
        (doc, index) =>
          new Document({
            pageContent: doc.pageContent,
            metadata: {
              ...doc.metadata,
              id: ids[index],
              namespace,
              source,
            },
          })
      );

      await vectorStore.addDocuments(docsWithMeta, {ids});
      totalAdded += splits.length;
      results.push({
        added: splits.length,
        chunks: splits.length,
        namespace,
        source,
        title: baseDoc.metadata.title || null,
        type: baseDoc.metadata.sourceType || "page",
        url: baseDoc.metadata.url || source,
      });
    }

    return {
      chunkOverlap: DEFAULT_WEB_CHUNK_OVERLAP,
      chunkSize: DEFAULT_WEB_CHUNK_SIZE,
      crawl: {
        enabled: crawl,
        includeKnownApis,
        maxPages,
        pagesDiscovered: pages.length,
      },
      deleted,
      results,
      totalAdded,
    };
  } finally {
    if (client) await client.close();
  }
}
