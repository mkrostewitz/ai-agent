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
const CHATBOT_COLLECTION = process.env.MONGODB_CHATBOT_COLLECTION || "chatbot";

function cleanString(value) {
  return String(value || "").trim();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeOwnerProfile(value = {}) {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const type = source.type === "company" ? "company" : "person";
  const firstName = cleanString(source.first_name || source.firstName);
  const lastName = cleanString(source.last_name || source.lastName);
  const companyName = cleanString(
    source.company_name || source.companyName || source.company
  );
  const fullName =
    type === "company"
      ? companyName || cleanString(source.fullName || source.name)
      : [firstName, lastName].filter(Boolean).join(" ") ||
        cleanString(source.fullName) ||
        cleanString(source.name) ||
        companyName;

  return {
    type,
    firstName,
    lastName,
    companyName,
    fullName,
  };
}

function renderOwnerProfileTemplate(template, ownerProfile = {}) {
  let text = String(template || "");
  const owner = normalizeOwnerProfile(ownerProfile);
  const fields = [
    {
      aliases: ["OwnerName", "ownerName", "owner_name", "AgentOwnerName"],
      value: owner.fullName,
    },
    {
      aliases: [
        "OwnerFirstName",
        "ownerFirstName",
        "owner_first_name",
        "AgentOwnerFirstName",
      ],
      value: owner.firstName,
    },
    {
      aliases: [
        "OwnerLastName",
        "ownerLastName",
        "owner_last_name",
        "AgentOwnerLastName",
      ],
      value: owner.lastName,
    },
    {
      aliases: [
        "OwnerCompany",
        "OwnerCompanyName",
        "ownerCompany",
        "owner_company",
        "ownerCompanyName",
        "company_name",
      ],
      value: owner.companyName,
    },
  ];

  fields.forEach((field) => {
    const aliases = field.aliases.map(escapeRegExp).join("|");
    const pattern = new RegExp(`\\{\\{\\s*(?:${aliases})\\s*\\}\\}`, "gi");
    text = text.replace(pattern, field.value);
  });

  return text.replace(/[ \t]{2,}/g, " ").trim();
}

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
    const chatbotCollection = db.collection(CHATBOT_COLLECTION);

    const [docs, chatbot] = await Promise.all([
      collection
        .find(
          {active: {$ne: false}},
          {
            projection: {question: 1, order: 1, translations: 1},
          }
        )
        .sort({order: 1, _id: 1})
        .toArray(),
      chatbotCollection.findOne(
        {},
        {
          projection: {_id: 0, owner_profile: 1},
          sort: {updatedAt: -1, createdAt: -1},
        }
      ),
    ]);
    const ownerProfile = normalizeOwnerProfile(chatbot?.owner_profile);

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
      .map((q) => renderOwnerProfileTemplate(q, ownerProfile))
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
