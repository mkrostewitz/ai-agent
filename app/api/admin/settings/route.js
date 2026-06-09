import {NextResponse} from "next/server";

import {requireAdminApi} from "@/app/lib/adminAuth";
import {getDb} from "@/app/lib/mongo";
import {
  DEFAULT_REGISTRATION_SETTINGS,
  normalizeRegistrationSettings,
} from "@/app/lib/registrationSettings";

export const runtime = "nodejs";

const SETTINGS_COLLECTION =
  process.env.MONGODB_SETTINGS_COLLECTION || "settings";

const DEFAULT_SETTINGS = {
  instruction: "",
  model: process.env.OLLAMA_MODEL || "phi3:mini",
  namespace: "",
  response_language: "",
  retrieval_k: Number(process.env.RAG_TOP_K || 6),
  temperature: 0.3,
  top_k: 40,
  top_p: 0.9,
  max_tokens: 2000,
  registration: DEFAULT_REGISTRATION_SETTINGS,
};

function cleanString(value) {
  return String(value || "").trim();
}

function finiteNumber(value, fallback, options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;

  const min = Number.isFinite(options.min) ? options.min : -Infinity;
  const max = Number.isFinite(options.max) ? options.max : Infinity;
  return Math.min(Math.max(number, min), max);
}

function normalizeSettings(input = {}) {
  return {
    instruction: String(input.instruction || ""),
    model: cleanString(input.model) || DEFAULT_SETTINGS.model,
    namespace: cleanString(input.namespace),
    response_language: cleanString(input.response_language),
    retrieval_k: Math.round(
      finiteNumber(input.retrieval_k, DEFAULT_SETTINGS.retrieval_k, {
        min: 1,
        max: 20,
      }),
    ),
    temperature: finiteNumber(input.temperature, DEFAULT_SETTINGS.temperature, {
      min: 0,
      max: 2,
    }),
    top_k: Math.round(
      finiteNumber(input.top_k, DEFAULT_SETTINGS.top_k, {min: 1, max: 200}),
    ),
    top_p: finiteNumber(input.top_p, DEFAULT_SETTINGS.top_p, {min: 0, max: 1}),
    max_tokens: Math.round(
      finiteNumber(input.max_tokens, DEFAULT_SETTINGS.max_tokens, {
        min: 128,
        max: 12000,
      }),
    ),
    registration: normalizeRegistrationSettings(input.registration),
  };
}

export async function GET(request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  try {
    const db = await getDb();
    const doc = await db
      .collection(SETTINGS_COLLECTION)
      .findOne(
        {},
        {projection: {_id: 0}, sort: {updatedAt: -1, createdAt: -1}},
      );

    return NextResponse.json({
      settings: {
        ...DEFAULT_SETTINGS,
        ...(doc || {}),
        registration: normalizeRegistrationSettings(doc?.registration),
      },
    });
  } catch (error) {
    console.error("Admin settings GET error:", error);
    return NextResponse.json(
      {error: "Unable to load settings."},
      {status: 500},
    );
  }
}

export async function PUT(request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const settings = normalizeSettings(body);
    const db = await getDb();
    const collection = db.collection(SETTINGS_COLLECTION);
    const existing = await collection.findOne(
      {},
      {projection: {_id: 1}, sort: {updatedAt: -1, createdAt: -1}},
    );
    const now = new Date();

    if (existing?._id) {
      await collection.updateOne(
        {_id: existing._id},
        {$set: {...settings, updatedAt: now}},
      );
    } else {
      await collection.insertOne({
        _id: "default",
        ...settings,
        createdAt: now,
        updatedAt: now,
      });
    }

    return NextResponse.json({settings});
  } catch (error) {
    console.error("Admin settings PUT error:", error);
    return NextResponse.json(
      {error: "Unable to save settings."},
      {status: 500},
    );
  }
}
