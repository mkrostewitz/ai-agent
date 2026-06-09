import {NextResponse} from "next/server";

import {requireAdminApi} from "@/app/lib/adminAuth";
import {getDb} from "@/app/lib/mongo";
import {
  normalizeMessageRole,
  normalizeMessageTokenUsage,
  summarizeMessageTokenUsage,
} from "@/app/lib/tokenUsage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONVERSATIONS_COLLECTION =
  process.env.MONGODB_CONVERSATIONS_COLLECTION || "conversations";

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function serializeDate(value) {
  const date = parseDate(value);
  return date ? date.toISOString() : null;
}

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

function createMonthlyBucket(month) {
  return {
    assistantTokens: 0,
    conversationIds: new Set(),
    estimatedTokens: 0,
    inputTokens: 0,
    messageCount: 0,
    month,
    outputTokens: 0,
    recordedTokens: 0,
    totalTokens: 0,
    userTokens: 0,
  };
}

function addUsageToSummary(summary, usage, role) {
  summary.messageCount += 1;
  summary.totalTokens += usage.total_tokens;
  summary.inputTokens += usage.input_tokens;
  summary.outputTokens += usage.output_tokens;

  if (role === "assistant") {
    summary.assistantTokens += usage.total_tokens;
  } else {
    summary.userTokens += usage.total_tokens;
  }

  if (usage.estimated) {
    summary.estimatedTokens += usage.total_tokens;
  } else {
    summary.recordedTokens += usage.total_tokens;
  }
}

function conversationTitle(doc = {}) {
  const user = doc.user || {};
  return (
    user.name ||
    user.company ||
    user.email ||
    doc.conversation_id ||
    String(doc._id || "") ||
    "Conversation"
  );
}

function roundAverage(total, count) {
  return count > 0 ? Math.round(total / count) : 0;
}

export async function GET(request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  try {
    const db = await getDb();
    const now = new Date();
    const currentMonth = monthKey(now);
    const docs = await db
      .collection(CONVERSATIONS_COLLECTION)
      .find(
        {},
        {
          projection: {
            _id: 1,
            conversation_id: 1,
            createdAt: 1,
            created_at: 1,
            messages: 1,
            source: 1,
            status: 1,
            updatedAt: 1,
            updated_at: 1,
            user: 1,
          },
        }
      )
      .sort({updated_at: -1, created_at: -1})
      .toArray();
    const totals = {
      assistantTokens: 0,
      averageTokensPerConversation: 0,
      averageTokensPerMessage: 0,
      conversationCount: docs.length,
      currentMonthConversationCount: 0,
      currentMonthTokens: 0,
      estimatedTokens: 0,
      inputTokens: 0,
      messageCount: 0,
      outputTokens: 0,
      recordedTokens: 0,
      totalTokens: 0,
      userTokens: 0,
    };
    const monthlyBuckets = new Map();
    const topConversations = [];

    docs.forEach((doc) => {
      const messages = Array.isArray(doc.messages) ? doc.messages : [];
      const createdAt =
        parseDate(doc.created_at || doc.createdAt) ||
        parseDate(doc.updated_at || doc.updatedAt) ||
        now;
      const updatedAt =
        parseDate(doc.updated_at || doc.updatedAt) ||
        parseDate(doc.created_at || doc.createdAt) ||
        now;
      const conversationId = doc.conversation_id || String(doc._id || "");
      const conversationUsage = summarizeMessageTokenUsage(messages);

      totals.messageCount += conversationUsage.messageCount;
      totals.totalTokens += conversationUsage.totalTokens;
      totals.inputTokens += conversationUsage.inputTokens;
      totals.outputTokens += conversationUsage.outputTokens;
      totals.userTokens += conversationUsage.userTokens;
      totals.assistantTokens += conversationUsage.assistantTokens;
      totals.estimatedTokens += conversationUsage.estimatedTokens;
      totals.recordedTokens += conversationUsage.recordedTokens;

      messages.forEach((message) => {
        const usage = normalizeMessageTokenUsage(message);
        const role = normalizeMessageRole(message?.role);
        const messageDate =
          parseDate(message?.created_at || message?.createdAt || message?.timestamp) ||
          createdAt;
        const key = monthKey(messageDate);
        const bucket = monthlyBuckets.get(key) || createMonthlyBucket(key);

        bucket.conversationIds.add(conversationId);
        addUsageToSummary(bucket, usage, role);
        monthlyBuckets.set(key, bucket);
      });

      if (conversationUsage.totalTokens > 0) {
        topConversations.push({
          assistantTokens: conversationUsage.assistantTokens,
          conversation_id: conversationId,
          created_at: serializeDate(createdAt),
          id: conversationId,
          messageCount: conversationUsage.messageCount,
          source: doc.source || "widget",
          status: doc.status || "open",
          title: conversationTitle(doc),
          totalTokens: conversationUsage.totalTokens,
          updated_at: serializeDate(updatedAt),
          userTokens: conversationUsage.userTokens,
        });
      }
    });

    const monthly = [...monthlyBuckets.values()]
      .map(({conversationIds, ...bucket}) => ({
        ...bucket,
        conversationCount: conversationIds.size,
      }))
      .sort((left, right) => left.month.localeCompare(right.month));
    const currentMonthBucket = monthly.find(
      (bucket) => bucket.month === currentMonth
    );

    totals.currentMonthTokens = currentMonthBucket?.totalTokens || 0;
    totals.currentMonthConversationCount =
      currentMonthBucket?.conversationCount || 0;
    totals.averageTokensPerConversation = roundAverage(
      totals.totalTokens,
      totals.conversationCount
    );
    totals.averageTokensPerMessage = roundAverage(
      totals.totalTokens,
      totals.messageCount
    );

    return NextResponse.json({
      generatedAt: now.toISOString(),
      monthly: monthly.slice(-12),
      topConversations: topConversations
        .sort((left, right) => right.totalTokens - left.totalTokens)
        .slice(0, 10),
      totals,
    });
  } catch (error) {
    console.error("Admin token usage GET error:", error);
    return NextResponse.json(
      {error: "Unable to load token usage."},
      {status: 500}
    );
  }
}
