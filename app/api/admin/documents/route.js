import {NextResponse} from "next/server";

import {requireAdminApi} from "@/app/lib/adminAuth";
import {getDb} from "@/app/lib/mongo";

export const runtime = "nodejs";

const EMBEDDINGS_COLLECTION =
  process.env.MONGODB_DEFAULT_EMBEDDING_COLLECTION ||
  process.env.MONGODB_COLLECTION ||
  "embeddings";

function cleanString(value) {
  return String(value || "").trim();
}

function sourceType(source = "") {
  const text = String(source).toLowerCase();
  if (text.startsWith("http://") || text.startsWith("https://")) return "website";
  if (text.endsWith(".pdf")) return "pdf";
  return "document";
}

export async function GET(request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  try {
    const db = await getDb();
    const documents = await db
      .collection(EMBEDDINGS_COLLECTION)
      .aggregate([
        {
          $group: {
            _id: {
              namespace: {
                $ifNull: ["$metadata.namespace", {$ifNull: ["$namespace", ""]}],
              },
              source: {
                $ifNull: ["$metadata.source", {$ifNull: ["$source", ""]}],
              },
            },
            chunks: {$sum: 1},
            firstIndexedAt: {$min: {$ifNull: ["$createdAt", "$metadata.indexedAt"]}},
            lastIndexedAt: {$max: {$ifNull: ["$createdAt", "$metadata.indexedAt"]}},
            title: {$first: "$metadata.title"},
          },
        },
        {$sort: {"_id.namespace": 1, "_id.source": 1}},
      ])
      .toArray();

    return NextResponse.json({
      documents: documents.map((doc) => {
        const namespace = doc._id.namespace || "default";
        const source = doc._id.source || "unknown";

        return {
          id: `${namespace}:${source}`,
          namespace,
          source,
          title: doc.title || "",
          type: sourceType(source),
          chunks: doc.chunks || 0,
          firstIndexedAt: doc.firstIndexedAt || null,
          lastIndexedAt: doc.lastIndexedAt || null,
        };
      }),
    });
  } catch (error) {
    console.error("Admin documents GET error:", error);
    return NextResponse.json(
      {error: "Unable to load documents."},
      {status: 500}
    );
  }
}

export async function DELETE(request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const namespace = cleanString(body.namespace);
    const source = cleanString(body.source);

    if (!namespace || !source) {
      return NextResponse.json(
        {error: "namespace and source are required."},
        {status: 400}
      );
    }

    const db = await getDb();
    const result = await db.collection(EMBEDDINGS_COLLECTION).deleteMany({
      $and: [
        {$or: [{namespace}, {"metadata.namespace": namespace}]},
        {$or: [{source}, {"metadata.source": source}]},
      ],
    });

    return NextResponse.json({deleted: result.deletedCount});
  } catch (error) {
    console.error("Admin documents DELETE error:", error);
    return NextResponse.json(
      {error: "Unable to delete document."},
      {status: 500}
    );
  }
}
