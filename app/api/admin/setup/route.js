import {NextResponse} from "next/server";

import {
  createAdminSession,
  createInitialSetup,
  isSameOriginRequest,
  isSetupComplete,
  setSessionCookie,
} from "@/app/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({complete: await isSetupComplete()});
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({error: "Invalid request origin."}, {status: 403});
  }

  try {
    if (await isSetupComplete()) {
      return NextResponse.json(
        {error: "Setup is already complete."},
        {status: 409}
      );
    }

    const body = await request.json().catch(() => ({}));
    const user = await createInitialSetup(body);
    const session = await createAdminSession(user);
    const response = NextResponse.json({ok: true, user});

    await setSessionCookie(response, session.token);
    return response;
  } catch (error) {
    return NextResponse.json(
      {error: error?.message || "Unable to complete setup."},
      {status: 400}
    );
  }
}
