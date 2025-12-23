import {NextResponse} from "next/server";
import {PDFLoader} from "@langchain/community/document_loaders/fs/pdf";
import {RecursiveCharacterTextSplitter} from "@langchain/textsplitters";
import {OllamaEmbeddings} from "@langchain/ollama";
import {MongoClient} from "mongodb";
import {MongoDBAtlasVectorSearch} from "@langchain/mongodb";
import {Document} from "langchain/document";
import {embedRequestSchema} from "./validation";
import normalizeText from "@/app/helpers/normalizeText";
import buildIds from "@/app/helpers/buildIds";

const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_CHUNK_OVERLAP = 80;

export async function POST(req) {
  let client;
  try {
    const contentType = req.headers.get("content-type") || "";
    let body = {};
    const uploads = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      body.namespace = form.get("namespace");
      if (file && typeof file === "object" && file.arrayBuffer) {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        uploads.push({
          type: "buffer",
          buffer,
          name: file.name || "upload.pdf",
          namespace: body.namespace,
        });
        body.source = null; // avoid defaulting to local file when uploading
      }
    } else {
      body = (await req.json().catch(() => null)) || {};

      // Support base64 file upload via JSON: { fileBase64: "...", fileName: "cv.pdf" }
      if (body.fileBase64) {
        const base64Data = body.fileBase64.replace(/^data:.*;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        uploads.push({
          type: "buffer",
          buffer,
          name: body.fileName || "upload.pdf",
          namespace: body.namespace,
        });
      }
    }

    const parsedSettings = embedRequestSchema.safeParse({
      namespace: body.namespace,
      uploads,
    });

    if (!parsedSettings.success) {
      return NextResponse.json(
        {
          statusCode: 251,
          status: "error",
          message: "Invalid request parameters",
          detail: parsedSettings.error.format(),
        },
        {status: 251}
      );
    }

    const namespace = parsedSettings.data.namespace;
    const chunkSize = DEFAULT_CHUNK_SIZE;
    const chunkOverlap = DEFAULT_CHUNK_OVERLAP;

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

    // Init MongoDB + embeddings
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

    const results = [];
    let totalAdded = 0;

    const sourceEntries = uploads.map((u) => ({
      kind: "buffer",
      buffer: u.buffer,
      name: u.name,
      namespace: u.namespace || namespace,
    }));

    for (const entry of sourceEntries) {
      const ns = entry.namespace || namespace;

      try {
        let docs = [];

        const blob = new Blob([entry.buffer], {
          type: "application/pdf",
        });
        const loader = new PDFLoader(blob);
        docs = (await loader.load()).map(
          (doc) =>
            new Document({
              pageContent: normalizeText(doc.pageContent),
              metadata: doc.metadata,
            })
        );

        const splitter = new RecursiveCharacterTextSplitter({
          chunkSize,
          chunkOverlap,
        });
        const splits = await splitter.splitDocuments(docs);

        const ids = buildIds(splits.length, ns);
        const docsWithSource = splits.map(
          (doc, idx) =>
            new Document({
              pageContent: doc.pageContent,
              metadata: {
                ...doc.metadata,
                source: entry.name,
                namespace: ns,
                id: ids[idx],
              },
            })
        );

        await vectorStore.addDocuments(docsWithSource, {ids});

        totalAdded += splits.length;
        results.push({
          source: entry.name,
          namespace: ns,
          added: splits.length,
          pages: docs.length,
          uploaded: true,
        });
      } catch (err) {
        const errSource = entry.name;
        console.error("Embedding error for source:", errSource, err);
        results.push({
          source: errSource,
          namespace: ns,
          added: 0,
          error:
            err.code === "ENOENT"
              ? "Source file not found"
              : err.message || "Failed to embed source",
        });
      }
    }

    return NextResponse.json({
      totalAdded,
      chunkSize,
      chunkOverlap,
      results,
    });
  } catch (error) {
    console.error("Embedding error:", error);
    const status = error.code === "ENOENT" ? 400 : 500;
    const message =
      error.code === "ENOENT"
        ? "Source file not found. Provide a valid path in `source`."
        : "Failed to embed document.";
    return NextResponse.json(
      {error: message, detail: error.message},
      {
        status,
      }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}
