import {NextResponse} from "next/server";
import {
  createMongoClient,
  getMongoDbName,
  hasMongoConfig,
} from "@/app/lib/mongo";
import {widgetOptionsResponse, withWidgetCors} from "../cors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHATBOT_COLLECTION =
  process.env.MONGODB_CHATBOT_COLLECTION || "chatbot";

export function OPTIONS() {
  return widgetOptionsResponse();
}

export async function GET() {
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

    client = createMongoClient();
    await client.connect();
    console.log("[mongo] Connected: /api/agents/details");

    const db = client.db(getMongoDbName());
    const collection = db.collection(CHATBOT_COLLECTION);

    // Single-agent app: grab the first document
    const chatbot = await collection.findOne({}, {projection: {_id: 0}});

    if (!chatbot) {
      return withWidgetCors(
        NextResponse.json(
          {error: "No chatbot document found in MongoDB."},
          {status: 404}
        )
      );
    }

    const name = chatbot.name || "Chatbot";

    return withWidgetCors(
      NextResponse.json({
        data: {
          chatbot,
          agent: {name},
        },
      })
    );
  } catch (error) {
    console.error("Failed to load chatbot details:", error);
    return withWidgetCors(
      NextResponse.json(
        {error: "Failed to load chatbot details"},
        {status: 500}
      )
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}
