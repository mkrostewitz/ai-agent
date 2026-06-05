import {NextResponse} from "next/server";

import {
  createAdminSession,
  getConfiguredAdmin,
  isSetupComplete,
  isSameOriginRequest,
  setSessionCookie,
  verifyAdminPassword,
} from "@/app/lib/adminAuth";
import {ADMIN_SETUP_PATH} from "@/app/lib/adminRoutes";

export const runtime = "nodejs";

function invalidLogin() {
  return NextResponse.json(
    {error: "Invalid email or password."},
    {status: 401}
  );
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({error: "Invalid request origin."}, {status: 403});
  }

  try {
    if (!(await isSetupComplete())) {
      return NextResponse.json(
        {
          error: "Initial setup is required.",
          setupRequired: true,
          setupUrl: ADMIN_SETUP_PATH,
        },
        {status: 409}
      );
    }

    const {email, password} = await request.json().catch(() => ({}));
    const requestedEmail = String(email || "")
      .trim()
      .toLowerCase();

    const admin = await getConfiguredAdmin(requestedEmail);
    if (!admin || requestedEmail !== admin.email) return invalidLogin();

    const passwordOk = await verifyAdminPassword(password, admin);
    if (!passwordOk) return invalidLogin();

    const session = await createAdminSession(admin);
    const response = NextResponse.json({
      ok: true,
      user: {
        email: admin.email,
        name: admin.name,
      },
    });

    await setSessionCookie(response, session.token);

    return response;
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Admin authentication is not configured correctly.",
      },
      {status: 500}
    );
  }
}
