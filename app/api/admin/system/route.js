import {NextResponse} from "next/server";

import {getIntegrationsConfig, updateIntegrationsConfig} from "@/app/lib/appConfig";
import {requireAdminApi} from "@/app/lib/adminAuth";
import {getMailDeliveryStatus} from "@/app/lib/mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function tokenPreview(token) {
  const text = String(token || "").trim();
  if (!text) return "";
  return text.length <= 4 ? "set" : `...${text.slice(-4)}`;
}

async function integrationsResponse(token) {
  return {
    integrations: {
      ipInfoConfigured: Boolean(token),
      ipInfoTokenPreview: tokenPreview(token),
      mail: await getMailDeliveryStatus(),
    },
  };
}

export async function GET(request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  try {
    const config = await getIntegrationsConfig();
    const token = config?.ipInfoToken || "";

    return NextResponse.json(await integrationsResponse(token));
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

    const updatePayload = {};

    if (typeof nextToken === "string") {
      updatePayload.ipInfoToken = nextToken;
    }

    if (body.mail && typeof body.mail === "object" && !Array.isArray(body.mail)) {
      updatePayload.mail = body.mail;
    }

    const config = Object.keys(updatePayload).length
      ? await updateIntegrationsConfig(updatePayload)
      : await getIntegrationsConfig();
    const token = config?.ipInfoToken || "";

    return NextResponse.json(await integrationsResponse(token));
  } catch (error) {
    console.error("Admin system PUT error:", error);
    return NextResponse.json(
      {error: "Unable to save system configuration."},
      {status: 500}
    );
  }
}
