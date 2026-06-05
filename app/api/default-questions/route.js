import {NextResponse} from "next/server";
import {
  createMongoClient,
  getMongoDbName,
  hasMongoConfig,
} from "@/app/lib/mongo";
import {widgetOptionsResponse, withWidgetCors} from "../agents/cors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FALLBACK_LOCALE = process.env.I18N_FALLBACK_LOCALE || "en";

export function OPTIONS() {
  return widgetOptionsResponse();
}

export async function GET(req) {
  let client;
  try {
    const url = new URL(req.url);
    const requestedLocale =
      url.searchParams.get("locale")?.toLowerCase() || FALLBACK_LOCALE;

    const {
      MONGODB_DEFAULT_QUESTIONS_COLLECTION = "defaultQuestions",
    } = process.env;

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
    console.log("[mongo] Connected: /api/default-questions");

    const db = client.db(getMongoDbName());
    const collection = db.collection(MONGODB_DEFAULT_QUESTIONS_COLLECTION);

    const docs = await collection
      .find(
        {active: {$ne: false}},
        {
          projection: {question: 1, order: 1, translations: 1},
        }
      )
      .sort({order: 1, _id: 1})
      .toArray();

    const questions = docs
      .map((doc) => {
        if (doc?.translations && typeof doc.translations === "object") {
          return (
            doc.translations[requestedLocale] ||
            doc.translations[FALLBACK_LOCALE] ||
            ""
          );
        }
        if (typeof doc?.question === "string") {
          return doc.question;
        }
        return "";
      })
      .map((q) => (typeof q === "string" ? q.trim() : ""))
      .filter(Boolean);

    return withWidgetCors(
      NextResponse.json({questions, locale: requestedLocale})
    );
  } catch (error) {
    console.error("Failed to load default questions:", error);
    return withWidgetCors(
      NextResponse.json(
        {error: "Failed to load default questions"},
        {status: 500}
      )
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}
