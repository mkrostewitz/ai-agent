import {NextResponse} from "next/server";
import {MongoClient} from "mongodb";

const CONVERSATIONS_COLLECTION =
  process.env.MONGODB_CONVERSATIONS_COLLECTION || "conversations";

export async function PUT(req) {
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
    const conversationId = body?.conversation_id;
    const conversation = Array.isArray(body?.conversation)
      ? body.conversation
      : [];
    const user = body?.user || null;
    const metadata = body?.metadata || {};
    const source = body?.source || "widget";

    if (!conversationId) {
      return NextResponse.json(
        {error: "Missing conversation_id in body."},
        {status: 400}
      );
    }

    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(MONGODB_DB);
    const collection = db.collection(CONVERSATIONS_COLLECTION);

    const update = {
      $set: {
        metadata,
        source,
        updated_at: new Date(),
      },
    };

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
      return NextResponse.json(
        {error: "Conversation not found."},
        {status: 404}
      );
    }

    return NextResponse.json({ok: true});
  } catch (error) {
    console.error("Conversation update error:", error);
    return NextResponse.json(
      {error: "Failed to update conversation"},
      {status: 500}
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}
