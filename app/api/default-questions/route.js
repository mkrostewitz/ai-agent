import {NextResponse} from "next/server";
import {MongoClient} from "mongodb";

const FALLBACK_LOCALE = process.env.I18N_FALLBACK_LOCALE || "en";

export async function GET(req) {
  let client;
  try {
    const url = new URL(req.url);
    const requestedLocale =
      url.searchParams.get("locale")?.toLowerCase() || FALLBACK_LOCALE;

    const {
      MONGODB_URI,
      MONGODB_DB,
      MONGODB_DEFAULT_QUESTIONS_COLLECTION = "defaultQuestions",
    } = process.env;

    if (!MONGODB_URI || !MONGODB_DB) {
      return NextResponse.json(
        {error: "Missing MongoDB config. Set MONGODB_URI and MONGODB_DB."},
        {status: 500}
      );
    }

    client = new MongoClient(MONGODB_URI);
    await client.connect();

    const db = client.db(MONGODB_DB);
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

    return NextResponse.json({questions, locale: requestedLocale});
  } catch (error) {
    console.error("Failed to load default questions:", error);
    return NextResponse.json(
      {error: "Failed to load default questions"},
      {status: 500}
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}
