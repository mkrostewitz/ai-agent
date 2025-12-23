import {NextResponse} from "next/server";
import {RecursiveCharacterTextSplitter} from "@langchain/textsplitters";
import {OllamaEmbeddings} from "@langchain/ollama";
import {MongoClient} from "mongodb";
import {MongoDBAtlasVectorSearch} from "@langchain/mongodb";
import {Document} from "langchain/document";
import normalizeText from "@/app/helpers/normalizeText";
import buildIds from "@/app/helpers/buildIds";
import * as cheerio from "cheerio";
import {urlEmbedRequestSchema} from "../validation";

const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_CHUNK_OVERLAP = 80;

function validateUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function extractTextFromHtml(html, url) {
  const $ = cheerio.load(html || "");
  $("script, style, noscript, iframe, svg, canvas").remove();
  const title = ($("title").text() || "").trim();
  const description = (
    $('meta[name="description"]').attr("content") || ""
  ).trim();
  const bodyText = normalizeText($("body").text() || "");
  const combined = [title, description, bodyText]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join("\n\n");
  return {
    text: combined,
    metadata: {title, description, url},
  };
}

export async function POST(req) {
  let client;
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = urlEmbedRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {error: "Invalid request parameters", detail: parsed.error.format()},
        {status: 400}
      );
    }

    const urlsInput = parsed.data.urls || parsed.data.url;
    const namespace = parsed.data.namespace || "website";

    const urls = Array.isArray(urlsInput)
      ? urlsInput
      : urlsInput
      ? [urlsInput]
      : [];
    const validated = urls
      .map((u) => (typeof u === "string" ? validateUrl(u) : null))
      .filter(Boolean);

    const {
      MONGODB_URI,
      MONGODB_DB,
      MONGODB_DEFAULT_EMBEDDING_COLLECTION,
      MONGODB_INDEX,
      OLLAMA_BASE_URL,
    } = process.env;

    if (
      !MONGODB_URI ||
      !MONGODB_DB ||
      !MONGODB_DEFAULT_EMBEDDING_COLLECTION ||
      !MONGODB_INDEX
    ) {
      return NextResponse.json(
        {
          error:
            "Missing MongoDB config. Set MONGODB_URI, MONGODB_DB, MONGODB_DEFAULT_EMBEDDING_COLLECTION, MONGODB_INDEX.",
        },
        {status: 500}
      );
    }

    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(MONGODB_DB);
    const collection = db.collection(MONGODB_DEFAULT_EMBEDDING_COLLECTION);

    const embeddings = new OllamaEmbeddings({
      model: "nomic-embed-text",
      baseUrl: OLLAMA_BASE_URL || "http://localhost:11434",
    });

    const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
      collection,
      indexName: MONGODB_INDEX,
      textKey: "text",
      embeddingKey: "embedding",
    });

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: DEFAULT_CHUNK_SIZE,
      chunkOverlap: DEFAULT_CHUNK_OVERLAP,
    });

    const results = [];
    let totalAdded = 0;

    for (const url of validated) {
      const ns = namespace;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Fetch failed ${res.status}`);
        }
        const html = await res.text();
        const extracted = extractTextFromHtml(html, url);
        if (!extracted.text || !extracted.text.trim()) {
          results.push({
            url,
            namespace: ns,
            added: 0,
            error: "No extractable text from page",
          });
          continue;
        }

        const baseDoc = new Document({
          pageContent: extracted.text,
          metadata: {
            ...extracted.metadata,
            source: url,
            namespace: ns,
          },
        });

        const splits = await splitter.splitDocuments([baseDoc]);
        const ids = buildIds(splits.length, ns || "web");
        const docsWithMeta = splits.map(
          (doc, idx) =>
            new Document({
              pageContent: doc.pageContent,
              metadata: {
                ...doc.metadata,
                source: url,
                namespace: ns,
                id: ids[idx],
              },
            })
        );

        await vectorStore.addDocuments(docsWithMeta, {ids});
        totalAdded += splits.length;
        results.push({
          url,
          namespace: ns,
          added: splits.length,
          chunks: splits.length,
          title: extracted.metadata.title || null,
        });
      } catch (err) {
        console.error("Web embed error for", url, err);
        results.push({
          url,
          namespace: ns,
          added: 0,
          error: err.message || "Failed to embed URL",
        });
      }
    }

    return NextResponse.json({
      totalAdded,
      chunkSize: DEFAULT_CHUNK_SIZE,
      chunkOverlap: DEFAULT_CHUNK_OVERLAP,
      results,
    });
  } catch (error) {
    console.error("Web embedding error:", error);
    return NextResponse.json(
      {error: "Failed to embed URL content"},
      {status: 500}
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}
