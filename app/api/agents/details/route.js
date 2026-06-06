import {NextResponse} from "next/server";
import {
  createMongoClient,
  getMongoDbName,
  hasMongoConfig,
} from "@/app/lib/mongo";
import {getRequestTracking} from "@/app/lib/requestGeo";
import {normalizeRegistrationSettings} from "@/app/lib/registrationSettings";
import {widgetOptionsResponse, withWidgetCors} from "../cors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHATBOT_COLLECTION =
  process.env.MONGODB_CHATBOT_COLLECTION || "chatbot";
const SETTINGS_COLLECTION =
  process.env.MONGODB_SETTINGS_COLLECTION || "settings";
const CONFIG_COLLECTION = "app_config";
const INTEGRATIONS_CONFIG_ID = "integrations";

export function OPTIONS() {
  return widgetOptionsResponse();
}

function publicTrackingPayload(tracking = {}) {
  return {
    countryCode: String(tracking.countryCode || "").trim().toUpperCase(),
    latitude: tracking.latitude || "",
    longitude: tracking.longitude || "",
  };
}

export async function GET(request) {
  let client;
  try {
    if (!hasMongoConfig()) {
      return withWidgetCors(
        NextResponse.json(
          {error: "Missing MongoDB config. Set MONGODB_URI and MONGODB_DB."},
          {status: 500}
        )
      );
    }

    client = createMongoClient();
    await client.connect();
    console.log("[mongo] Connected: /api/agents/details");

    const db = client.db(getMongoDbName());
    const collection = db.collection(CHATBOT_COLLECTION);
    const settingsCollection = db.collection(SETTINGS_COLLECTION);
    const configCollection = db.collection(CONFIG_COLLECTION);

    // Single-agent app: grab the first document
    const [chatbot, settings, integrations] = await Promise.all([
      collection.findOne({}, {projection: {_id: 0}}),
      settingsCollection.findOne(
        {},
        {
          projection: {_id: 0, registration: 1},
          sort: {updatedAt: -1, createdAt: -1},
        }
      ),
      configCollection.findOne(
        {_id: INTEGRATIONS_CONFIG_ID},
        {projection: {_id: 0, mapboxToken: 1}}
      ),
    ]);

    if (!chatbot) {
      return withWidgetCors(
        NextResponse.json(
          {error: "No chatbot document found in MongoDB."},
          {status: 404}
        )
      );
    }

    const [tracking] = await Promise.all([getRequestTracking(request)]);
    const name = chatbot.name || "Chatbot";

    return withWidgetCors(
      NextResponse.json({
        data: {
          chatbot,
          agent: {name},
          settings: {
            registration: normalizeRegistrationSettings(settings?.registration),
            mapboxToken: String(integrations?.mapboxToken || "").trim(),
          },
          tracking: publicTrackingPayload(tracking),
        },
      })
    );
  } catch (error) {
    console.error("Failed to load chatbot details:", error);
    return withWidgetCors(
      NextResponse.json(
        {error: "Failed to load chatbot details"},
        {status: 500}
      )
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}
