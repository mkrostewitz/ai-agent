import {NextResponse} from "next/server";

import {getIntegrationsConfig, updateIntegrationsConfig} from "@/app/lib/appConfig";
import {requireAdminApi} from "@/app/lib/adminAuth";
import {getMailDeliveryStatus} from "@/app/lib/mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function secretPreview(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length <= 4 ? "set" : `...${text.slice(-4)}`;
}

async function integrationsResponse(config = {}) {
  const apiKey = String(config?.ipGeolocationApiKey || "").trim();
  const mapboxToken = String(config?.mapboxToken || "").trim();

  return {
    integrations: {
      ipGeolocationConfigured: Boolean(apiKey),
      ipGeolocationApiKeyPreview: secretPreview(apiKey),
      mapboxConfigured: Boolean(mapboxToken),
      mapboxToken,
      mapboxTokenPreview: secretPreview(mapboxToken),
      mail: await getMailDeliveryStatus(),
    },
  };
}

export async function GET(request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;

  try {
    const config = await getIntegrationsConfig();

    return NextResponse.json(await integrationsResponse(config));
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
    const nextApiKey = body.clearIpGeolocationApiKey
      ? ""
      : typeof body.ipGeolocationApiKey === "string"
      ? body.ipGeolocationApiKey
      : undefined;
    const nextMapboxToken = body.clearMapboxToken
      ? ""
      : typeof body.mapboxToken === "string"
      ? body.mapboxToken
      : undefined;

    const updatePayload = {};

    if (typeof nextApiKey === "string") {
      updatePayload.ipGeolocationApiKey = nextApiKey;
    }

    if (typeof nextMapboxToken === "string") {
      updatePayload.mapboxToken = nextMapboxToken;
    }

    if (body.mail && typeof body.mail === "object" && !Array.isArray(body.mail)) {
      updatePayload.mail = body.mail;
    }

    const config = Object.keys(updatePayload).length
      ? await updateIntegrationsConfig(updatePayload)
      : await getIntegrationsConfig();

    return NextResponse.json(await integrationsResponse(config));
  } catch (error) {
    console.error("Admin system PUT error:", error);
    return NextResponse.json(
      {error: "Unable to save system configuration."},
      {status: 500}
    );
  }
}
