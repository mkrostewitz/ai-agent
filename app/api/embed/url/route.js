import {NextResponse} from "next/server";

import {requireAdminApi} from "@/app/lib/adminAuth";
import {indexWebsiteUrls} from "@/app/lib/webKnowledgeIndexer";

import {urlEmbedRequestSchema} from "../validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req) {
  const auth = await requireAdminApi(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = urlEmbedRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {error: "Invalid request parameters", detail: parsed.error.format()},
        {status: 400}
      );
    }

    console.log("[mongo] Connected: /api/embed/url");
    const result = await indexWebsiteUrls(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Web embedding error:", error);
    return NextResponse.json(
      {error: error.message || "Failed to embed URL content"},
      {status: 500}
    );
  }
}
