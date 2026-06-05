import {MongoClient} from "mongodb";

let cachedClient = null;
let cachedDb = null;

function cleanString(value) {
  return String(value || "").trim();
}

function isMongoUriParseError(error) {
  const message = cleanString(error?.message);

  return (
    message.includes("Unable to parse") ||
    message.includes("unescaped characters") ||
    message.includes("Invalid scheme") ||
    message.includes("URI malformed")
  );
}

export function normalizeMongoError(error) {
  if (!isMongoUriParseError(error)) {
    return error instanceof Error ? error : new Error("MongoDB connection failed.");
  }

  const friendlyError = new Error(
    "Invalid MONGODB_URI. MongoDB credentials in connection strings must be URL-encoded. Keep MONGO_APP_PASSWORD raw, but percent-encode it in MONGODB_URI, or use only letters and numbers in the Mongo app password."
  );
  friendlyError.cause = error;
  return friendlyError;
}

export function getMongoUri() {
  const uri = cleanString(process.env.MONGODB_URI);

  if (!uri) {
    throw new Error("Missing MONGODB_URI.");
  }

  return uri;
}

export function getMongoDbName() {
  const dbName = cleanString(process.env.MONGODB_DB);

  if (!dbName) {
    throw new Error("Missing MONGODB_DB.");
  }

  return dbName;
}

export function hasMongoConfig() {
  return Boolean(
    cleanString(process.env.MONGODB_URI) && cleanString(process.env.MONGODB_DB)
  );
}

export function createMongoClient() {
  try {
    return new MongoClient(getMongoUri());
  } catch (error) {
    throw normalizeMongoError(error);
  }
}

export async function getMongoClient() {
  if (cachedClient) return cachedClient;

  const client = createMongoClient();
  try {
    await client.connect();
  } catch (error) {
    throw normalizeMongoError(error);
  }

  cachedClient = client;
  return cachedClient;
}

export async function getDb() {
  if (cachedDb) return cachedDb;

  const client = await getMongoClient();
  cachedDb = client.db(getMongoDbName());
  return cachedDb;
}
