import {NextResponse} from "next/server";
import {getRequestTracking} from "@/app/lib/requestGeo";
import {
  createMongoClient,
  getMongoDbName,
  hasMongoConfig,
} from "@/app/lib/mongo";
import {widgetOptionsResponse, withWidgetCors} from "../../cors";

const CONVERSATIONS_COLLECTION =
  process.env.MONGODB_CONVERSATIONS_COLLECTION || "conversations";

export function OPTIONS() {
  return widgetOptionsResponse();
}

export async function PUT(req) {
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

    const body = await req.json().catch(() => ({}));
    const conversationId = body?.conversation_id;
    const conversation = Array.isArray(body?.conversation)
      ? body.conversation
      : [];
    const user = body?.user || null;
    const metadata = body?.metadata || {};
    const source = body?.source || "widget";
    const tracking = await getRequestTracking(req);

    if (!conversationId) {
      return withWidgetCors(
        NextResponse.json(
          {error: "Missing conversation_id in body."},
          {status: 400}
        )
      );
    }

    client = createMongoClient();
    await client.connect();
    console.log("[mongo] Connected: /api/agents/conversations/update");
    const db = client.db(getMongoDbName());
    const collection = db.collection(CONVERSATIONS_COLLECTION);

    const update = {
      $set: {
        metadata: {
          ...metadata,
          tracking: metadata?.tracking || tracking,
        },
        source,
        updated_at: new Date(),
      },
    };

    if (
      tracking.ip ||
      tracking.country ||
      tracking.countryCode ||
      tracking.city
    ) {
      update.$set.tracking = tracking;
    }

    if (user) {
      update.$set.user = user;
    }

    if (conversation.length) {
      update.$push = {
        messages: {
          $each: conversation.map((m) => ({
            role: m?.role === "assistant" ? "assistant" : "user",
            message: typeof m?.message === "string" ? m.message : "",
          })),
        },
      };
    }

    const result = await collection.updateOne(
      {conversation_id: conversationId},
      update
    );

    if (result.matchedCount === 0) {
      return withWidgetCors(
        NextResponse.json(
          {error: "Conversation not found."},
          {status: 404}
        )
      );
    }

    return withWidgetCors(NextResponse.json({ok: true}));
  } catch (error) {
    console.error("Conversation update error:", error);
    return withWidgetCors(
      NextResponse.json(
        {error: "Failed to update conversation"},
        {status: 500}
      )
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}
