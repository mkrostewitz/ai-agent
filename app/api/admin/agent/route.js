import {NextResponse} from "next/server";

import {requireAdminApi} from "@/app/lib/adminAuth";
import {getDb} from "@/app/lib/mongo";

export const runtime = "nodejs";

const CHATBOT_COLLECTION = process.env.MONGODB_CHATBOT_COLLECTION || "chatbot";

const DEFAULT_AGENT = {
  name: "Chatbot",
  avatar: "/avatars/Michael_Intro.mp4",
  primary_color: "#6e26f5",
  secondary_color: "#0e273d",
  button_color: "#6e26f5",
  greeting: [
    {lang: "en", text: "Hi there!"},
    {lang: "de", text: "Hallo!"},
    {lang: "it", text: "Ciao!"},
  ],
  starting_message: [
    {lang: "en", text: "How can I help today?"},
    {lang: "de", text: "Wie kann ich heute helfen?"},
    {lang: "it", text: "Come posso aiutarti oggi?"},
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

function normalizeAgent(input = {}) {
  return {
    name: cleanString(input.name) || DEFAULT_AGENT.name,
    avatar: cleanString(input.avatar) || DEFAULT_AGENT.avatar,
    primary_color: cleanString(input.primary_color) || DEFAULT_AGENT.primary_color,
    secondary_color:
      cleanString(input.secondary_color) || DEFAULT_AGENT.secondary_color,
    button_color: cleanString(input.button_color) || DEFAULT_AGENT.button_color,
    greeting: normalizeLocalizedEntries(input.greeting, DEFAULT_AGENT.greeting),
    starting_message: normalizeLocalizedEntries(
      input.starting_message,
      DEFAULT_AGENT.starting_message
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
      .findOne({}, {projection: {_id: 0}, sort: {updatedAt: -1, createdAt: -1}});

    return NextResponse.json({agent: {...DEFAULT_AGENT, ...(doc || {})}});
  } catch (error) {
    console.error("Admin agent GET error:", error);
    return NextResponse.json(
      {error: "Unable to load agent profile."},
      {status: 500}
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
      {projection: {_id: 1}, sort: {updatedAt: -1, createdAt: -1}}
    );
    const now = new Date();

    if (existing?._id) {
      await collection.updateOne(
        {_id: existing._id},
        {$set: {...agent, updatedAt: now}}
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
      {status: 500}
    );
  }
}
