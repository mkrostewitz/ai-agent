import {NextResponse} from "next/server";
import {Ollama} from "@langchain/ollama";
import {OllamaEmbeddings} from "@langchain/ollama";
import {MongoDBAtlasVectorSearch} from "@langchain/mongodb";
import {
  createMongoClient,
  getMongoDbName,
  hasMongoConfig,
} from "@/app/lib/mongo";
import {
  knowledgeNamespaceMatch,
  vectorNamespaceFilter,
} from "@/app/lib/knowledgeNamespace";
import {getOllamaRequestOptions} from "@/app/lib/ollamaRuntime";
import {widgetOptionsResponse, withWidgetCors} from "../../cors";

const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "phi3:mini";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const SETTINGS_COLLECTION =
  process.env.MONGODB_SETTINGS_COLLECTION || "settings";
const USERS_COLLECTION = process.env.MONGODB_USERS_COLLECTION || "users";
const EMBEDDINGS_COLLECTION =
  process.env.MONGODB_DEFAULT_EMBEDDING_COLLECTION ||
  process.env.MONGODB_COLLECTION ||
  "embeddings";
const VECTOR_INDEX = process.env.MONGODB_INDEX || "vector_index";
const DEFAULT_RETRIEVAL_K = Number(process.env.RAG_TOP_K || 6);
const CURRENT_YEAR = new Date().getFullYear();

export function OPTIONS() {
  return widgetOptionsResponse();
}

function cleanString(value) {
  return String(value || "").trim();
}

function normalizeOwnerProfile(user) {
  if (!user) return null;

  const firstName = cleanString(user.firstName);
  const lastName = cleanString(user.lastName);
  const fullName =
    cleanString(user.name) ||
    [firstName, lastName].filter(Boolean).join(" ") ||
    cleanString(user.email);

  if (!fullName) return null;

  return {
    firstName,
    lastName,
    fullName,
  };
}

function buildStandardInstruction(profile, instruction) {
  const configuredName = profile?.fullName || "the configured person";
  const firstNameLine = profile?.firstName
    ? `- First name: ${profile.firstName}`
    : "";
  const lastNameLine = profile?.lastName
    ? `- Last name: ${profile.lastName}`
    : "";
  const adminInstruction =
    typeof instruction === "string" && instruction.trim()
      ? [
          "",
          "Additional administrator instructions:",
          instruction.trim(),
          "",
          "Apply the additional administrator instructions only when they do not conflict with the configured person or the source-context rules above.",
        ].join("\n")
      : "";

  return [
    `You are the professional personal assistant for ${configuredName}.`,
    "Represent the configured person using the first and last name captured during setup.",
    "Configured person:",
    `- Full name: ${configuredName}`,
    firstNameLine,
    lastNameLine,
    "",
    "Use uploaded CVs, resumes, and indexed website data as the source of truth for the person's professional background.",
    "For background, career, and experience questions, answer in reverse chronological order: current/latest positions first, then the next most recent roles.",
    "For current-role, current-engagement, current-activity, or current-focus questions, answer only with the current/latest engagement. Do not include previous roles unless the user explicitly asks for background, career history, or experience.",
    "For broad background questions, include the current/latest organization(s) plus the next three distinct prior organizations when they are present in the CV context.",
    "Do not skip from a current role to much older roles when newer intermediate roles are present in the context.",
    "When an older snippet groups several roles, cite only the newest role from that group in concise summaries; name older employers from that group only when explicitly requested.",
    "Do not infer subsidiary, acquisition, ownership, or transformation relationships between companies unless the context explicitly says so.",
    "Do not describe customers, reference projects, partners, or prospects as employers or held roles unless the context explicitly says they were employers or roles.",
    "If snippets conflict, prefer the current or latest dated information; if recency cannot be determined, say that the context does not clearly identify the latest role.",
    "Never answer as a different person named in copied or default instructions.",
    "Keep answers concise, professional, and natural.",
    "For narrow factual questions, default to 1-2 short sentences. Add more detail only when the user asks for an overview, list, background, career history, or comparison.",
    "Write in short, readable sentences and avoid long unbroken text blocks. Use Markdown paragraph breaks after every 2-3 sentences, and use concise bullet lists when an answer has several separate points.",
    adminInstruction,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function contextMetadataLines(ctx) {
  return [
    ctx.source ? `Source: ${ctx.source}` : "",
    ctx.sourceType ? `Source type: ${ctx.sourceType}` : "",
    ctx.title ? `Title: ${ctx.title}` : "",
  ].filter(Boolean);
}

function buildPrompt(question, instruction, contexts, responseLang, profile) {
  const instructionBlock = buildStandardInstruction(profile, instruction);
  const contextBlock = contexts
    .map(
      (ctx, idx) =>
        [`[Context ${idx + 1}] ${ctx.text}`, ...contextMetadataLines(ctx)].join(
          "\n"
        )
    )
    .join("\n\n");

  return [
    `${instructionBlock}`,
    "",
    "Strict rules:",
    "- Use only the provided context snippets below.",
    responseLang
      ? `- Always respond in this language: ${responseLang}.`
      : "- Respond in the same language as the user question.",
    "- If a UI language hint conflicts with the user's question language, prioritize the user's question language.",
    "- Answer the question directly. Do not repeat the user question, and do not include prompt labels such as \"User question:\" or \"Assistant:\".",
    "- If the answer is not in context, answer exactly: \"I don't know based on the provided context.\"",
    "- Do not invent facts, names, dates, or background details.",
    "- For narrow factual answers, use 1-2 short sentences by default.",
    "- For questions about the current engagement, current role, current activity, current focus, or \"aktuelles Engagement\", answer only the current/latest engagement and omit older roles.",
    "- For professional summaries, prioritize the current/latest context before older career history.",
    "- For broad background answers, name the current/latest organization(s), then the next three distinct prior organizations from the CV context if available.",
    "",
    "Context snippets:",
    contextBlock,
    "",
    "Answer this question directly, without repeating it:",
    question,
  ].join("\n");
}

function normalizeLang(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace("_", "-");
  if (!normalized) return null;
  if (/^[a-z]{2}(-[a-z]{2})?$/.test(normalized)) return normalized;
  return null;
}

function detectQuestionLanguage(text) {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return null;
  const deHints = [
    "wie",
    "heissen",
    "heißt",
    "und",
    "was",
    "über",
    "ueber",
    "beruf",
    "erfahrung",
    "dein",
    "deine",
    "hast du",
    "kannst du",
  ];
  const itHints = ["ciao", "come", "perche", "perché", "lavoro", "esperienza"];
  const enHints = ["what", "who", "tell me", "experience", "career", "your"];

  const count = (hints) =>
    hints.reduce((acc, h) => (t.includes(h) ? acc + 1 : acc), 0);

  const de = count(deHints);
  const it = count(itHints);
  const en = count(enHints);

  if (de >= it && de >= en && de > 0) return "de";
  if (it >= de && it >= en && it > 0) return "it";
  if (en > 0) return "en";
  return null;
}

function fallbackForLang(lang) {
  const base = normalizeLang(lang)?.slice(0, 2);
  if (base === "de") return "Ich weiß es auf Basis des bereitgestellten Kontexts nicht.";
  if (base === "it")
    return "Non lo so in base al contesto fornito.";
  return "I don't know based on the provided context.";
}

function retrievalUnavailableForLang(lang) {
  const base = normalizeLang(lang)?.slice(0, 2);
  if (base === "de") {
    return "Ich kann gerade nicht auf die Wissensdatenbank zugreifen. Bitte versuche es gleich erneut.";
  }
  if (base === "it") {
    return "Al momento non riesco ad accedere alla base di conoscenza. Riprova tra poco.";
  }
  return "I can't access the knowledge base right now. Please try again shortly.";
}

function isIdentityQuestion(text) {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return false;

  return [
    "who are you",
    "what is your name",
    "your name",
    "wer bist du",
    "wer du bist",
    "wie heißt du",
    "wie heisst du",
    "sag mir wer du",
    "chi sei",
    "come ti chiami",
  ].some((hint) => t.includes(hint));
}

function identityForLang(lang, profile) {
  const fullName = profile?.fullName || "the configured person";
  const base = normalizeLang(lang)?.slice(0, 2);
  if (base === "de") {
    return `Ich bin der digitale persönliche Assistent von ${fullName}.`;
  }
  if (base === "it") {
    return `Sono l'assistente personale digitale di ${fullName}.`;
  }
  return `I am the digital personal assistant for ${fullName}.`;
}

function createSseTextResponse(text) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      enqueueSseDelta(controller, encoder, text);
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return withWidgetCors(
    new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    })
  );
}

function enqueueSseDelta(controller, encoder, content) {
  const payload = {
    choices: [
      {
        delta: {content},
      },
    ],
  };
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function looseTextPattern(value) {
  return escapeRegExp(value).trim().replace(/\s+/g, "\\s+");
}

function stripPromptEcho(answer, question) {
  let cleaned = String(answer || "").replace(/\r\n/g, "\n").trim();
  const questionPattern = looseTextPattern(question);
  const labelPattern =
    "(?:User question|Question|Asked question|Prompt|Frage|Nutzerfrage|Benutzerfrage)";

  if (questionPattern) {
    const labeledQuestionAtStart = new RegExp(
      `^\\s*${labelPattern}\\s*:\\s*${questionPattern}\\s*(?:\\n+|$)`,
      "i"
    );
    const labeledQuestionAtEnd = new RegExp(
      `(?:\\n\\s*)*${labelPattern}\\s*:\\s*${questionPattern}\\s*$`,
      "i"
    );
    const bareQuestionAtStart = new RegExp(
      `^\\s*${questionPattern}\\s*(?:\\n+|$)`,
      "i"
    );
    const bareQuestionAtEnd = new RegExp(
      `(?:\\n\\s*)+${questionPattern}\\s*$`,
      "i"
    );

    cleaned = cleaned
      .replace(labeledQuestionAtStart, "")
      .replace(labeledQuestionAtEnd, "")
      .replace(bareQuestionAtStart, "")
      .replace(bareQuestionAtEnd, "")
      .trim();
  }

  return cleaned
    .replace(/(?:\n\s*)*(?:Assistant|Assistent|Antwort|Answer)\s*:\s*$/i, "")
    .trim();
}

function getLatestUserQuestion(messages = []) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role === "user" && typeof m?.content === "string" && m.content.trim()) {
      return m.content.trim();
    }
  }
  return "";
}

function isProfessionalBackgroundQuestion(text) {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return false;

  return [
    "background",
    "career",
    "experience",
    "current role",
    "current position",
    "latest role",
    "recent role",
    "work history",
    "professional",
    "cv",
    "resume",
    "beruf",
    "erfahrung",
    "karriere",
    "hintergrund",
    "aktuelle",
    "derzeit",
    "lebenslauf",
    "esperienza",
    "carriera",
    "ruolo attuale",
    "curriculum",
  ].some((hint) => t.includes(hint));
}

function recencyScore(text) {
  const value = String(text || "");
  const lower = value.toLowerCase();
  const currentSignal =
    /\b(present|current|currently|ongoing|latest|recent|now|today)\b/i.test(
      value
    ) ||
    /\b(gegenwart|aktuell|derzeit|heute|laufend|bis heute)\b/i.test(value) ||
    /\b(presente|attuale|attualmente|oggi|recente)\b/i.test(value);
  const summarySignal =
    /\b(profile|summary|about|overview|background|experience|cv|resume)\b/i.test(
      value
    ) ||
    /\b(profil|zusammenfassung|hintergrund|erfahrung|lebenslauf)\b/i.test(
      value
    ) ||
    /\b(profilo|sommario|esperienza|curriculum)\b/i.test(value);
  const years = [...value.matchAll(/\b(19\d{2}|20\d{2})\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= 1950 && year <= CURRENT_YEAR + 1);
  const latestYear = years.length ? Math.max(...years) : 0;
  const oldOnlyPenalty =
    years.length && latestYear < CURRENT_YEAR - 10 && !currentSignal ? 20 : 0;

  return (
    (currentSignal ? 10000 : 0) +
    (summarySignal ? 100 : 0) +
    latestYear -
    oldOnlyPenalty +
    Math.min(lower.length / 1000, 5)
  );
}

function rankContexts(question, contexts) {
  if (!isProfessionalBackgroundQuestion(question)) return contexts;

  return contexts
    .map((ctx, index) => ({
      ctx,
      index,
      score: recencyScore(`${ctx.title || ""}\n${ctx.source || ""}\n${ctx.text}`),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ctx}) => ctx);
}

function cosineSimilarity(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return -1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const va = Number(a[i]);
    const vb = Number(b[i]);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA === 0 || normB === 0) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function safeRetrievalK(question, retrievalK) {
  const requestedK =
    Number.isFinite(retrievalK) && retrievalK > 0
      ? Math.min(Math.floor(retrievalK), 20)
      : DEFAULT_RETRIEVAL_K;

  return isProfessionalBackgroundQuestion(question)
    ? Math.min(Math.max(requestedK, 12), 20)
    : requestedK;
}

function metadataObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function metadataString(metadata, key) {
  const root = metadataObject(metadata);
  const nested = metadataObject(root.metadata);
  const value = root[key] ?? nested[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapContextDocument(doc) {
  const text = typeof doc?.pageContent === "string" ? doc.pageContent.trim() : "";
  const metadata = doc?.metadata || {};

  return {
    text,
    source: metadataString(metadata, "source"),
    sourceType: metadataString(metadata, "sourceType"),
    title: metadataString(metadata, "title"),
  };
}

async function retrieveContextWithLocalCosine(
  collection,
  question,
  namespace,
  retrievalK,
  reason
) {
  try {
    const safeK = safeRetrievalK(question, retrievalK);
    const query = namespace ? knowledgeNamespaceMatch(namespace) : {};
    const candidates = await collection
      .find(query, {
        projection: {
          text: 1,
          source: 1,
          sourceType: 1,
          title: 1,
          embedding: 1,
          "metadata.source": 1,
          "metadata.sourceType": 1,
          "metadata.title": 1,
        },
      })
      .limit(2000)
      .toArray();

    const fallbackEmbeddings = new OllamaEmbeddings({
      model: "nomic-embed-text",
      baseUrl: OLLAMA_BASE_URL,
      requestOptions: getOllamaRequestOptions(),
    });
    const queryEmbedding = await fallbackEmbeddings.embedQuery(question);
    const boostProfessionalRecency = isProfessionalBackgroundQuestion(question);
    const ranked = candidates
      .map((doc) => {
        const text = typeof doc?.text === "string" ? doc.text.trim() : "";
        const source =
          typeof doc?.source === "string" && doc.source.trim()
            ? doc.source.trim()
            : metadataString(doc?.metadata, "source");
        const sourceType =
          typeof doc?.sourceType === "string" && doc.sourceType.trim()
            ? doc.sourceType.trim()
            : metadataString(doc?.metadata, "sourceType");
        const title =
          typeof doc?.title === "string" && doc.title.trim()
            ? doc.title.trim()
            : metadataString(doc?.metadata, "title");
        const semanticScore = cosineSimilarity(queryEmbedding, doc?.embedding);
        const score =
          semanticScore +
          (boostProfessionalRecency
            ? recencyScore(`${title || ""}\n${source || ""}\n${text}`) / 100000
            : 0);

        return {
          score,
          source,
          sourceType,
          text,
          title,
        };
      })
      .filter((item) => item.text && Number.isFinite(item.score) && item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, safeK)
      .map(({text, source, sourceType, title}) => ({
        text,
        source,
        sourceType,
        title,
      }));

    console.log("[rag] retrieval-local", {
      namespace: namespace || null,
      reason,
      k: safeK,
      candidates: candidates.length,
      hits: ranked.length,
    });

    return {contexts: ranked, error: null};
  } catch (error) {
    console.warn("Chat stream: local retrieval fallback failed", {
      message: error?.message || String(error),
      namespace: namespace || null,
      reason,
    });
    return {contexts: [], error};
  }
}

async function loadRuntimeConfig() {
  let client;
  try {
    if (!hasMongoConfig()) return {profile: null, settings: null};

    client = createMongoClient();
    await client.connect();
    console.log("[mongo] Connected: /api/agents/chat/stream (runtime-config)");
    const db = client.db(getMongoDbName());
    const [settings, user] = await Promise.all([
      db
        .collection(SETTINGS_COLLECTION)
        .findOne(
          {},
          {projection: {_id: 0}, sort: {updatedAt: -1, createdAt: -1}}
        ),
      db.collection(USERS_COLLECTION).findOne(
        {
          $or: [
            {isAdmin: true},
            {role: "admin"},
            {roles: "admin"},
          ],
        },
        {
          projection: {
            _id: 0,
            email: 1,
            firstName: 1,
            lastName: 1,
            name: 1,
          },
          sort: {createdAt: 1, updatedAt: 1},
        }
      ),
    ]);

    return {
      profile: normalizeOwnerProfile(user),
      settings,
    };
  } catch (error) {
    console.warn("Chat stream: failed to load runtime config from Mongo", error);
    return {profile: null, settings: null};
  } finally {
    if (client) await client.close();
  }
}

async function retrieveContext(question, namespace, retrievalK) {
  let client;
  let collection;
  try {
    if (!hasMongoConfig()) return {contexts: [], error: null};

    client = createMongoClient();
    await client.connect();
    console.log("[mongo] Connected: /api/agents/chat/stream (embeddings)");

    const db = client.db(getMongoDbName());
    collection = db.collection(EMBEDDINGS_COLLECTION);
    const embeddings = new OllamaEmbeddings({
      model: "nomic-embed-text",
      baseUrl: OLLAMA_BASE_URL,
      requestOptions: getOllamaRequestOptions(),
    });
    const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
      collection,
      indexName: VECTOR_INDEX,
      textKey: "text",
      embeddingKey: "embedding",
    });

    const safeK = safeRetrievalK(question, retrievalK);
    const filter = vectorNamespaceFilter(namespace);
    const docs = await vectorStore.similaritySearch(question, safeK, filter);
    const contexts = docs.map(mapContextDocument).filter((d) => d.text);
    console.log("[rag] retrieval", {
      namespace: namespace || null,
      k: safeK,
      hits: contexts.length,
    });

    if (contexts.length === 0) {
      return await retrieveContextWithLocalCosine(
        collection,
        question,
        namespace,
        retrievalK,
        namespace ? "empty-vector-namespace" : "empty-vector-results"
      );
    }

    return {contexts, error: null};
  } catch (error) {
    if (collection) {
      console.warn(
        "Chat stream: Atlas vector search failed, using local cosine fallback",
        {
          message: error?.message || String(error),
          namespace: namespace || null,
        }
      );
      return await retrieveContextWithLocalCosine(
        collection,
        question,
        namespace,
        retrievalK,
        "vector-search-error"
      );
    }

    console.warn("Chat stream: retrieval failed", {
      message: error?.message || String(error),
      namespace: namespace || null,
    });
    return {contexts: [], error};
  } finally {
    if (client) await client.close();
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    if (!messages.length) {
      return withWidgetCors(
        NextResponse.json(
          {error: "Missing `messages` array in request body."},
          {status: 400}
        )
      );
    }

    const runtimeConfig = await loadRuntimeConfig();
    const settings = runtimeConfig.settings || {};
    const profile = runtimeConfig.profile;
    const question = getLatestUserQuestion(messages);
    if (!question) {
      return withWidgetCors(
        NextResponse.json(
          {error: "Missing user question in messages."},
          {status: 400}
        )
      );
    }

    const instruction =
      typeof settings.instruction === "string"
        ? settings.instruction
        : undefined;
    const namespace =
      typeof body?.namespace === "string" && body.namespace.trim()
        ? body.namespace.trim()
        : typeof settings?.namespace === "string" && settings.namespace.trim()
        ? settings.namespace.trim()
        : undefined;
    const retrievalK =
      typeof body?.retrieval_k === "number"
        ? body.retrieval_k
        : typeof settings?.retrieval_k === "number"
        ? settings.retrieval_k
        : DEFAULT_RETRIEVAL_K;
    const responseLang =
      detectQuestionLanguage(question) ||
      normalizeLang(body?.lang) ||
      normalizeLang(body?.locale);
    console.log("[rag] request", {
      namespace: namespace || null,
      retrievalK,
      responseLang: responseLang || null,
      questionPreview: question.slice(0, 120),
    });

    if (
      isIdentityQuestion(question) &&
      !isProfessionalBackgroundQuestion(question) &&
      profile?.fullName
    ) {
      return createSseTextResponse(identityForLang(responseLang, profile));
    }

    const retrieval = await retrieveContext(question, namespace, retrievalK);
    const contexts = rankContexts(question, retrieval.contexts || []);
    if (!contexts.length) {
      if (isIdentityQuestion(question) && profile?.fullName) {
        return createSseTextResponse(identityForLang(responseLang, profile));
      }
      if (retrieval.error) {
        return createSseTextResponse(retrievalUnavailableForLang(responseLang));
      }
      return createSseTextResponse(fallbackForLang(responseLang));
    }
    const prompt = buildPrompt(
      question,
      instruction,
      contexts,
      responseLang,
      profile
    );

    const modelName =
      settings.model || process.env.OLLAMA_MODEL || DEFAULT_MODEL;
    const temperature =
      typeof settings.temperature === "number"
        ? settings.temperature
        : 0.3;
    const maxTokens =
      typeof settings.max_tokens === "number" ? settings.max_tokens : 2000;
    const topK =
      typeof settings.top_k === "number" ? settings.top_k : undefined;
    const topP =
      typeof settings.top_p === "number" ? settings.top_p : undefined;

    const model = new Ollama({
      model: modelName,
      baseUrl: OLLAMA_BASE_URL,
      stream: true,
      temperature,
      maxTokens,
      topK,
      topP,
      ...getOllamaRequestOptions(),
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const promptEchoTailLength = Math.max(240, question.length + 120);
          let answer = "";
          let pending = "";
          let sentContent = false;
          const sendContent = (content) => {
            if (!content) return;
            enqueueSseDelta(controller, encoder, content);
            sentContent = true;
          };

          for await (const chunk of await model.stream(prompt)) {
            const text = String(chunk || "");
            answer += text;
            pending += text;

            if (pending.length > promptEchoTailLength) {
              const flushLength = pending.length - promptEchoTailLength;
              sendContent(pending.slice(0, flushLength));
              pending = pending.slice(flushLength);
            }
          }
          sendContent(stripPromptEcho(pending, question));
          if (!sentContent && answer.trim()) {
            sendContent(stripPromptEcho(answer, question) || fallbackForLang(responseLang));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          const fallback = {
            error: "Generation failed",
            detail: error?.message || String(error),
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(fallback)}\n\n`)
          );
          controller.close();
        }
      },
    });

    return withWidgetCors(
      new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      })
    );
  } catch (error) {
    console.error("Chat stream error:", error);
    return withWidgetCors(
      NextResponse.json(
        {error: "Failed to start chat stream"},
        {status: 500}
      )
    );
  }
}
