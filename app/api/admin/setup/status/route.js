import {NextResponse} from "next/server";

import {isSetupComplete} from "@/app/lib/adminAuth";
import {
  createMongoClient,
  getMongoDbName,
  hasMongoConfig,
  normalizeMongoError,
} from "@/app/lib/mongo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function databaseStatusResponse(database, setup = {}) {
  return NextResponse.json({
    database: {
      checkedAt: new Date().toISOString(),
      ...database,
    },
    setup,
  });
}

function safeDatabaseErrorMessage(error) {
  const normalizedError = normalizeMongoError(error);
  const message = String(normalizedError?.message || "");

  if (message.startsWith("Missing MONGODB_URI")) {
    return "Missing MONGODB_URI.";
  }

  if (message.startsWith("Missing MONGODB_DB")) {
    return "Missing MONGODB_DB.";
  }

  if (message.startsWith("Invalid MONGODB_URI")) {
    return message;
  }

  if (/auth|Authentication failed|bad auth/i.test(message)) {
    return "MongoDB authentication failed. Check MONGO_APP_PASSWORD and the password inside MONGODB_URI.";
  }

  if (
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|server selection|getaddrinfo|timed out|connection/i.test(
      message
    )
  ) {
    return "MongoDB is not reachable from the web container. Check the mongo service and MONGODB_URI host/port.";
  }

  return "Unable to verify the MongoDB connection. Check the web container logs.";
}

export async function GET() {
  if (!hasMongoConfig()) {
    return databaseStatusResponse({
      ok: false,
      status: "missing_config",
      message: "Missing MongoDB config. Set MONGODB_URI and MONGODB_DB.",
    });
  }

  let client;
  const startedAt = Date.now();

  try {
    client = createMongoClient({
      connectTimeoutMS: 2500,
      serverSelectionTimeoutMS: 2500,
    });
    const db = client.db(getMongoDbName());

    await db.command({ping: 1});

    return databaseStatusResponse(
      {
        ok: true,
        status: "connected",
        message: "MongoDB connection is ready.",
        latencyMs: Date.now() - startedAt,
      },
      {
        complete: await isSetupComplete(),
      }
    );
  } catch (error) {
    const message = safeDatabaseErrorMessage(error);
    console.warn("Admin setup database status check failed:", message);

    return databaseStatusResponse({
      ok: false,
      status: "unavailable",
      message,
      latencyMs: Date.now() - startedAt,
    });
  } finally {
    if (client) await client.close();
  }
}
