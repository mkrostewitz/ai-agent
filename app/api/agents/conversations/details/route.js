import {NextResponse} from "next/server";
import {
  createMongoClient,
  getMongoDbName,
  hasMongoConfig,
} from "@/app/lib/mongo";
import {widgetOptionsResponse, withWidgetCors} from "../../cors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONVERSATIONS_COLLECTION =
  process.env.MONGODB_CONVERSATIONS_COLLECTION || "conversations";

export function OPTIONS() {
  return widgetOptionsResponse();
}

export async function GET(req) {
  let client;
  try {
    if (!hasMongoConfig()) {
      return withWidgetCors(
        NextResponse.json(
          {error: "Missing MongoDB config. Set MONGODB_URI and MONGODB_DB."},
          {status: 500}
        )
      );
    }

    const url = new URL(req.url);
    const conversationId = url.searchParams.get("conversation_id");
    if (!conversationId) {
      return withWidgetCors(
        NextResponse.json(
          {error: "Missing conversation_id query param."},
          {status: 400}
        )
      );
    }

    client = createMongoClient();
    await client.connect();
    console.log("[mongo] Connected: /api/agents/conversations/details");
    const db = client.db(getMongoDbName());
    const collection = db.collection(CONVERSATIONS_COLLECTION);

    const doc = await collection.findOne(
      {conversation_id: conversationId},
      {projection: {_id: 0}}
    );

    if (!doc) {
      return withWidgetCors(
        NextResponse.json(
          {error: "Conversation not found."},
          {status: 404}
        )
      );
    }

    return withWidgetCors(
      NextResponse.json({
        data: {
          conversation: Array.isArray(doc.messages)
            ? doc.messages.map((m) => ({
                role: m?.role === "assistant" ? "assistant" : "user",
                message: typeof m?.message === "string" ? m.message : "",
              }))
            : [],
          metadata: doc.metadata || {},
          user: doc.user || null,
        },
      })
    );
  } catch (error) {
    console.error("Conversation details error:", error);
    return withWidgetCors(
      NextResponse.json(
        {error: "Failed to load conversation"},
        {status: 500}
      )
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}
