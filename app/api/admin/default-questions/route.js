import {ObjectId} from "mongodb";
import {NextResponse} from "next/server";

import {requireAdminApi} from "@/app/lib/adminAuth";
import {getDb} from "@/app/lib/mongo";

export const runtime = "nodejs";

const DEFAULT_QUESTIONS_COLLECTION =
  process.env.MONGODB_DEFAULT_QUESTIONS_COLLECTION || "defaultQuestions";
const FALLBACK_LOCALE = process.env.I18N_FALLBACK_LOCALE || "en";
const SUPPORTED_LOCALES = ["en", "de", "it"];

function cleanString(value) {
  return String(value || "").trim();
}

function toMongoId(value) {
  const id = cleanString(value);
  if (!id) return null;

  if (ObjectId.isValid(id) && String(new ObjectId(id)) === id) {
    return new ObjectId(id);
  }

  return id;
}

function normalizeTranslations(value = {}, fallbackQuestion = "") {
  const source = value && typeof value === "object" ? value : {};
  const translations = {};

  SUPPORTED_LOCALES.forEach((locale) => {
    const text = cleanString(source[locale]);
    if (text) translations[locale] = text;
  });

  const fallbackText = cleanString(fallbackQuestion);
  if (!Object.keys(translations).length && fallbackText) {
    translations[FALLBACK_LOCALE] = fallbackText;
  }

  return translations;
}

function serializePrompt(doc) {
  return {
    id: String(doc._id),
    active: doc.active !== false,
    order: Number.isFinite(Number(doc.order)) ? Number(doc.order) : 0,
    translations: normalizeTranslations(doc.translations, doc.question),
  };
}

function normalizePromptInput(prompt, index) {
  const translations = normalizeTranslations(prompt?.translations, prompt?.question);
  if (!Object.keys(translations).length) return null;

  return {
    id: cleanString(prompt?.id),
    active: prompt?.active !== false,
    order: index + 1,
    translations,
  };
}

async function loadPrompts(collection) {
  const docs = await collection
    .find({}, {projection: {active: 1, order: 1, question: 1, translations: 1}})
    .sort({order: 1, _id: 1})
    .toArray();

  return docs.map(serializePrompt);
}

export async function GET(request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  try {
    const db = await getDb();
    const collection = db.collection(DEFAULT_QUESTIONS_COLLECTION);
    const prompts = await loadPrompts(collection);

    return NextResponse.json({prompts});
  } catch (error) {
    console.error("Admin default questions GET error:", error);
    return NextResponse.json(
      {error: "Unable to load chat prompts."},
      {status: 500}
    );
  }
}

export async function PUT(request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const inputPrompts = Array.isArray(body.prompts) ? body.prompts : [];
    const prompts = inputPrompts
      .map(normalizePromptInput)
      .filter(Boolean);
    const db = await getDb();
    const collection = db.collection(DEFAULT_QUESTIONS_COLLECTION);
    const existingDocs = await collection
      .find({}, {projection: {_id: 1}})
      .toArray();
    const existingIds = new Set(existingDocs.map((doc) => String(doc._id)));
    const retainedIds = new Set();
    const now = new Date();

    for (const prompt of prompts) {
      const mongoId = toMongoId(prompt.id);
      const payload = {
        active: prompt.active,
        order: prompt.order,
        translations: prompt.translations,
        updatedAt: now,
      };

      if (mongoId && existingIds.has(String(mongoId))) {
        await collection.updateOne(
          {_id: mongoId},
          {$set: payload, $unset: {question: ""}}
        );
        retainedIds.add(String(mongoId));
      } else {
        const result = await collection.insertOne({
          ...payload,
          createdAt: now,
        });
        retainedIds.add(String(result.insertedId));
      }
    }

    const idsToDelete = existingDocs
      .map((doc) => doc._id)
      .filter((id) => !retainedIds.has(String(id)));

    if (idsToDelete.length) {
      await collection.deleteMany({_id: {$in: idsToDelete}});
    }

    const savedPrompts = await loadPrompts(collection);
    return NextResponse.json({prompts: savedPrompts});
  } catch (error) {
    console.error("Admin default questions PUT error:", error);
    return NextResponse.json(
      {error: "Unable to save chat prompts."},
      {status: 500}
    );
  }
}
