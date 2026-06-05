import {NextResponse} from "next/server";
import {randomUUID} from "crypto";

import {requireAdminApi} from "@/app/lib/adminAuth";
import {getDb} from "@/app/lib/mongo";

export const runtime = "nodejs";

const CONVERSATIONS_COLLECTION =
  process.env.MONGODB_CONVERSATIONS_COLLECTION || "conversations";
const STATUSES = new Set(["open", "reviewing", "qualified", "closed", "spam"]);
const ACTION_TYPES = new Set([
  "follow_up",
  "call",
  "email",
  "meeting",
  "qualification",
  "note",
]);

function cleanString(value) {
  return String(value || "").trim();
}

export async function PATCH(request, {params}) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  try {
    const conversationId = cleanString(params.conversationId);
    const body = await request.json().catch(() => ({}));
    const status = cleanString(body.status);
    const notes = typeof body.notes === "string" ? body.notes : undefined;
    const actionText = cleanString(body.actionText);
    const actionType = cleanString(body.actionType) || "follow_up";
    const update = {
      $set: {
        updated_at: new Date(),
      },
    };

    if (status) {
      if (!STATUSES.has(status)) {
        return NextResponse.json({error: "Invalid status."}, {status: 400});
      }
      update.$set.status = status;
    }

    if (typeof notes === "string") {
      update.$set.notes = notes;
    }

    if (actionText) {
      if (!ACTION_TYPES.has(actionType)) {
        return NextResponse.json({error: "Invalid action type."}, {status: 400});
      }

      update.$push = {
        actions: {
          $each: [
            {
              id: randomUUID(),
              type: actionType,
              text: actionText,
              createdAt: new Date(),
              createdBy: auth.user.email,
            },
          ],
          $position: 0,
        },
      };
    }

    const db = await getDb();
    const result = await db
      .collection(CONVERSATIONS_COLLECTION)
      .updateOne({conversation_id: conversationId}, update);

    if (result.matchedCount === 0) {
      return NextResponse.json(
        {error: "Conversation not found."},
        {status: 404}
      );
    }

    return NextResponse.json({ok: true});
  } catch (error) {
    console.error("Admin conversation PATCH error:", error);
    return NextResponse.json(
      {error: "Unable to update conversation."},
      {status: 500}
    );
  }
}

export async function DELETE(request, {params}) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  try {
    const conversationId = cleanString(params.conversationId);
    const db = await getDb();
    const result = await db
      .collection(CONVERSATIONS_COLLECTION)
      .deleteOne({conversation_id: conversationId});

    if (result.deletedCount === 0) {
      return NextResponse.json(
        {error: "Conversation not found."},
        {status: 404}
      );
    }

    return NextResponse.json({ok: true});
  } catch (error) {
    console.error("Admin conversation DELETE error:", error);
    return NextResponse.json(
      {error: "Unable to delete conversation."},
      {status: 500}
    );
  }
}
