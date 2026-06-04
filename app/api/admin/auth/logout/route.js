import {
  clearSessionCookie,
  isSameOriginRequest,
  revokeAdminSessionFromCookie,
} from "@/app/lib/adminAuth";
import {NextResponse} from "next/server";

export const runtime = "nodejs";

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({error: "Invalid request origin."}, {status: 403});
  }

  await revokeAdminSessionFromCookie();
  return clearSessionCookie();
}
