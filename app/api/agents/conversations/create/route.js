import {NextResponse} from "next/server";
import {MongoClient} from "mongodb";
import {randomUUID} from "crypto";

const CONVERSATIONS_COLLECTION =
  process.env.MONGODB_CONVERSATIONS_COLLECTION || "conversations";

export async function POST(req) {
  let client;
  try {
    const {MONGODB_URI, MONGODB_DB} = process.env;
    if (!MONGODB_URI || !MONGODB_DB) {
      return NextResponse.json(
        {error: "Missing MongoDB config. Set MONGODB_URI and MONGODB_DB."},
        {status: 500}
      );
    }

    const body = await req.json().catch(() => ({}));
    const conversation = Array.isArray(body?.conversation)
      ? body.conversation
      : [];
    const user = body?.user || null;
    const metadata = body?.metadata || {};
    const source = body?.source || "widget";

    const conversationId = randomUUID();
    const now = new Date();

    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(MONGODB_DB);
    const collection = db.collection(CONVERSATIONS_COLLECTION);

    await collection.insertOne({
      conversation_id: conversationId,
      messages: conversation.map((m) => ({
        role: m?.role === "assistant" ? "assistant" : "user",
        message: typeof m?.message === "string" ? m.message : "",
      })),
      user,
      metadata,
      source,
      created_at: now,
      updated_at: now,
    });

    return NextResponse.json({
      data: {conversation_id: conversationId},
    });
  } catch (error) {
    console.error("Conversation create error:", error);
    return NextResponse.json(
      {error: "Failed to create conversation"},
      {status: 500}
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}
