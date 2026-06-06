import {NextResponse} from "next/server";

import {requireAdminApi} from "@/app/lib/adminAuth";
import {getDb} from "@/app/lib/mongo";

export const runtime = "nodejs";

const CONVERSATIONS_COLLECTION =
  process.env.MONGODB_CONVERSATIONS_COLLECTION || "conversations";

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serializeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function serializeMessage(message = {}) {
  return {
    role: message.role === "assistant" ? "assistant" : "user",
    message: typeof message.message === "string" ? message.message : "",
  };
}

function serializeConversation(doc = {}) {
  const messages = Array.isArray(doc.messages)
    ? doc.messages.map(serializeMessage)
    : [];
  const tracking = doc.tracking || doc.metadata?.tracking || {};
  const user = doc.user || {};

  return {
    id: doc.conversation_id || String(doc._id || ""),
    conversation_id: doc.conversation_id || String(doc._id || ""),
    status: doc.status || "open",
    source: doc.source || "widget",
    user,
    metadata: doc.metadata || {},
    tracking,
    messages,
    messageCount: messages.length,
    preview:
      [...messages]
        .reverse()
        .find((message) => message.message.trim())?.message.slice(0, 180) || "",
    notes: doc.notes || "",
    actions: Array.isArray(doc.actions) ? doc.actions : [],
    created_at: serializeDate(doc.created_at || doc.createdAt),
    updated_at: serializeDate(doc.updated_at || doc.updatedAt),
  };
}

export async function GET(request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  try {
    const {searchParams} = new URL(request.url);
    const status = searchParams.get("status") || "";
    const q = searchParams.get("q") || "";
    const limit = Math.min(
      Math.max(Number(searchParams.get("limit") || 100), 1),
      300
    );
    const query = {};

    if (status) query.status = status;

    if (q.trim()) {
      const regex = new RegExp(escapeRegex(q.trim()), "i");
      query.$or = [
        {"user.name": regex},
        {"user.email": regex},
        {"user.phone": regex},
        {"user.company": regex},
        {"user.address": regex},
        {"user.address_line1": regex},
        {"user.address_line2": regex},
        {"user.city": regex},
        {"user.region": regex},
        {"user.postal_code": regex},
        {"user.country": regex},
        {"messages.message": regex},
        {conversation_id: regex},
      ];
    }

    const db = await getDb();
    const docs = await db
      .collection(CONVERSATIONS_COLLECTION)
      .find(query)
      .sort({updated_at: -1, created_at: -1})
      .limit(limit)
      .toArray();

    const conversations = docs.map(serializeConversation);
    const counts = await db
      .collection(CONVERSATIONS_COLLECTION)
      .aggregate([
        {$group: {_id: {$ifNull: ["$status", "open"]}, count: {$sum: 1}}},
      ])
      .toArray();

    return NextResponse.json({
      conversations,
      counts: counts.reduce(
        (acc, item) => ({...acc, [item._id || "open"]: item.count}),
        {}
      ),
    });
  } catch (error) {
    console.error("Admin conversations GET error:", error);
    return NextResponse.json(
      {error: "Unable to load conversations."},
      {status: 500}
    );
  }
}
