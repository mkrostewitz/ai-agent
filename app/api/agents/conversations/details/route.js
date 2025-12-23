import {NextResponse} from "next/server";
import {MongoClient} from "mongodb";

const CONVERSATIONS_COLLECTION =
  process.env.MONGODB_CONVERSATIONS_COLLECTION || "conversations";

export async function GET(req) {
  let client;
  try {
    const {MONGODB_URI, MONGODB_DB} = process.env;
    if (!MONGODB_URI || !MONGODB_DB) {
      return NextResponse.json(
        {error: "Missing MongoDB config. Set MONGODB_URI and MONGODB_DB."},
        {status: 500}
      );
    }

    const url = new URL(req.url);
    const conversationId = url.searchParams.get("conversation_id");
    if (!conversationId) {
      return NextResponse.json(
        {error: "Missing conversation_id query param."},
        {status: 400}
      );
    }

    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(MONGODB_DB);
    const collection = db.collection(CONVERSATIONS_COLLECTION);

    const doc = await collection.findOne(
      {conversation_id: conversationId},
      {projection: {_id: 0}}
    );

    if (!doc) {
      return NextResponse.json(
        {error: "Conversation not found."},
        {status: 404}
      );
    }

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error("Conversation details error:", error);
    return NextResponse.json(
      {error: "Failed to load conversation"},
      {status: 500}
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}
