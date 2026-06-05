import {NextResponse} from "next/server";
import {MongoClient} from "mongodb";
import {randomUUID} from "crypto";
import {getRequestTracking} from "@/app/lib/requestGeo";
import {sendNewConversationNotification} from "@/app/lib/conversationNotifications";
import {widgetOptionsResponse, withWidgetCors} from "../../cors";

const CONVERSATIONS_COLLECTION =
  process.env.MONGODB_CONVERSATIONS_COLLECTION || "conversations";

export const runtime = "nodejs";

export function OPTIONS() {
  return widgetOptionsResponse();
}

export async function POST(req) {
  let client;
  try {
    const {MONGODB_URI, MONGODB_DB} = process.env;
    if (!MONGODB_URI || !MONGODB_DB) {
      return withWidgetCors(
        NextResponse.json(
          {error: "Missing MongoDB config. Set MONGODB_URI and MONGODB_DB."},
          {status: 500}
        )
      );
    }

    const body = await req.json().catch(() => ({}));
    const conversation = Array.isArray(body?.conversation)
      ? body.conversation
      : [];
    const user = body?.user || null;
    const metadata = body?.metadata || {};
    const source = body?.source || "widget";
    const tracking = await getRequestTracking(req);

    const conversationId = randomUUID();
    const now = new Date();

    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log("[mongo] Connected: /api/agents/conversations/create");
    const db = client.db(MONGODB_DB);
    const collection = db.collection(CONVERSATIONS_COLLECTION);
    const storedConversation = {
      conversation_id: conversationId,
      messages: conversation.map((m) => ({
        role: m?.role === "assistant" ? "assistant" : "user",
        message: typeof m?.message === "string" ? m.message : "",
      })),
      user,
      metadata: {
        ...metadata,
        tracking: metadata?.tracking || tracking,
      },
      tracking,
      source,
      status: "open",
      created_at: now,
      updated_at: now,
    };

    await collection.insertOne(storedConversation);

    try {
      await sendNewConversationNotification(storedConversation);
    } catch (error) {
      console.error("Conversation notification email error:", error);
    }

    return withWidgetCors(
      NextResponse.json({
        data: {conversation_id: conversationId},
      })
    );
  } catch (error) {
    console.error("Conversation create error:", error);
    return withWidgetCors(
      NextResponse.json(
        {error: "Failed to create conversation"},
        {status: 500}
      )
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}
