import {NextResponse} from "next/server";

import {requireAdminApi} from "@/app/lib/adminAuth";
import {getDb} from "@/app/lib/mongo";

export const runtime = "nodejs";

const CHATBOT_COLLECTION = process.env.MONGODB_CHATBOT_COLLECTION || "chatbot";

const DEFAULT_OWNER_PROFILE = {
  type: "person",
  first_name: "Jon",
  last_name: "Krostewitz",
  company_name: "",
};

const DEFAULT_AGENT = {
  name: "Michaela",
  owner_profile: DEFAULT_OWNER_PROFILE,
  avatar: "/avatars/Michelle_Intro.mp4",
  primary_color: "#6e26f5",
  secondary_color: "#0e273d",
  button_color: "#6e26f5",
  greeting: [
    {lang: "en", text: "Hi there, I am Michaela!"},
    {lang: "de", text: "Hallo, Michaela hier!"},
    {lang: "it", text: "Ciao, sono Michaela."},
  ],
  starting_message: [
    {
      lang: "en",
      text: "Hi {{FName}}, I am Michaela, the AI assistant for Jon. How can I help today?",
    },
    {
      lang: "de",
      text: "Hallo {{FName}}, ich bin die KI Assistentin von Jon. Wie kann ich dir heute helfen?",
    },
    {lang: "it", text: "Ciao, {{FName}}, come posso aiutarti oggi?"},
  ],
};

function cleanString(value) {
  return String(value || "").trim();
}

function normalizeLocalizedEntries(value, fallback) {
  const entries = Array.isArray(value) ? value : fallback;

  return entries
    .map((entry) => ({
      lang: cleanString(entry?.lang).toLowerCase().slice(0, 2),
      text: cleanString(entry?.text),
    }))
    .filter((entry) => entry.lang && entry.text);
}

function normalizeOwnerProfile(value = {}) {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const type = source.type === "company" ? "company" : "person";

  return {
    type,
    first_name: cleanString(source.first_name || source.firstName),
    last_name: cleanString(source.last_name || source.lastName),
    company_name: cleanString(
      source.company_name || source.companyName || source.company,
    ),
  };
}

function mergeAgentDefaults(doc = {}) {
  return {
    ...DEFAULT_AGENT,
    ...(doc || {}),
    owner_profile: normalizeOwnerProfile(doc?.owner_profile),
  };
}

function normalizeAgent(input = {}) {
  return {
    name: cleanString(input.name) || DEFAULT_AGENT.name,
    owner_profile: normalizeOwnerProfile(input.owner_profile),
    avatar: cleanString(input.avatar) || DEFAULT_AGENT.avatar,
    primary_color:
      cleanString(input.primary_color) || DEFAULT_AGENT.primary_color,
    secondary_color:
      cleanString(input.secondary_color) || DEFAULT_AGENT.secondary_color,
    button_color: cleanString(input.button_color) || DEFAULT_AGENT.button_color,
    greeting: normalizeLocalizedEntries(input.greeting, DEFAULT_AGENT.greeting),
    starting_message: normalizeLocalizedEntries(
      input.starting_message,
      DEFAULT_AGENT.starting_message,
    ),
  };
}

export async function GET(request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  try {
    const db = await getDb();
    const doc = await db
      .collection(CHATBOT_COLLECTION)
      .findOne(
        {},
        {projection: {_id: 0}, sort: {updatedAt: -1, createdAt: -1}},
      );

    return NextResponse.json({agent: mergeAgentDefaults(doc)});
  } catch (error) {
    console.error("Admin agent GET error:", error);
    return NextResponse.json(
      {error: "Unable to load agent profile."},
      {status: 500},
    );
  }
}

export async function PUT(request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const agent = normalizeAgent(body);
    const db = await getDb();
    const collection = db.collection(CHATBOT_COLLECTION);
    const existing = await collection.findOne(
      {},
      {projection: {_id: 1}, sort: {updatedAt: -1, createdAt: -1}},
    );
    const now = new Date();

    if (existing?._id) {
      await collection.updateOne(
        {_id: existing._id},
        {$set: {...agent, updatedAt: now}},
      );
    } else {
      await collection.insertOne({
        _id: "default",
        ...agent,
        createdAt: now,
        updatedAt: now,
      });
    }

    return NextResponse.json({agent});
  } catch (error) {
    console.error("Admin agent PUT error:", error);
    return NextResponse.json(
      {error: "Unable to save agent profile."},
      {status: 500},
    );
  }
}
