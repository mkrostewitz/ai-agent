import {MongoClient} from "mongodb";

let cachedClient = null;
let cachedDb = null;

export async function getMongoClient() {
  const {MONGODB_URI} = process.env;

  if (!MONGODB_URI) {
    throw new Error("Missing MONGODB_URI.");
  }

  if (cachedClient) return cachedClient;

  cachedClient = new MongoClient(MONGODB_URI);
  await cachedClient.connect();
  return cachedClient;
}

export async function getDb() {
  const {MONGODB_DB} = process.env;

  if (!MONGODB_DB) {
    throw new Error("Missing MONGODB_DB.");
  }

  if (cachedDb) return cachedDb;

  const client = await getMongoClient();
  cachedDb = client.db(MONGODB_DB);
  return cachedDb;
}
