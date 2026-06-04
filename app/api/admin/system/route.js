import {NextResponse} from "next/server";

import {getIntegrationsConfig, updateIntegrationsConfig} from "@/app/lib/appConfig";
import {requireAdminApi} from "@/app/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function tokenPreview(token) {
  const text = String(token || "").trim();
  if (!text) return "";
  return text.length <= 4 ? "set" : `...${text.slice(-4)}`;
}

export async function GET(request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  try {
    const config = await getIntegrationsConfig();
    const token = config?.ipInfoToken || "";

    return NextResponse.json({
      integrations: {
        ipInfoConfigured: Boolean(token),
        ipInfoTokenPreview: tokenPreview(token),
      },
    });
  } catch (error) {
    console.error("Admin system GET error:", error);
    return NextResponse.json(
      {error: "Unable to load system configuration."},
      {status: 500}
    );
  }
}

export async function PUT(request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const nextToken = body.clearIpInfoToken
      ? ""
      : typeof body.ipInfoToken === "string"
      ? body.ipInfoToken
      : undefined;

    if (typeof nextToken !== "string") {
      const config = await getIntegrationsConfig();
      const token = config?.ipInfoToken || "";

      return NextResponse.json({
        integrations: {
          ipInfoConfigured: Boolean(token),
          ipInfoTokenPreview: tokenPreview(token),
        },
      });
    }

    const config = await updateIntegrationsConfig({ipInfoToken: nextToken});
    const token = config?.ipInfoToken || "";

    return NextResponse.json({
      integrations: {
        ipInfoConfigured: Boolean(token),
        ipInfoTokenPreview: tokenPreview(token),
      },
    });
  } catch (error) {
    console.error("Admin system PUT error:", error);
    return NextResponse.json(
      {error: "Unable to save system configuration."},
      {status: 500}
    );
  }
}
