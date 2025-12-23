import {NextResponse} from "next/server";
import {MongoClient} from "mongodb";
import {Ollama} from "@langchain/ollama";

const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "phi3:mini";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const SETTINGS_COLLECTION =
  process.env.MONGODB_SETTINGS_COLLECTION || "settings";

function buildPrompt(messages = [], instruction) {
  const header = instruction
    ? `${instruction.trim()}\n\n`
    : "You are a helpful assistant.\n\n";
  const pairs = messages
    .map((m) => {
      const role = m?.role === "assistant" ? "Assistant" : "User";
      const content = typeof m?.content === "string" ? m.content : "";
      return `${role}: ${content}`;
    })
    .join("\n");
  return `${header}${pairs}\nAssistant:`;
}

async function loadSettings() {
  let client;
  try {
    const {MONGODB_URI, MONGODB_DB} = process.env;
    if (!MONGODB_URI || !MONGODB_DB) return null;

    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(MONGODB_DB);
    const collection = db.collection(SETTINGS_COLLECTION);
    const doc = await collection.findOne({}, {projection: {_id: 0}});
    return doc;
  } catch (error) {
    console.warn("Chat stream: failed to load settings from Mongo", error);
    return null;
  } finally {
    if (client) await client.close();
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    if (!messages.length) {
      return NextResponse.json(
        {error: "Missing `messages` array in request body."},
        {status: 400}
      );
    }

    const settings = (await loadSettings()) || {};

    const instruction =
      typeof settings.instruction === "string"
        ? settings.instruction
        : undefined;

    const prompt = buildPrompt(messages, instruction);

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
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of await model.stream(prompt)) {
            const payload = {
              choices: [
                {
                  delta: {content: chunk},
                },
              ],
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
            );
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

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat stream error:", error);
    return NextResponse.json(
      {error: "Failed to start chat stream"},
      {status: 500}
    );
  }
}
